import { describe, expect, it } from "vitest";
import {
  departureDecision,
  nextAwaySince,
  isAwayFix,
  awaitsDeparture,
  dayNeedsLocationWatch,
  DEPARTURE_MARGIN_METERS,
  DEPARTURE_SUSTAINED_MS,
  DEPARTURE_WATCH_GRACE_MS,
  type DepartureCandidate,
  type WatchCandidate,
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
    expect(departureDecision(visit({ startedAt: null }), far)).toEqual({ depart: false, reason: "never-arrived" });
    expect(departureDecision(visit({ departedAt: NOW }), far)).toEqual({ depart: false, reason: "already-departed" });
  });

  it("still reports a departure from a stop that was already completed", () => {
    // The normal visit, and the case this feature existed for without serving: the technician
    // taps Complete at the pool and then drives away. Treating the tap as the end of the watch
    // meant a visit that went WELL never recorded a departure -- 13 arrivals and 8 completions
    // in production on the first full day produced zero of them.
    const d = departureDecision(visit({ completedAt: NOW }), at(RADIUS + DEPARTURE_MARGIN_METERS + 500, LONG_AGO));
    expect(d.depart).toBe(true);
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

/**
 * The watch window -- why the last stop of the day never recorded a departure.
 *
 * These lock in the fix for a bug that was invisible in the detection logic above, because the
 * logic was right: the watcher was simply switched off before it could run. route-day-view.tsx
 * tore it down as soon as every stop read COMPLETED or CANCELLED, and the last stop reads
 * COMPLETED while the technician is still standing at the pool. No further fixes, so the dwell
 * never elapsed, so no departure -- which looked for months like Android killing the app.
 *
 * The pull in the other direction is battery: every "false" below is a case where keeping GPS and
 * Android's persistent tracking notification alive would cost a technician their phone for
 * nothing.
 */
describe("awaitsDeparture", () => {
  const NOON = new Date("2026-11-24T12:00:00Z");
  const base: WatchCandidate = {
    status: "COMPLETED",
    startedAt: new Date("2026-11-24T11:30:00Z"),
    completedAt: new Date("2026-11-24T11:55:00Z"),
    departedAt: null,
    latitude: 36.1,
    longitude: -115.2,
  };

  it("keeps watching a completed stop that has not been left yet -- the whole bug", () => {
    expect(awaitsDeparture(base, NOON)).toBe(true);
  });

  it("stops once the departure is recorded", () => {
    expect(awaitsDeparture({ ...base, departedAt: new Date("2026-11-24T11:58:00Z") }, NOON)).toBe(false);
  });

  it("never watches a stop that was never arrived at", () => {
    expect(awaitsDeparture({ ...base, status: "SCHEDULED", startedAt: null, completedAt: null }, NOON)).toBe(false);
  });

  it("never watches a cancelled stop, even one that was arrived at", () => {
    expect(awaitsDeparture({ ...base, status: "CANCELLED" }, NOON)).toBe(false);
  });

  it("never watches an unpinned venue, which could never conclude anything", () => {
    // departureDecision returns "no-pin" on every fix for the rest of the day, so holding the
    // watcher open for this would drain the phone to no purpose whatsoever.
    expect(awaitsDeparture({ ...base, latitude: null, longitude: null }, NOON)).toBe(false);
  });

  it("gives up after the grace window rather than tracking until midnight", () => {
    const justInside = new Date(base.completedAt!.getTime() + DEPARTURE_WATCH_GRACE_MS - 1000);
    const justOutside = new Date(base.completedAt!.getTime() + DEPARTURE_WATCH_GRACE_MS + 1000);
    expect(awaitsDeparture(base, justInside)).toBe(true);
    expect(awaitsDeparture(base, justOutside)).toBe(false);
  });

  it("does not time out a stop still being worked, however long it takes", () => {
    // A long stop must not stop being watched just because it ran past the grace window -- that
    // window is about waiting for someone to drive off, not about how long a pool takes.
    const longStop: WatchCandidate = { ...base, status: "IN_PROGRESS", completedAt: null };
    const hoursLater = new Date(base.startedAt!.getTime() + 5 * 60 * 60 * 1000);
    expect(awaitsDeparture(longStop, hoursLater)).toBe(true);
  });

  it("is still bounded for a COMPLETED row with no completedAt", () => {
    // Defensive: nothing should produce this, but an unbounded path here is a phone tracked all
    // night, so the grace window falls back to arrival rather than to forever.
    const noFinish: WatchCandidate = { ...base, completedAt: null };
    const wayLater = new Date(base.startedAt!.getTime() + DEPARTURE_WATCH_GRACE_MS + 60_000);
    expect(awaitsDeparture(noFinish, wayLater)).toBe(false);
  });
});

describe("dayNeedsLocationWatch", () => {
  const NOON = new Date("2026-11-24T12:00:00Z");
  const completedAwaitingDeparture: WatchCandidate = {
    status: "COMPLETED",
    startedAt: new Date("2026-11-24T11:30:00Z"),
    completedAt: new Date("2026-11-24T11:55:00Z"),
    departedAt: null,
    latitude: 36.1,
    longitude: -115.2,
  };
  const settled: WatchCandidate = { ...completedAwaitingDeparture, departedAt: new Date("2026-11-24T11:58:00Z") };
  const upcoming: WatchCandidate = {
    status: "SCHEDULED",
    startedAt: null,
    completedAt: null,
    departedAt: null,
    latitude: 36.2,
    longitude: -115.3,
  };

  it("THE REGRESSION: a day whose every stop is complete still needs the watcher if a departure is open", () => {
    // This is the exact state that broke it. The old check was `every(COMPLETED || CANCELLED)`,
    // which is true here, so the watcher was removed and the departure could never be detected.
    expect(dayNeedsLocationWatch([settled, completedAwaitingDeparture], NOON)).toBe(true);
  });

  it("stands down once every departure is settled", () => {
    expect(dayNeedsLocationWatch([settled, settled], NOON)).toBe(false);
  });

  it("keeps watching while there is still a stop to arrive at", () => {
    expect(dayNeedsLocationWatch([settled, upcoming], NOON)).toBe(true);
  });

  it("stands down on a day of skipped stops", () => {
    const cancelled: WatchCandidate = { ...upcoming, status: "CANCELLED" };
    expect(dayNeedsLocationWatch([cancelled, cancelled], NOON)).toBe(false);
  });

  it("stands down on an empty day rather than tracking a technician who has no route", () => {
    expect(dayNeedsLocationWatch([], NOON)).toBe(false);
  });
});
