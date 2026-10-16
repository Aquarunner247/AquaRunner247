import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { addDaysToYmd, localDayBounds, timeZoneForState, ymdInTimeZone } from "@/lib/timezone";
import { mergeRouteOrderIntoDay } from "@/lib/route-order-merge";

type ReorderPayload = { stopIds?: string[] };

export async function PATCH(request: Request, context: { params: Promise<{ routeId: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (appUser.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { routeId } = await context.params;
  const body = (await request.json()) as ReorderPayload;
  const stopIds = Array.isArray(body.stopIds) ? body.stopIds : [];
  if (stopIds.length === 0) return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });

  const stops = await prisma.recurringStop.findMany({
    where: { id: { in: stopIds }, routeId, route: { organizationId: appUser.organizationId } },
    select: { id: true },
  });
  if (stops.length !== stopIds.length) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  // Sorted by id before execution, not left in payload order: a $transaction takes its row
  // locks in array order, so two overlapping reorders of the same route would lock the same
  // rows in opposite orders and deadlock, losing one of the drags. Same fix as
  // api/visits/reorder. `index` is captured from the payload position first, so the saved
  // sortOrder is unchanged.
  const updates = stopIds
    .map((id, index) => ({ id, index }))
    .sort((a, b) => a.id.localeCompare(b.id));

  /**
   * The days already generated follow the route, since as of 2026-10-16 the schedule has no
   * Optimize of its own -- reordering here is how a day's order gets set, and drag is the only
   * manual adjustment left.
   *
   * visit-generation copies sortOrder into ServiceVisit.routeSequence once, when it first creates
   * a day's visits. A day is generated the first time anyone opens the schedule for it, which for
   * a recurring route is well before the day arrives, so by the time the route is reordered those
   * rows already exist carrying the old order and nothing revisited them.
   *
   * The whole day is renumbered, not this route's slice of it -- routeSequence is one sequence
   * space per technician per day, shared with errands and with any visit that arrived from
   * elsewhere. Writing only this route's positions is what left four pairs of Rich's Friday stops
   * sharing a number. mergeRouteOrderIntoDay decides the placements and guarantees each item a
   * distinct one; what moves and what stays anchored is documented there.
   *
   * Strictly after today: a day in progress belongs to the technician working it, and renumbering
   * it underneath them is not this screen's business.
   */
  const organization = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { state: true },
  });
  const timeZone = timeZoneForState(organization?.state);
  const tomorrowStart = localDayBounds(addDaysToYmd(ymdInTimeZone(new Date(), timeZone), 1), timeZone).start;

  const ourVisits = await prisma.serviceVisit.findMany({
    where: { recurringStopId: { in: stopIds }, scheduledStart: { gte: tomorrowStart } },
    select: { scheduledStart: true, technicianId: true },
  });

  const visitWrites: { id: string; index: number }[] = [];
  const errandWrites: { id: string; index: number }[] = [];

  if (ourVisits.length > 0) {
    const technicianIds = [...new Set(ourVisits.map((v) => v.technicianId).filter((id): id is string => id != null))];
    const windowStart = new Date(Math.min(...ourVisits.map((v) => v.scheduledStart.getTime())));
    const windowEnd = new Date(Math.max(...ourVisits.map((v) => v.scheduledStart.getTime())) + 86_400_000);
    const touchedDays = new Set(ourVisits.map((v) => `${v.technicianId ?? "none"}|${ymdInTimeZone(v.scheduledStart, timeZone)}`));

    // Every item on those technicians' affected days, both tables, so the day is rebuilt whole.
    const [dayVisits, dayErrands] = await Promise.all([
      prisma.serviceVisit.findMany({
        where: { technicianId: { in: technicianIds }, scheduledStart: { gte: windowStart, lt: windowEnd } },
        select: { id: true, recurringStopId: true, routeSequence: true, scheduledStart: true, technicianId: true, status: true },
      }),
      prisma.adHocStop.findMany({
        where: { technicianId: { in: technicianIds }, scheduledDate: { gte: windowStart, lt: windowEnd } },
        select: { id: true, routeSequence: true, scheduledDate: true, technicianId: true, createdAt: true },
      }),
    ]);

    const newOrder = [...updates].sort((a, b) => a.index - b.index).map(({ id }) => id);
    const byDay = new Map<string, { kind: "visit" | "adhoc"; id: string; seq: number; tiebreak: number; moveKey: string | null }[]>();

    const push = (key: string, row: { kind: "visit" | "adhoc"; id: string; seq: number; tiebreak: number; moveKey: string | null }) => {
      if (!touchedDays.has(key)) return;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(row);
    };

    for (const v of dayVisits) {
      push(`${v.technicianId ?? "none"}|${ymdInTimeZone(v.scheduledStart, timeZone)}`, {
        kind: "visit",
        id: v.id,
        // Same ordering the schedule itself reads with (routeSequence asc, then scheduledStart).
        seq: v.routeSequence ?? Number.MAX_SAFE_INTEGER,
        tiebreak: v.scheduledStart.getTime(),
        // Only a still-scheduled stop of THIS route may be moved; see mergeRouteOrderIntoDay.
        moveKey: v.status === "SCHEDULED" && v.recurringStopId != null && stopIds.includes(v.recurringStopId) ? v.recurringStopId : null,
      });
    }
    for (const e of dayErrands) {
      push(`${e.technicianId ?? "none"}|${ymdInTimeZone(e.scheduledDate, timeZone)}`, {
        kind: "adhoc",
        id: e.id,
        seq: e.routeSequence ?? Number.MAX_SAFE_INTEGER,
        tiebreak: e.createdAt.getTime(),
        moveKey: null,
      });
    }

    for (const rows of byDay.values()) {
      rows.sort((a, b) => a.seq - b.seq || a.tiebreak - b.tiebreak);
      const kindById = new Map(rows.map((r) => [r.id, r.kind]));
      const merged = mergeRouteOrderIntoDay(rows.map(({ id, moveKey }) => ({ id, moveKey })), newOrder);
      merged.forEach((id, index) => {
        const existing = rows.find((r) => r.id === id);
        if (existing && existing.seq === index) return; // already in place -- no write
        (kindById.get(id) === "adhoc" ? errandWrites : visitWrites).push({ id, index });
      });
    }
  }

  await prisma.$transaction([
    ...updates.map(({ id, index }) => prisma.recurringStop.update({ where: { id }, data: { sortOrder: index } })),
    // Sorted by id for the same lock-ordering reason as the stop updates above.
    ...visitWrites.sort((a, b) => a.id.localeCompare(b.id)).map(({ id, index }) => prisma.serviceVisit.update({ where: { id }, data: { routeSequence: index } })),
    ...errandWrites.sort((a, b) => a.id.localeCompare(b.id)).map(({ id, index }) => prisma.adHocStop.update({ where: { id }, data: { routeSequence: index } })),
  ]);

  return NextResponse.json({ ok: true });
}
