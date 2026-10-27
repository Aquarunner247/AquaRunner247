/**
 * "Why is this stop on this day, when the route did not put it here?"
 *
 * A question that took reading raw rows to answer on 2026-10-26: four Borgata venues appeared on
 * Rodrigo's Monday list for a property serviced Tuesday, Thursday and Saturday. The recurring
 * routes were correct; somebody had added the stops by hand that morning, most likely to catch up
 * a Saturday that was never completed. Nothing on the screen said so, and nothing in the database
 * named the person -- the only tell was that the hand-add path writes local midnight into
 * `scheduledStart` while generation writes the route's real ETA.
 *
 * `ServiceVisit.createdById` fixed the naming half. This turns the row into the one line an admin
 * needs on the schedule, and it is pure so the rules are testable without a database.
 *
 * Kept deliberately silent rather than speculative: a stop this cannot explain gets no line at
 * all. A wrong explanation on a schedule is worse than none, because the next person reads it as
 * fact and stops looking.
 */

export type VisitOriginInput = {
  /** Resolved display name of the staff member who created the row, null when nobody did. */
  createdByName: string | null;
  /** Set when the scheduler generated this visit from a recurring stop. */
  recurringStopId: string | null;
  /** Set when this row is where another day's visit was moved TO. */
  movedFromId: string | null;
};

/**
 * The line to show, or null for "nothing worth saying".
 *
 * Order matters. A generated visit is explained by its own route and needs no line even if a
 * `createdById` somehow exists on it. A move is checked before a hand-add because the reschedule
 * path sets both: `movedFrom` is the more specific truth, and "Added by hand" would misdescribe a
 * stop the office deliberately pushed to a different day.
 */
export function visitOriginLabel({ createdByName, recurringStopId, movedFromId }: VisitOriginInput): string | null {
  // On the route. The schedule already explains it.
  if (recurringStopId != null) return null;

  const by = createdByName ? ` · ${createdByName}` : "";

  if (movedFromId != null) return `Moved here${by}`;

  if (createdByName) return `Added by hand${by}`;

  // Nothing to say, honestly. Three ways to land here, and none of them supports a claim:
  // a row written before createdById existed, a portal reading (which carries
  // loggedByCustomerUserId instead), or a staff member since deleted from the organization --
  // ServiceVisit.createdById is ON DELETE SET NULL, because service history has to outlive the
  // person who entered it.
  return null;
}
