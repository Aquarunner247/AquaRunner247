import { formatLocalDate, formatLocalTime, ymdInTimeZone } from "@/lib/timezone";

/**
 * How a previously-recorded reading is described to the technician standing at the pool.
 *
 * "When" is two labels, not one. The relative label ("Yesterday", "6 days ago") is what a
 * technician actually needs -- whether this number is still worth comparing against -- and the
 * absolute one is what they need when it is older than that, or when the office asks later.
 */
export type ReadingRecency = {
  relative: string;
  absolute: string;
  /** Days between that reading's local calendar day and today's. 0 = same day. */
  daysAgo: number;
};

/**
 * Which timestamp genuinely says when a reading was taken, and whether it carries a time of day.
 *
 * ServiceVisit.scheduledStart is deliberately NOT a wall-clock time -- it is local midnight plus
 * etaOffsetMinutes, a same-day sort anchor (lib/visit-generation.ts). Rendering its clock reading
 * would tell a technician a reading was taken at 12:04am. So it is used for the DATE only, and
 * only when nothing better exists, which is the case for every imported logbook row.
 */
export function readingTakenAt(source: {
  capturedAt?: Date | null;
  completedAt?: Date | null;
  scheduledStart: Date;
}): { at: Date; hasTimeOfDay: boolean } {
  if (source.capturedAt) return { at: source.capturedAt, hasTimeOfDay: true };
  if (source.completedAt) return { at: source.completedAt, hasTimeOfDay: true };
  return { at: source.scheduledStart, hasTimeOfDay: false };
}

/** Whole calendar days between two instants, counted in `timeZone` -- not elapsed hours. A
 *  reading at 9pm and one at 7am the next morning are "yesterday" and "today", 10 hours apart. */
export function calendarDaysBetween(earlier: Date, later: Date, timeZone: string): number {
  const toUtcMidnight = (date: Date) => {
    const [y, m, d] = ymdInTimeZone(date, timeZone).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtcMidnight(later) - toUtcMidnight(earlier)) / 86_400_000);
}

export function describeRecency(
  takenAt: Date,
  hasTimeOfDay: boolean,
  now: Date,
  timeZone: string,
): ReadingRecency {
  const daysAgo = calendarDaysBetween(takenAt, now, timeZone);
  const date = formatLocalDate(takenAt, timeZone, { weekday: "short" });
  // The year matters once a reading is old enough to be from a previous season -- the imported
  // logbooks here go back to 2024, and "Mon, Sep 23" alone is genuinely ambiguous on those.
  const absolute =
    daysAgo >= 180
      ? `${formatLocalDate(takenAt, timeZone, { weekday: "short", year: "numeric" })}`
      : hasTimeOfDay
        ? `${date} at ${formatLocalTime(takenAt, timeZone)}`
        : date;

  if (daysAgo <= 0) return { relative: "Earlier today", absolute, daysAgo };
  if (daysAgo === 1) return { relative: "Yesterday", absolute, daysAgo };
  if (daysAgo < 7) return { relative: `${daysAgo} days ago`, absolute, daysAgo };
  if (daysAgo < 14) return { relative: "Last week", absolute, daysAgo };
  if (daysAgo < 60) return { relative: `${Math.round(daysAgo / 7)} weeks ago`, absolute, daysAgo };
  if (daysAgo < 365) return { relative: `${Math.round(daysAgo / 30)} months ago`, absolute, daysAgo };
  // Years once it is a year old. The imported logbooks reach back to 2024, and "25 months ago" is
  // both harder to read and sillier than "2 years ago".
  const years = Math.round(daysAgo / 365);
  return { relative: `${years} year${years === 1 ? "" : "s"} ago`, absolute, daysAgo };
}

/**
 * Where a previously-recorded reading came from, when that is not an ordinary service visit.
 *
 * Worth saying on the screen. A technician comparing today's pH against a number the property's
 * own maintenance person logged, or against a row typed in from a paper logbook, should know that
 * -- those were not taken with this company's test kit.
 */
export type ReadingProvenance = "SERVICE" | "IMPORTED" | "PORTAL";

export function readingProvenance(visit: {
  logOnlyRecord: boolean;
  loggedByCustomerUserId: string | null;
}): ReadingProvenance {
  if (visit.loggedByCustomerUserId) return "PORTAL";
  if (visit.logOnlyRecord) return "IMPORTED";
  return "SERVICE";
}

export const PROVENANCE_NOTE: Record<ReadingProvenance, string | null> = {
  SERVICE: null,
  IMPORTED: "from the imported logbook",
  PORTAL: "logged by the property",
};
