import { prisma } from "@/lib/prisma";
import { localDayBounds, isoWeekdayOfYmd } from "@/lib/timezone";

/**
 * Ensures a ServiceVisit exists for every active route stop scheduled to run
 * on the given calendar day, for the given organization. Idempotent — safe to call
 * on every dashboard load; it only creates visits that don't already exist
 * for that recurringStopId + day.
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

  const routes = await prisma.recurringRoute.findMany({
    where: { organizationId, active: true, dayOfWeek: isoWeekday },
    include: { stops: { orderBy: { sortOrder: "asc" } } },
  });
  if (!routes.length) return;

  for (const route of routes) {
    for (const stop of route.stops) {
      if (!stop.bodyOfWaterId) continue; // visits require a body of water

      const existing = await prisma.serviceVisit.findFirst({
        where: {
          recurringStopId: stop.id,
          scheduledStart: { gte: dayStart, lt: dayEnd },
        },
        select: { id: true },
      });
      if (existing) continue;

      // dayStart is already the correct UTC instant for local midnight (see
      // localDayBounds) -- offsetting it with .getTime() arithmetic, not .setHours(),
      // keeps that instant intact instead of reinterpreting it in the server's own
      // (UTC) clock.
      const scheduledStart = new Date(dayStart.getTime() + (stop.etaOffsetMinutes ?? 0) * 60_000);

      await prisma.serviceVisit.create({
        data: {
          organizationId,
          propertyId: stop.propertyId,
          bodyOfWaterId: stop.bodyOfWaterId,
          technicianId: route.technicianId,
          recurringStopId: stop.id,
          routeSequence: stop.sortOrder,
          scheduledStart,
          status: "SCHEDULED",
        },
      });
    }
  }
}
