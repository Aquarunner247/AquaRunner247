/**
 * How much of a technician's arrival logging is actually automatic.
 *
 * Measured on production 2026-10-29, over three weeks:
 *
 *   Rodrigo   187 arrivals    26 by GPS   (14%)
 *   Rich       93 arrivals     7 by GPS   ( 8%)
 *   Steve       7 arrivals     6 by GPS   (86%)
 *
 * Automatic arrival is the feature that justifies background location to both app stores, and
 * it was firing on about one arrival in eight. Nothing surfaced that. The office had no way to
 * know, and a technician tapping "I've arrived" every stop has no reason to report it -- the
 * app works, it is just doing none of the thing it promises.
 *
 * The usual cause is a phone setting nobody can see from here: Android grants background
 * location ONLY from its settings screen, so a technician who tapped through the permission
 * prompt has foreground location and believes they are done. Hence this -- the office can see
 * who to go and fix.
 *
 * A GPS arrival is one with arrivalLatitude set (lib/../app/api/visits/[id]/arrival); a manual
 * one has none, because the button records a time and nothing else.
 */

export type ArrivalCounts = {
  technicianId: string;
  technicianName: string;
  /** Stops where somebody logged an arrival at all, in the window. */
  arrivals: number;
  /** Of those, how many carried a position fix. */
  gpsArrivals: number;
};

export type AutoArrivalHealth = "good" | "low" | "none" | "too-few";

/**
 * Below this, automatic arrival is not meaningfully working for that technician.
 *
 * Half is deliberately forgiving. A real route has stops in underground pump rooms and parking
 * structures where no fix lands however the phone is configured, so expecting 100% would flag
 * everybody forever and the signal would be ignored within a week.
 */
export const AUTO_ARRIVAL_LOW_RATIO = 0.5;

/**
 * Fewer arrivals than this says nothing either way.
 *
 * Steve's 86% came from seven arrivals; one bad week would have swung it to 40%. A number that
 * moves that far on one stop is not worth putting in front of somebody.
 */
export const AUTO_ARRIVAL_MIN_SAMPLE = 10;

export function autoArrivalHealth(counts: ArrivalCounts): AutoArrivalHealth {
  if (counts.arrivals < AUTO_ARRIVAL_MIN_SAMPLE) return "too-few";
  if (counts.gpsArrivals === 0) return "none";
  return counts.gpsArrivals / counts.arrivals < AUTO_ARRIVAL_LOW_RATIO ? "low" : "good";
}

/** 0–100, rounded, for display beside the counts rather than instead of them. */
export function autoArrivalPercent(counts: ArrivalCounts): number {
  if (counts.arrivals === 0) return 0;
  return Math.round((counts.gpsArrivals / counts.arrivals) * 100);
}

/**
 * The technicians worth saying something about, worst first.
 *
 * "none" sorts above "low" regardless of volume: a technician with zero automatic arrivals has
 * a phone that is not doing it at all, which is a different and more fixable problem than one
 * whose route is full of pump rooms.
 */
export function techniciansNeedingAttention(all: readonly ArrivalCounts[]): ArrivalCounts[] {
  const rank: Record<AutoArrivalHealth, number> = { none: 0, low: 1, good: 2, "too-few": 3 };
  return all
    .filter((c) => {
      const h = autoArrivalHealth(c);
      return h === "none" || h === "low";
    })
    .sort((a, b) => {
      const byHealth = rank[autoArrivalHealth(a)] - rank[autoArrivalHealth(b)];
      return byHealth !== 0 ? byHealth : autoArrivalPercent(a) - autoArrivalPercent(b);
    });
}
