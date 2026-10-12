/**
 * What a completion should record as the arrival time when the server never saw one.
 *
 * Pure so the window checks below are testable without a request. Three callers' worth of context:
 *
 *  - Normally arrival is its own PATCH and the server already has startedAt. Nothing here applies.
 *
 *  - A technician with no signal gets an arrival card that fails, and the form deliberately starts
 *    the stop locally anyway -- a pump room must never be a place work cannot happen. Their real
 *    arrival time exists only on the device, so completion carries it and this accepts it.
 *
 *  - A client that supplies nothing never arrived at all. That is the 13-20% of visits that used to
 *    be filled in and completed with no arrival, and it is what the gate exists to stop.
 *
 * The supplied time is checked rather than trusted: it comes from a device clock, and backfilling a
 * nonsense arrival is worse than refusing, because the service report prints time on site from it.
 */

/** A visit longer than this did not happen in one stop -- the longest real one measured here is
 *  about two hours, so this is generous rather than tight. */
export const MAX_PLAUSIBLE_VISIT_MS = 12 * 60 * 60 * 1000;

/** A device clock running slightly fast must not look like an arrival after the completion. */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

export type ArrivalBackfill =
  | { kind: "use"; startedAt: Date }
  | { kind: "refuse" };

export function resolveMissingArrival(rawClientStartedAt: unknown, completedAt: Date): ArrivalBackfill {
  if (typeof rawClientStartedAt !== "string" || rawClientStartedAt.trim() === "") return { kind: "refuse" };

  const parsed = new Date(rawClientStartedAt);
  if (Number.isNaN(parsed.getTime())) return { kind: "refuse" };

  // After completion (beyond clock skew) is incoherent, not merely odd.
  if (parsed.getTime() > completedAt.getTime() + CLOCK_SKEW_TOLERANCE_MS) return { kind: "refuse" };

  // Older than a working day means a stale value carried across days, not this visit's arrival.
  if (completedAt.getTime() - parsed.getTime() > MAX_PLAUSIBLE_VISIT_MS) return { kind: "refuse" };

  // A device a few minutes ahead would otherwise record an arrival in the future; clamp instead of
  // refusing, since the work plainly happened.
  return { kind: "use", startedAt: parsed.getTime() > completedAt.getTime() ? completedAt : parsed };
}
