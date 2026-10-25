import { describe, expect, it } from "vitest";
import {
  abandonedStopDecision,
  formatOpenDuration,
  ABANDONED_AFTER_HOURS,
  type AbandonedStopCandidate,
} from "@/lib/abandoned-stop";

/**
 * The thresholds here come from production as it stood on 2026-10-25:
 *
 *   finished normally        377 visits   median 44 min    p90  3.6 hours
 *   arrived, never finished   68 visits   open for weeks
 *
 * So the cases that matter are the boundary (a long but legitimate job must not alert) and the
 * several ways a stop can look open without anybody needing to be told.
 */

const NOW = new Date("2026-10-25T20:00:00Z");
const HOUR = 60 * 60 * 1000;

function visit(openHours: number, overrides: Partial<AbandonedStopCandidate> = {}): AbandonedStopCandidate {
  return {
    status: "IN_PROGRESS",
    startedAt: new Date(NOW.getTime() - openHours * HOUR),
    completedAt: null,
    pushedAt: null,
    abandonedAlertSentAt: null,
    technicianId: "tech-1",
    ...overrides,
  };
}

describe("abandonedStopDecision", () => {
  it("alerts once a stop has been open past the threshold", () => {
    const d = abandonedStopDecision(visit(5), NOW);
    expect(d.alert).toBe(true);
    if (d.alert) expect(d.openHours).toBeCloseTo(5, 5);
  });

  it("stays quiet through a long but legitimate job", () => {
    // p90 of visits that DO get finished is 3.6 hours. Anything under the threshold is still
    // plausibly someone working.
    for (const hours of [0.1, 1, 3, 3.6, 3.99]) {
      expect(abandonedStopDecision(visit(hours), NOW), `${hours}h`).toEqual({
        alert: false,
        reason: "too-soon",
      });
    }
  });

  it("alerts exactly at the threshold, not a moment after", () => {
    // The sweep runs hourly, so a stop that lands precisely on the boundary on one run and past
    // it on the next must not fall through both.
    expect(abandonedStopDecision(visit(ABANDONED_AFTER_HOURS), NOW).alert).toBe(true);
  });

  it("says nothing about a stop that was finished", () => {
    expect(abandonedStopDecision(visit(9, { completedAt: NOW, status: "COMPLETED" }), NOW)).toEqual({
      alert: false,
      reason: "not-in-progress",
    });
    // Belt and braces: completedAt set while the status somehow still reads IN_PROGRESS.
    expect(abandonedStopDecision(visit(9, { completedAt: NOW }), NOW)).toEqual({
      alert: false,
      reason: "already-finished",
    });
  });

  it("says nothing about a stop nobody ever arrived at", () => {
    // pushedAt is stamped on these too -- a scheduled stop that never happened -- which is why
    // "pushed" on its own is not the signal this alert is built on.
    expect(abandonedStopDecision(visit(9, { startedAt: null, status: "SCHEDULED" }), NOW)).toEqual({
      alert: false,
      reason: "not-in-progress",
    });
  });

  it("defers to the nightly sweep once it has given up on the stop", () => {
    // The day is over and the customer summary has gone. Telling someone to go back now is
    // worse than silence -- and this is what stops the whole historical backlog alerting at
    // once the first time the cron runs.
    expect(abandonedStopDecision(visit(30, { pushedAt: NOW }), NOW)).toEqual({
      alert: false,
      reason: "already-pushed",
    });
  });

  it("alerts once and then never again", () => {
    const v = visit(5);
    expect(abandonedStopDecision(v, NOW).alert).toBe(true);
    const alerted = { ...v, abandonedAlertSentAt: NOW };
    expect(abandonedStopDecision(alerted, NOW)).toEqual({ alert: false, reason: "already-alerted" });
    // Still quiet an hour later, when the hourly sweep comes round again.
    expect(abandonedStopDecision(alerted, new Date(NOW.getTime() + HOUR))).toEqual({
      alert: false,
      reason: "already-alerted",
    });
  });

  it("skips a stop with no technician, having nobody to ask about", () => {
    expect(abandonedStopDecision(visit(9, { technicianId: null }), NOW)).toEqual({
      alert: false,
      reason: "no-technician",
    });
  });

  it("alerts at most once across a long open stop, checked hourly", () => {
    // Walk a stop left open for a full day the way the cron would, carrying the marker forward.
    let sentAt: Date | null = null;
    const startedAt = new Date(NOW.getTime());
    const firedAt: number[] = [];
    for (let hour = 0; hour <= 24; hour++) {
      const at = new Date(startedAt.getTime() + hour * HOUR);
      const d = abandonedStopDecision(
        { status: "IN_PROGRESS", startedAt, completedAt: null, pushedAt: null, abandonedAlertSentAt: sentAt, technicianId: "t" },
        at,
      );
      if (d.alert) {
        firedAt.push(hour);
        sentAt = at;
      }
    }
    expect(firedAt).toEqual([ABANDONED_AFTER_HOURS]);
  });
});

describe("formatOpenDuration", () => {
  it("reads naturally at the sizes this actually produces", () => {
    expect(formatOpenDuration(0.5)).toBe("under an hour");
    expect(formatOpenDuration(1.2)).toBe("1 hour");
    expect(formatOpenDuration(4)).toBe("4 hours");
    expect(formatOpenDuration(23.9)).toBe("23 hours");
    expect(formatOpenDuration(25)).toBe("more than a day");
    expect(formatOpenDuration(72)).toBe("more than 3 days");
  });
});
