/**
 * Picks the stop a technician should head to after finishing one.
 *
 * Pure, so the "which one is next" rule is testable without a database -- the caller does the
 * query. Both visits and ad-hoc errands share one routeSequence space (see
 * ServiceVisit.routeSequence and AdHocStop.routeSequence), so they are ranked together here rather
 * than the errands being treated as an afterthought again.
 */

export type NextStopCandidate = {
  id: string;
  kind: "visit" | "adhoc";
  /** Shared sequence space. Null sorts last, matching how the schedule pages order these. */
  routeSequence: number | null;
  /** A visit that is COMPLETED or CANCELLED, or an errand already marked done, is behind us. */
  done: boolean;
  /** Tiebreak for two stops sharing a sequence -- creation order, as the schedule pages use. */
  createdAtMs: number;
};

const LAST = Number.MAX_SAFE_INTEGER;

/**
 * The first not-done stop that sits AFTER `justFinishedId` in the day's order.
 *
 * Deliberately positional rather than "the lowest-numbered unfinished stop": a technician who
 * skipped ahead and doubled back should be sent onward, not bounced to something behind them. Falls
 * back to the earliest unfinished stop when nothing follows -- there is still work left, so sending
 * them back for it beats telling them the day is over.
 */
export function pickNextStop<T extends NextStopCandidate>(candidates: T[], justFinishedId: string): T | null {
  const ordered = [...candidates].sort(
    (a, b) => (a.routeSequence ?? LAST) - (b.routeSequence ?? LAST) || a.createdAtMs - b.createdAtMs,
  );

  const finishedIndex = ordered.findIndex((c) => c.id === justFinishedId);
  const after = finishedIndex === -1 ? ordered : ordered.slice(finishedIndex + 1);

  return after.find((c) => !c.done) ?? ordered.find((c) => !c.done && c.id !== justFinishedId) ?? null;
}
