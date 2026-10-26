import { describe, expect, it } from "vitest";
import {
  departureDecision,
  nextAwaySince,
  isAwayFix,
  DEPARTURE_MARGIN_METERS,
  DEPARTURE_SUSTAINED_MS,
  type DepartureCandidate,
} from "@/lib/departure-detection";

/**
 * Two failure modes matter here and they pull in opposite directions.
 *
 * Too eager and the app records a departure while the technician is standing on the deck,
 * which ends up in a customer's report as a service visit shorter than it was. Too reluctant
 * and departure never fires, which is merely the status quo. So the cases below concentrate on
 * the boundary: GPS wander, a walk to the van, and the dwell that separates those from having
 * driven away.
 */

const NOW = new Date("2026-10-25T21:00:00Z");
const ARRIVED = new Date("2026-10-25T20:00:00Z");
const RADIUS = 150;

function visit(overrides: Partial<DepartureCandidate> = {}): DepartureCandidate {
  return {
    startedAt: ARRIVED,
    completedAt: null,
    departedAt: null,
    latitude: 36.1147,
    longitude: -115.2041,
    geofenceMeters: null,
    ...overrides,
  };
}

function at(distanceMeters: number, awaySince: Date | null, now: Date = NOW, accuracyBufferMeters = 0) {
  return { distanceMeters, accuracyBufferMeters, defaultRadiusMeters: RADIUS, awaySince, now };
}

/** Long enough ago that the dwell is satisfied. */
const LONG_AGO = new Date(NOW.getTime() - DEPARTURE_SUSTAINED_MS - 1000);

describe("departureDecision", () => {
  it("reports departure once the technician has been well away for long enough", () => {
    const d = departureDecision(visit(), at(RADIUS + DEPARTURE_MARGIN_METERS + 500, LONG_AGO));
    expect(d.depart).toBe(true);
  });

  it("stays quiet while inside the geofence", () => {
    for (const distance of [0, 50, RADIUS - 1, RADIUS]) {
      expect(departureDecision(visit(), at(distance, LONG_AGO)), `${distance}m`).toEqual({
        depart: false,
        reason: "still-here",
      });
    }
  });

  it("stays quiet in the margin just outside the fence, which is GPS wander", () => {
    // A phone in a pocket on the far side of a deck reports positions that drift past the
    // boundary. Treating that as leaving would shorten real visits in customers' reports.
    for (const over of [1, DEPARTURE_MARGIN_METERS - 1, DEPARTURE_MARGIN_METERS]) {
      expect(departureDecision(visit(), at(RADIUS + over, LONG_AGO)), `+${over}m`).toEqual({
        depart: false,
        reason: "still-here",
      });
    }
  });

  it("widens the threshold by whatever accuracy the phone admits to", () => {
    // A fix the device itself says is vague by 80m must not trigger a departure at 200m.
    const distance = RADIUS + DEPARTURE_MARGIN_METERS + 50;
    expect(departureDecision(visit(), at(distance, LONG_AGO, NOW, 80))).toEqual({
      depart: false,
      reason: "still-here",
    });
    // Same distance, a confident fix: that is a real departure.
    expect(departureDecision(visit(), at(distance, LONG_AGO, NOW, 0)).depart).toBe(true);
  });

  it("will not report a departure the moment someone steps away", () => {
    const far = RADIUS + DEPARTURE_MARGIN_METERS + 500;
    // First away fix: the run has only just begun.
    expect(departureDecision(visit(), at(far, null))).toEqual({ depart: false, reason: "not-long-enough" });
    // Away, but not yet for the full dwell -- a walk to the van and back.
    const almost = new Date(NOW.getTime() - DEPARTURE_SUSTAINED_MS + 1000);
    expect(departureDecision(visit(), at(far, almost))).toEqual({ depart: false, reason: "not-long-enough" });
  });

  it("honours a property's own wider geofence", () => {
    // An admin widens the radius where GPS is unreliable. Departure must use the same number
    // arrival does, or a stop that auto-arrives at 400m would immediately auto-depart.
    const wide = visit({ geofenceMeters: 400 });
    expect(departureDecision(wide, at(300, LONG_AGO))).toEqual({ depart: false, reason: "still-here" });
    expect(departureDecision(wide, at(400 + DEPARTURE_MARGIN_METERS + 10, LONG_AGO)).depart).toBe(true);
  });

  it("says nothing about stops it has no business judging", () => {
    const far = at(RADIUS + DEPARTURE_MARGIN_METERS + 500, LONG_AGO);
    expect(departureDecision(visit({ startedAt: null }), far)).toEqual({ depart: false, reason: "not-in-progress" });
    expect(departureDecision(visit({ completedAt: NOW }), far)).toEqual({ depart: false, reason: "not-in-progress" });
    expect(departureDecision(visit({ departedAt: NOW }), far)).toEqual({ depart: false, reason: "already-departed" });
  });

  it("says nothing about an unpinned venue", () => {
    // No coordinates means no boundary to be outside of. Distance is meaningless here.
    const far = at(99999, LONG_AGO);
    expect(departureDecision(visit({ latitude: null, longitude: null }), far)).toEqual({
      depart: false,
      reason: "no-pin",
    });
  });
});

describe("nextAwaySince", () => {
  it("starts the clock on the first away fix and keeps it running", () => {
    const started = nextAwaySince(null, true, NOW);
    expect(started).toEqual(NOW);
    const later = new Date(NOW.getTime() + 60_000);
    // Still away: the run's START does not move, which is what makes the dwell cumulative.
    expect(nextAwaySince(started, true, later)).toEqual(NOW);
  });

  it("resets the moment a fix lands back inside", () => {
    // This is what makes the dwell a CONTINUOUS absence. Without it, a technician crossing the
    // boundary repeatedly over an afternoon would accumulate three minutes and read as departed.
    expect(nextAwaySince(NOW, false, NOW)).toBeNull();
  });

  it("walking to the van and back never accumulates a departure", () => {
    // out, out, back in, out, out -- never three continuous minutes away.
    let awaySince: Date | null = null;
    let fired = false;
    const pattern = [true, true, false, true, true];
    pattern.forEach((away, i) => {
      const now = new Date(NOW.getTime() + i * 60_000);
      awaySince = nextAwaySince(awaySince, away, now);
      const far = away ? RADIUS + DEPARTURE_MARGIN_METERS + 500 : 10;
      if (departureDecision(visit(), at(far, awaySince, now)).depart) fired = true;
    });
    expect(fired).toBe(false);
  });
});

describe("isAwayFix", () => {
  it("agrees with the decision's own arithmetic", () => {
    const boundary = RADIUS + DEPARTURE_MARGIN_METERS;
    expect(isAwayFix({ distanceMeters: boundary, accuracyBufferMeters: 0, radiusMeters: RADIUS })).toBe(false);
    expect(isAwayFix({ distanceMeters: boundary + 1, accuracyBufferMeters: 0, radiusMeters: RADIUS })).toBe(true);
  });
});
