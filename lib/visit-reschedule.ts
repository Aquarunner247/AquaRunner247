import { addDaysToYmd, localDayBounds, ymdInTimeZone } from "@/lib/timezone";

/**
 * Moving a stop to the next day, for the case a technician cannot do it today at all.
 *
 * Pure so the date arithmetic and the refusal rules can be tested without a request.
 */

/**
 * The same position on tomorrow's route.
 *
 * ServiceVisit.scheduledStart is NOT a wall-clock time -- lib/visit-generation.ts builds it as
 * local midnight plus the recurring stop's etaOffsetMinutes, i.e. a same-day sort anchor (see
 * startOfLocalDay's own comment). So "the next day" means the next local calendar day with that
 * same offset from its midnight, resolved through the zone rather than by adding 24 hours.
 *
 * Going through localDayBounds for both days is what makes a DST boundary harmless: each day's
 * real midnight is resolved separately, so a 23- or 25-hour day still lands the stop at the same
 * point in its own day.
 */
export function nextDayAnchor(scheduledStart: Date, timeZone: string): Date {
  const ymd = ymdInTimeZone(scheduledStart, timeZone);
  const offsetIntoDay = scheduledStart.getTime() - localDayBounds(ymd, timeZone).start.getTime();
  const nextStart = localDayBounds(addDaysToYmd(ymd, 1), timeZone).start;
  return new Date(nextStart.getTime() + offsetIntoDay);
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
