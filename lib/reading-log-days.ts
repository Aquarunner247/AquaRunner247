/**
 * Which calendar day a reading belongs to, and which days a month covers -- in the POOL's timezone.
 *
 * Split out of lib/reading-rows.ts so it can be tested without a Prisma client, the same way
 * lib/route-service-window.ts and lib/dose-product-selection.ts were.
 *
 * It exists because this was wrong: the month window came from `new Date(year, monthIndex, 1)` and the
 * day from `completedAt.getDate()`, both of which use the SERVER's zone -- UTC in production. A reading
 * taken at 6pm in Nevada is 01:00 UTC the next day, so it was filed under the following day, and one
 * taken on the last evening of a month fell outside the window and disappeared from the log. Technicians
 * working mornings never hit it; anyone logging readings at the end of a shift hits it daily.
 */
import { localDayBounds, ymdInTimeZone, addMonthsToYmd, daysInMonthOfYmd } from "@/lib/timezone";

export type MonthWindow = {
  /** First instant of the 1st, in the pool's zone. */
  start: Date;
  /** First instant of the 1st of the NEXT month -- exclusive, so no end-of-day arithmetic is needed. */
  endExclusive: Date;
  totalDays: number;
};

export function monthWindowInTimeZone(year: number, monthIndex: number, timeZone: string): MonthWindow {
  const firstOfMonth = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  return {
    start: localDayBounds(firstOfMonth, timeZone).start,
    endExclusive: localDayBounds(addMonthsToYmd(firstOfMonth, 1), timeZone).start,
    totalDays: daysInMonthOfYmd(firstOfMonth),
  };
}

/** The day of the month a reading is logged under, 1-31, in the pool's own zone. */
export function logDayOfMonth(completedAt: Date, timeZone: string): number {
  return Number(ymdInTimeZone(completedAt, timeZone).slice(8, 10));
}

/**
 * One entry per day, and the LAST visit of that day wins -- which is what makes a second reading on a
 * day already serviced read as an update rather than a duplicate line in the log. Both records are
 * kept; only the log collapses them.
 *
 * `visits` must be ordered by completedAt ascending for "last wins" to mean the latest reading.
 */
export function bucketVisitsByLogDay<T extends { completedAt: Date | null }>(
  visits: T[],
  timeZone: string,
): Map<number, T> {
  const byDay = new Map<number, T>();
  for (const visit of visits) {
    if (!visit.completedAt) continue;
    byDay.set(logDayOfMonth(visit.completedAt, timeZone), visit);
  }
  return byDay;
}
