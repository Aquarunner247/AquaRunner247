import { addDaysToYmd, isoWeekdayOfYmd, localDayBounds, ymdInTimeZone } from "@/lib/timezone";

/**
 * Moving a stop to the next day, for the case a technician cannot do it today at all.
 *
 * Pure so the date arithmetic and the refusal rules can be tested without a request.
 */

/**
 * The same position on the next day this technician actually works.
 *
 * ServiceVisit.scheduledStart is NOT a wall-clock time -- lib/visit-generation.ts builds it as
 * local midnight plus the recurring stop's etaOffsetMinutes, i.e. a same-day sort anchor (see
 * startOfLocalDay's own comment). So moving it means the same offset from a different day's
 * midnight, resolved through the zone rather than by adding 24 hours.
 *
 * Going through localDayBounds for each day separately is what makes a DST boundary harmless: a
 * 23- or 25-hour day still puts the stop at the same point within its own day.
 *
 * `workingWeekdays` is ISO (Mon=1 .. Sun=7) and comes from the technician's OWN active recurring
 * routes, not the organization's. One technician here runs Monday to Saturday while another runs
 * Friday and Sunday, so "the next day we work" is a different question per person: a Saturday stop
 * moves to Monday for the first and to Sunday for the second.
 *
 * An empty set means nothing is known about who works when -- a technician with no active routes,
 * or a visit with nobody assigned. That falls through to the next calendar day rather than
 * refusing, because a stop that cannot be moved at all is worse than one moved to a day its
 * technician might not work.
 */
export function nextWorkingDayAnchor(
  scheduledStart: Date,
  timeZone: string,
  workingWeekdays: ReadonlySet<number>,
): Date {
  const ymd = ymdInTimeZone(scheduledStart, timeZone);
  const offsetIntoDay = scheduledStart.getTime() - localDayBounds(ymd, timeZone).start.getTime();

  let targetYmd = addDaysToYmd(ymd, 1);
  if (workingWeekdays.size > 0) {
    // At most a full week: whatever the set contains, one of the next seven days matches, and the
    // bound means a malformed set can never spin.
    for (let i = 0; i < 7 && !workingWeekdays.has(isoWeekdayOfYmd(targetYmd)); i++) {
      targetYmd = addDaysToYmd(targetYmd, 1);
    }
  }

  return new Date(localDayBounds(targetYmd, timeZone).start.getTime() + offsetIntoDay);
}

export type MoveRefusal =
  /** Already done. Nothing to move, and moving it would unpick the customer's record. */
  | "ALREADY_COMPLETED"
  /**
   * Readings, chemicals or photos are already on this visit.
   *
   * The compliance log buckets a reading by its visit's completedAt (lib/reading-log-days.ts), so
   * carrying today's work onto tomorrow's visit would file it under tomorrow -- the exact symptom
   * fixed on 2026-10-02, when readings taken after 5pm were landing on the next day. Finish the
   * visit so today's work is logged today, or skip it; do not silently re-date it.
   */
  | "WORK_ALREADY_RECORDED";

export type VisitMoveState = {
  status: string;
  hasReading: boolean;
  doseCount: number;
  photoCount: number;
};

export function refusalForMove(visit: VisitMoveState): MoveRefusal | null {
  if (visit.status === "COMPLETED") return "ALREADY_COMPLETED";
  if (visit.hasReading || visit.doseCount > 0 || visit.photoCount > 0) return "WORK_ALREADY_RECORDED";
  return null;
}

export const MOVE_REFUSAL_MESSAGE: Record<MoveRefusal, string> = {
  ALREADY_COMPLETED: "This visit is already completed, so there is nothing to move.",
  WORK_ALREADY_RECORDED:
    "Readings or chemicals are already recorded here. Finish the visit so today's work is logged today, or skip it instead.",
};
