/**
 * Projects the recurring route template forward onto calendar days, without creating
 * anything. Prisma-free and unit-tested here, same as lib/route-ordering.ts.
 *
 * This exists because ServiceVisit rows are generated lazily -- ensureVisitsGeneratedForDate
 * only runs for a day someone has actually loaded (see its doc comment). So a month grid
 * can't just count visits: most future days have no rows at all. Calling the generator for
 * every day of a month instead would materialise a month of visits as a side effect of
 * looking at a calendar, which is why the month view projects rather than generates.
 *
 * Deliberately mirrors what ensureVisitsGeneratedForDate would do -- active routes matching
 * the weekday, inside their startsOn/endsOn window -- including that it ignores
 * RecurringRoute.frequency. A BIWEEKLY route generates every week in practice, so
 * projecting it every other week would show a schedule the app won't actually produce.
 */
import { isoWeekdayOfYmd } from "@/lib/timezone";

export type ProjectableRoute = {
  dayOfWeek: number | null;
  /** @db.Date columns, i.e. UTC midnight of a calendar date. Null = unbounded. */
  startsOn: Date | null;
  endsOn: Date | null;
  stopCount: number;
};

/** True when `ymd` falls inside the route's inclusive service window. */
export function routeRunsOnYmd(route: ProjectableRoute, ymd: string): boolean {
  if (route.dayOfWeek !== isoWeekdayOfYmd(ymd)) return false;

  // Compared at UTC midnight, matching how @db.Date round-trips -- not against a local-day
  // instant, which would shift boundary days by the org's offset.
  const dayUtc = new Date(`${ymd}T00:00:00.000Z`).getTime();
  if (route.startsOn && route.startsOn.getTime() > dayUtc) return false;
  if (route.endsOn && route.endsOn.getTime() < dayUtc) return false;
  return true;
}

/** Total stops the template would put on `ymd` across every supplied route. */
export function projectedStopsForYmd(routes: ProjectableRoute[], ymd: string): number {
  return routes.reduce((sum, route) => (routeRunsOnYmd(route, ymd) ? sum + route.stopCount : sum), 0);
}

/**
 * Prisma filter fragment for "this route can still take new work as of `ymd`". A route
 * whose endsOn has passed will never generate another visit, so it must not be offered by
 * Smart Route Placement or accepted by assignNewCustomerToRoute. A route that hasn't
 * started yet IS offerable -- assigning a customer to a route beginning next month is a
 * normal thing to want.
 */
export function routeStillRunsFilter(ymd: string) {
  const dayUtc = new Date(`${ymd}T00:00:00.000Z`);
  return { OR: [{ endsOn: null }, { endsOn: { gte: dayUtc } }] };
}
