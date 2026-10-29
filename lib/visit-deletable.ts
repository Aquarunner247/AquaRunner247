/**
 * Whether a stop may be deleted outright, rather than skipped.
 *
 * Skipping is the right answer almost always: a stop the route put on the day and nobody
 * serviced is a fact, and "Skipped" is the honest record of it. Deleting that would erase a
 * miss from the day's numbers, which is the opposite of what this product is for.
 *
 * But a stop somebody added BY HAND and immediately regretted is a different thing. Nothing was
 * scheduled, nothing was missed, and marking it Skipped records work that was never meant to
 * exist -- which is exactly what happened on 2026-10-29, when a double-tap on Add stop put three
 * identical OYO stops on a technician's day and the only tool available would have left three
 * misleading skips behind. Undoing it took a hand-written DELETE against production.
 *
 * So deletion is allowed in precisely the case that mistake creates, and refused everywhere else.
 * Every refusal below is a thing that would otherwise be destroyed quietly.
 *
 * Pure, so each rule is testable without a database -- same reason lib/departure-detection.ts and
 * lib/abandoned-stop.ts are.
 */

export type DeletableVisit = {
  /** Set when the scheduler generated this visit. */
  recurringStopId: string | null;
  /** Set when a staff member created it by hand (ServiceVisit.createdById). */
  createdById: string | null;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  /** Readings, chemical doses and photos attached to this visit. */
  childRecordCount: number;
  /** Set when this row is where another day's visit was moved TO. */
  movedFromId: string | null;
};

export type DeletionRefusal =
  | "on-the-route"
  | "not-hand-added"
  | "work-recorded"
  | "already-started"
  | "is-a-move";

/** Something a person can act on, not a code to look up. */
export const DELETION_REFUSAL_MESSAGE: Readonly<Record<DeletionRefusal, string>> = {
  "on-the-route":
    "This stop comes from the route, so deleting it would erase a scheduled visit from the day's record. Skip it instead.",
  "not-hand-added":
    "Only a stop somebody added by hand can be deleted. Skip this one instead.",
  "work-recorded":
    "There are readings, chemicals or photos on this stop. Deleting it would destroy them.",
  "already-started":
    "A technician has already arrived at this stop. Skip it instead, so the day keeps an honest record.",
  "is-a-move":
    "This stop is where another day's visit was moved to. Deleting it would leave that one pointing at nothing.",
};

/**
 * Null when the visit may be deleted, otherwise why not.
 *
 * Ordered so the reason a person sees is the most useful one. "It is on the route" explains more
 * than "it has no creator", and a generated visit is both.
 */
export function visitDeletionRefusal(visit: DeletableVisit): DeletionRefusal | null {
  // The scheduler put it there. Skipping is what records that it did not happen.
  if (visit.recurringStopId != null) return "on-the-route";

  // No creator means it predates createdById, or came from the portal, or a CSV import. None of
  // those is a hand-add somebody is undoing, and guessing wrong deletes a real record.
  if (visit.createdById == null) return "not-hand-added";

  // The landing side of a move. The original row points here and reads "Moved"; delete this and
  // that original describes a day that no longer exists.
  if (visit.movedFromId != null) return "is-a-move";

  // Work exists. This is the one that would actually destroy something a customer paid for.
  if (visit.childRecordCount > 0) return "work-recorded";

  // Arrived at, finished, or closed out. A stop somebody stood at is a record, however it got
  // onto the day.
  if (visit.startedAt != null || visit.completedAt != null) return "already-started";
  if (visit.status !== "SCHEDULED") return "already-started";

  return null;
}

/** Whether to offer the action at all, from what a list row already knows. */
export function looksHandAdded(visit: { recurringStopId: string | null; createdById: string | null }): boolean {
  return visit.recurringStopId == null && visit.createdById != null;
}
