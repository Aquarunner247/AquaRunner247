import { localDayBounds } from "@/lib/timezone";

/**
 * The instants bounding the days a route's service window EXCLUDES, for clearing visits that
 * were generated before the window was set (see updateRouteWindow).
 *
 * `before` is the first instant of the window's opening local day, so a visit at
 * `scheduledStart < before` runs on an earlier day. `after` is the first instant of the day
 * AFTER the window's closing local day, so `scheduledStart >= after` runs on a later one.
 * Either is null when that side is unbounded, meaning nothing is excluded there.
 *
 * Why this isn't a direct comparison against startsOn/endsOn: those are `@db.Date`, which
 * round-trips as UTC midnight of the calendar date, while `ServiceVisit.scheduledStart` is
 * local midnight expressed as a UTC instant plus etaOffsetMinutes (lib/visit-generation.ts) --
 * a same-day sort key, not wall-clock time. For an org at UTC-7 those two representations of
 * "the same day" sit 7 hours apart, which is more than enough to keep or delete an entire
 * boundary day. Routing both through localDayBounds puts them in the same frame.
 */
export function serviceWindowExclusionBounds(
  startsOn: Date | null,
  endsOn: Date | null,
  timeZone: string,
): { before: Date | null; after: Date | null } {
  return {
    before: startsOn ? localDayBounds(ymdOfDateColumn(startsOn), timeZone).start : null,
    after: endsOn ? localDayBounds(ymdOfDateColumn(endsOn), timeZone).end : null,
  };
}

/** A `@db.Date` column round-trips as UTC midnight, so its calendar day is its ISO date. */
export function ymdOfDateColumn(date: Date): string {
  return date.toISOString().slice(0, 10);
}
