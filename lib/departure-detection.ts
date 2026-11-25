/**
 * Deciding, on the device, that a technician has left a stop they never finished.
 *
 * The background watcher in app/components/route-day-view.tsx already runs all day with
 * `distanceFilter: 0` and already holds every stop's coordinates and geofence radius, because
 * that is how arrival is detected. This is the mirror image: arrival is "a fix landed inside
 * the radius", departure is "fixes have been outside it for a while".
 *
 * WHY THE HYSTERESIS AND THE DWELL, which are the whole substance of this file:
 *
 * A single fix outside the radius means nothing. Consumer GPS at a pool sits among buildings,
 * wet surfaces and pump-room walls, and a phone in a technician's pocket reports positions that
 * wander tens of metres while it has not moved at all. Treating the first outside fix as a
 * departure would fire while somebody was standing at the edge of the deck.
 *
 * So two conditions, and both have to hold:
 *
 *   1. DISTANCE. Outside the geofence PLUS a margin, so the ordinary wander across the boundary
 *      does not count. The margin is added to the same accuracy buffer arrival already uses, so
 *      a fix the phone itself admits is vague cannot trigger this.
 *   2. TIME. Sustained for a few minutes. A technician walking to the van for a bucket crosses
 *      the boundary and comes back; somebody who has driven away does not.
 *
 * Only the TIMESTAMP of departure is reported to the server, never the position. Where the
 * technician went is not the product's business, and keeping it to a time is what holds the
 * promise in the Privacy Policy small.
 *
 * Kept pure -- no geolocation, no fetch, no React -- so every boundary below is testable
 * without a phone, same reason lib/stop-grouping.ts and lib/trial-reminder.ts are.
 */

/**
 * How far beyond the geofence a fix must be before it counts as "away" at all.
 *
 * 30m on top of the radius and the accuracy buffer. Chosen to sit above ordinary urban GPS
 * wander while staying well inside "has driven off": a van parked on the street outside a
 * property is typically further than this from the pool itself.
 */
export const DEPARTURE_MARGIN_METERS = 30;

/**
 * How long those away-fixes must persist before departure is called.
 *
 * Three minutes. Long enough to outlast a walk to the van, a trip to a pump room on the far
 * side of a building, or a short GPS excursion; short enough that the arrival/departure pair
 * still describes the visit rather than rounding it up.
 */
export const DEPARTURE_SUSTAINED_MS = 3 * 60 * 1000;

export type DepartureCandidate = {
  /** Arrival has been stamped. Without it there is no span to measure and nothing to leave. */
  startedAt: Date | null;
  /**
   * Deliberately NOT a disqualifier.
   *
   * It was one until 2026-10-27, and that quietly gutted the feature: a technician who taps
   * Complete before driving away -- which is the normal case -- stopped being watched at the tap,
   * so no departure was ever recorded for a visit that went well. Production bore it out, 13
   * stops arrived and 8 completed on the first full day, with zero departures.
   *
   * Kept on the type because the caller still needs it for the loitering window in
   * lib/mail/on-site-duration.ts, and because "how long were they there" is a question about
   * presence, which completion does not answer.
   */
  completedAt: Date | null;
  departedAt: Date | null;
  /** Null when the venue was never pinned -- nothing can be concluded from distance. */
  latitude: number | null;
  longitude: number | null;
  /** The venue's own geofence when set, else the caller's default arrival radius. */
  geofenceMeters: number | null;
};

export type DepartureDecision =
  | { depart: true; awayForMs: number }
  | { depart: false; reason: "never-arrived" | "already-departed" | "no-pin" | "still-here" | "not-long-enough" };

/**
 * Whether this stop should be marked departed now.
 *
 * `awaySince` is when the technician was FIRST seen beyond the margin in the current run of
 * away-fixes, which the caller resets to null the moment any fix lands back inside. That reset
 * is what makes the dwell a continuous absence rather than a total.
 */
export function departureDecision(
  visit: DepartureCandidate,
  params: {
    /** Metres from the current fix to the venue. */
    distanceMeters: number;
    /** The reported accuracy of the current fix, already clamped by the caller. */
    accuracyBufferMeters: number;
    /** Default radius for a venue with no geofence of its own. */
    defaultRadiusMeters: number;
    awaySince: Date | null;
    now: Date;
  },
): DepartureDecision {
  // Arrival is the only precondition. A finished stop is still a stop somebody is standing on,
  // and the moment they stop standing on it is exactly what this measures.
  if (visit.startedAt == null) return { depart: false, reason: "never-arrived" };
  if (visit.departedAt != null) return { depart: false, reason: "already-departed" };

  // An unpinned venue has no boundary to be outside of. Saying nothing is correct.
  if (visit.latitude == null || visit.longitude == null) return { depart: false, reason: "no-pin" };

  const radius = visit.geofenceMeters && visit.geofenceMeters > 0 ? visit.geofenceMeters : params.defaultRadiusMeters;
  const awayThreshold = radius + params.accuracyBufferMeters + DEPARTURE_MARGIN_METERS;

  // Inside, or close enough that the phone's own uncertainty could explain it.
  if (params.distanceMeters <= awayThreshold) return { depart: false, reason: "still-here" };

  // Away on this fix, but the run has only just begun.
  if (params.awaySince == null) return { depart: false, reason: "not-long-enough" };

  const awayForMs = params.now.getTime() - params.awaySince.getTime();
  if (awayForMs < DEPARTURE_SUSTAINED_MS) return { depart: false, reason: "not-long-enough" };

  return { depart: true, awayForMs };
}

