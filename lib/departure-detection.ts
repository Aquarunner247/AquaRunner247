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
  /** Arrival has been stamped; this is a stop in progress. */
  startedAt: Date | null;
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
  | { depart: false; reason: "not-in-progress" | "already-departed" | "no-pin" | "still-here" | "not-long-enough" };

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
  // Only a stop that was arrived at and not finished can be left.
  if (visit.startedAt == null || visit.completedAt != null) return { depart: false, reason: "not-in-progress" };
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
