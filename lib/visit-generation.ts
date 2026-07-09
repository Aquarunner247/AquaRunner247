import { prisma } from "@/lib/prisma";

// Anchor time for the first stop of a route; each stop then offsets from here
// using its etaOffsetMinutes.
const ROUTE_START_HOUR = 0;

/**
 * Ensures a ServiceVisit exists for every active route stop scheduled to run
 * on the given date, for the given organization. Idempotent — safe to call
 * on every dashboard load; it only creates visits that don't already exist
 * for that recurringStopId + day.
 */
export async function ensureVisitsGeneratedForDate(organizationId: string, date: Date) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  // JS getDay(): Sun=0..Sat=6. Our schema uses ISO weekday: Mon=1..Sun=7.
  const isoWeekday = ((date.getDay() + 6) % 7) + 1;

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
          scheduledStart: { gte: dayStart, lte: dayEnd },
        },
        select: { id: true },
      });
      if (existing) continue;

      const scheduledStart = new Date(dayStart);
      scheduledStart.setHours(ROUTE_START_HOUR, 0, 0, 0);
      scheduledStart.setMinutes(scheduledStart.getMinutes() + (stop.etaOffsetMinutes ?? 0));

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