/**
 * The running "first seen away" marker for one stop, folded forward one fix at a time.
 *
 * Returns the new value: unchanged while still away, `now` when the run starts, and null the
 * moment a fix lands back inside. Separate from departureDecision so the caller can keep this
 * per visit without duplicating the threshold arithmetic.
 */
export function nextAwaySince(
  current: Date | null,
  isAway: boolean,
  now: Date,
): Date | null {
  if (!isAway) return null;
  return current ?? now;
}

/** Whether a fix is beyond the away threshold, using the same arithmetic as the decision. */
export function isAwayFix(params: {
  distanceMeters: number;
  accuracyBufferMeters: number;
  radiusMeters: number;
}): boolean {
  return params.distanceMeters > params.radiusMeters + params.accuracyBufferMeters + DEPARTURE_MARGIN_METERS;
}

/**
 * How long after a stop is finished the location watcher stays up waiting for the departure.
 *
 * Exists to bound the battery cost of the fix below. Thirty minutes covers loading the van,
 * paperwork, or eating lunch in the shade before driving off; past that, a technician still
 * inside the geofence is not meaningfully "departing" that stop any more, and keeping GPS and
 * Android's foreground-service notification alive until midnight is its own bug.
 */
export const DEPARTURE_WATCH_GRACE_MS = 30 * 60 * 1000;

export type WatchCandidate = {
  /** ServiceVisit.status. Only CANCELLED is special here. */
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  departedAt: Date | null;
  /** The venue pin. Null means departure can never be concluded, so it must not hold the watcher. */
  latitude: number | null;
  longitude: number | null;
};

/**
 * Whether this stop still has a departure that the watcher could plausibly observe.
 *
 * Every false branch is a reason the watcher would otherwise run forever for nothing.
 */
export function awaitsDeparture(visit: WatchCandidate, now: Date): boolean {
  // A skipped or moved stop never had presence worth reporting -- same exclusion the watcher
  // itself applies, for the same reason.
  if (visit.status === "CANCELLED") return false;
  // Nothing to leave, and nothing to measure from.
  if (visit.startedAt == null) return false;
  if (visit.departedAt != null) return false;
  // An unpinned venue has no boundary, so departureDecision returns "no-pin" on every fix for
  // the rest of the day. Holding the watcher open for it would drain the phone to no purpose.
  if (visit.latitude == null || visit.longitude == null) return false;

  // Unfinished: the day is not over anyway, so no bound is needed or wanted -- a long stop must
  // not stop being watched just because it ran past the grace window.
  if (visit.status !== "COMPLETED" && visit.completedAt == null) return true;

  // Finished. Bound the wait. Falls back to arrival for the defensive case of a COMPLETED row
  // with no completedAt, so there is no path through here that is unbounded.
  const finishedAt = visit.completedAt ?? visit.startedAt;
  return now.getTime() - finishedAt.getTime() < DEPARTURE_WATCH_GRACE_MS;
}

/**
 * Whether the device should still be watching location for this day's stops.
 *
 * The negation of the old `isDayFullyDone()` in route-day-view.tsx, and the fix for the bug it
 * carried: that check asked only whether every stop was COMPLETED or CANCELLED, which goes true
 * the instant the technician taps Complete on the last stop -- while they are still standing at
 * the pool. The watcher was torn down there, so no further fixes were ever delivered, so the
 * three-minute dwell in departureDecision could never elapse and the last stop of the day could
 * never record a departure. It read like the OS killing a backgrounded app; it was us, minutes
 * earlier, with the app open in their hand.
 *
 * So there are two reasons to keep watching, not one: a stop still to arrive at, or a stop
 * already arrived at whose departure has not been settled yet.
 */
export function dayNeedsLocationWatch(visits: WatchCandidate[], now: Date): boolean {
  const workable = visits.some((v) => v.status !== "COMPLETED" && v.status !== "CANCELLED");
  return workable || visits.some((v) => awaitsDeparture(v, now));
}

/**
 * When the departure actually happened, given the start of the away-run that proved it.
 *
 * The dwell completes a fixed DEPARTURE_SUSTAINED_MS after the first away-fix, so that is the
 * moment to record -- not the moment the deciding fix happened to be delivered, which is what
 * this was until 2026-11-24 and which is wrong in two ways. On a phone with poor signal,
 * delivering fixes every couple of minutes rather than every second, it padded the visit by
 * however long the gap was. And it could not express a departure concluded on a RESUMED dwell at
 * all (lib/departure-watch-state.ts): the app comes back after the process died, finds the run
 * already long enough, and the honest answer is the time the dwell elapsed -- which may be
 * minutes before the app was even running again.
 *
 * Deliberately NOT `awaySince` itself, which is arguably the truer moment they left. Moving to it
 * would shorten every recorded visit by three minutes, changing durations in customers' reports
 * for reasons that have nothing to do with fixing this bug. That is a product decision, separate
 * from this one.
 */
export function departureTimeFor(awaySince: Date): Date {
  return new Date(awaySince.getTime() + DEPARTURE_SUSTAINED_MS);
}
