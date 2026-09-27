import { prisma } from "@/lib/prisma";
import { localDayBounds, isoWeekdayOfYmd } from "@/lib/timezone";

/**
 * Ensures a ServiceVisit exists for every active route stop scheduled to run
 * on the given calendar day, for the given organization, skipping any route whose
 * startsOn/endsOn service window doesn't cover that date. Idempotent — safe to call
 * on every dashboard load; it only creates visits that don't already exist
 * for that recurringStopId + day.
 *
 * Note it does NOT read RecurringRoute.frequency: a BIWEEKLY or CUSTOM route still
 * generates every matching weekday, exactly as WEEKLY does. That predates the service
 * window and is unchanged here -- see the note in lib/dosing-calculator.ts's
 * daysUntilNextVisit, which relies on the same "every week regardless" behavior.
 *
 * `ymd` ("YYYY-MM-DD") + `timeZone` are the org's own local calendar day, resolved by the
 * caller (e.g. via ymdInTimeZone(new Date(), timeZoneForState(org.state))) -- this function
 * used to re-derive its own day boundaries and weekday from a bare Date with
 * .setHours()/.getDay(), which read the SERVER's clock (always UTC on Vercel), not the
 * org's. For roughly 7 hours a day (whenever local time and the UTC calendar date
 * diverge -- e.g. any time after ~5pm Pacific), that generated visits for the wrong day
 * and made the schedule pages look at the wrong day's stops, which is why GPS auto-arrival
 * could appear to silently stop working during that window: the visit list on screen
 * wasn't the technician's actual day.
 */
export async function ensureVisitsGeneratedForDate(organizationId: string, ymd: string, timeZone: string) {
  const { start: dayStart, end: dayEnd } = localDayBounds(ymd, timeZone);
  const isoWeekday = isoWeekdayOfYmd(ymd);

  // A route only runs inside its service window. Both bounds are inclusive and either may
  // be null (no start bound / never ends). startsOn and endsOn are @db.Date, so Prisma
  // hands them back as UTC midnight of that calendar date -- compared against the same
  // representation of `ymd`, NOT against dayStart, which is local midnight expressed as a
  // UTC instant and would be off by the org's offset (enough to include or exclude a whole
  // boundary day).
  const ymdUtcMidnight = new Date(`${ymd}T00:00:00.000Z`);

  const routes = await prisma.recurringRoute.findMany({
    where: {
      organizationId,
      active: true,
      dayOfWeek: isoWeekday,
      AND: [
        { OR: [{ startsOn: null }, { startsOn: { lte: ymdUtcMidnight } }] },
        { OR: [{ endsOn: null }, { endsOn: { gte: ymdUtcMidnight } }] },
      ],
    },
    include: { stops: { orderBy: { sortOrder: "asc" } } },
  });
  if (!routes.length) return;

  // Visits require a body of water.
  const candidates = routes.flatMap((route) =>
    route.stops.filter((stop) => stop.bodyOfWaterId != null).map((stop) => ({ route, stop })),
  );
  if (!candidates.length) return;

  // One existence query for the whole day, not one per stop. This used to loop with an
  // awaited findFirst (and then an awaited create) inside it, so a technician's 11-stop
  // Monday cost 11 sequential round trips through the pooler before the page could render --
  // every single load, since this runs on each schedule view. The week tab called the whole
  // function seven times over, so ~77. Individually the queries are ~1ms; it's the serial
  // round-trip latency that was being paid.
  // Read-then-write, serialized per (org, day) by a transaction-scoped advisory lock.
  //
  // The check and the insert are not atomic, so two overlapping calls for the same day -- a
  // technician opening their schedule while an admin views the same date, entirely normal --
  // can both see "nothing generated" and both insert. The previous per-stop loop had the same
  // race but interleaved, so one caller usually started seeing the other's rows partway
  // through; batching removes that accidental interleaving and would let both insert the full
  // set, i.e. every stop duplicated on the technician's day.
  //
  // There's no unique constraint on (recurringStopId, scheduledStart) to lean on, so
  // createMany's skipDuplicates has nothing to match and can't help here. The lock costs one
  // extra statement and is released on commit; adding that unique index would make this
  // robust without the lock, and is the better long-term fix.
  const lockKey = `aquarunner:visit-generation:${organizationId}:${ymd}`;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const existing = await tx.serviceVisit.findMany({
      where: {
        recurringStopId: { in: candidates.map(({ stop }) => stop.id) },
        scheduledStart: { gte: dayStart, lt: dayEnd },
      },
      select: { recurringStopId: true },
    });
    const alreadyGenerated = new Set(existing.map((visit) => visit.recurringStopId));

    const missing = candidates.filter(({ stop }) => !alreadyGenerated.has(stop.id));
    if (!missing.length) return;

    await tx.serviceVisit.createMany({
      data: missing.map(({ route, stop }) => ({
        organizationId,
        propertyId: stop.propertyId,
        bodyOfWaterId: stop.bodyOfWaterId!,
        technicianId: route.technicianId,
        recurringStopId: stop.id,
        routeSequence: stop.sortOrder,
        // dayStart is already the correct UTC instant for local midnight (see localDayBounds)
        // -- offsetting it with .getTime() arithmetic, not .setHours(), keeps that instant
        // intact instead of reinterpreting it in the server's own (UTC) clock.
        scheduledStart: new Date(dayStart.getTime() + (stop.etaOffsetMinutes ?? 0) * 60_000),
        status: "SCHEDULED" as const,
      })),
    });
  });
}
