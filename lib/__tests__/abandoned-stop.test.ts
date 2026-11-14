import { describe, expect, it } from "vitest";
import {
  abandonedStopDecision,
  formatOpenDuration,
  formatOnSiteDuration,
  ABANDONED_AFTER_HOURS,
  DEPARTED_GRACE_MINUTES,
  groupAbandonedStopsByProperty,
  splitAbandonedStopsByTechnician,
  type AbandonedStopAlert,
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
    departedAt: null,
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
        {
          status: "IN_PROGRESS",
          startedAt,
          departedAt: null,
          completedAt: null,
          pushedAt: null,
          abandonedAlertSentAt: sentAt,
          technicianId: "t",
        },
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

describe("abandonedStopDecision, once the device records a departure", () => {
  const MIN = 60 * 1000;

  /** Arrived `openHours` ago, left `departedMinutesAgo` ago. */
  function left(openHours: number, departedMinutesAgo: number): AbandonedStopCandidate {
    return visit(openHours, { departedAt: new Date(NOW.getTime() - departedMinutesAgo * MIN) });
  }

  it("alerts well before the four-hour rule would", () => {
    // The whole point: a stop entered at 9:00 and left at 9:25 is reported on the 10:00 sweep,
    // not at 13:00. Here the stop is only 90 minutes old -- "too-soon" under the elapsed rule.
    const d = abandonedStopDecision(left(1.5, 45), NOW);
    expect(d.alert).toBe(true);
    if (d.alert) {
      expect(d.trigger).toBe("departed");
      if (d.trigger === "departed") expect(d.onSiteMinutes).toBeCloseTo(45, 5);
    }
  });

  it("holds off while the technician could still be coming back", () => {
    // A run to the supply house for a chemical leaves the geofence for real. Calling that an
    // abandoned stop would be wrong, and it resolves itself when they return and finish.
    for (const minutesAgo of [0, 1, 10, DEPARTED_GRACE_MINUTES - 1]) {
      expect(abandonedStopDecision(left(1, minutesAgo), NOW), `${minutesAgo}m ago`).toEqual({
        alert: false,
        reason: "departed-too-recently",
      });
    }
  });

  it("alerts the moment the grace period is satisfied, not later", () => {
    const d = abandonedStopDecision(left(1, DEPARTED_GRACE_MINUTES), NOW);
    expect(d.alert).toBe(true);
    if (d.alert) expect(d.trigger).toBe("departed");
  });

  it("still alerts on elapsed time when the departure is too fresh to count", () => {
    // Both rules apply to this stop: open six hours AND just departed. A fresh departure must
    // not suppress an alert the elapsed rule had already earned.
    const d = abandonedStopDecision(left(6, 2), NOW);
    expect(d.alert).toBe(true);
    if (d.alert) expect(d.trigger).toBe("elapsed");
  });

  it("obeys every suppression the elapsed rule obeys", () => {
    // A departure is a reason to alert sooner, never a reason to bypass these. Alerting on a
    // stop the nightly sweep already closed out sends somebody back to finished work.
    const departedAt = new Date(NOW.getTime() - 60 * MIN);
    expect(abandonedStopDecision(visit(1, { departedAt, completedAt: NOW, status: "COMPLETED" }), NOW).alert).toBe(false);
    expect(abandonedStopDecision(visit(1, { departedAt, pushedAt: NOW }), NOW)).toEqual({
      alert: false,
      reason: "already-pushed",
    });
    expect(abandonedStopDecision(visit(1, { departedAt, abandonedAlertSentAt: NOW }), NOW)).toEqual({
      alert: false,
      reason: "already-alerted",
    });
    expect(abandonedStopDecision(visit(1, { departedAt, technicianId: null }), NOW)).toEqual({
      alert: false,
      reason: "no-technician",
    });
  });

  it("never reports a negative time on site", () => {
    // A device with a wrong clock. The API refuses a departure before arrival, but the rule
    // should not produce nonsense if one ever lands.
    const d = abandonedStopDecision(visit(1, { departedAt: new Date(NOW.getTime() - 3 * HOUR) }), NOW);
    expect(d.alert).toBe(true);
    if (d.alert && d.trigger === "departed") expect(d.onSiteMinutes).toBe(0);
  });
});

describe("formatOnSiteDuration", () => {
  it("reads as prose mid-sentence", () => {
    expect(formatOnSiteDuration(0.4)).toBe("less than a minute");
    expect(formatOnSiteDuration(1)).toBe("1 minute");
    expect(formatOnSiteDuration(44)).toBe("44 minutes");
    expect(formatOnSiteDuration(60)).toBe("1 hour");
    expect(formatOnSiteDuration(65)).toBe("1 hour 5 minutes");
    expect(formatOnSiteDuration(125)).toBe("2 hours 5 minutes");
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

/**
 * The grouping, which is what stops one address sending three near-identical emails.
 *
 * `alert` builds the shape the cron assembles: a visit row plus the decision that fired for it.
 * Only the fields the grouping actually reads are set, so a change that starts depending on
 * something else fails here rather than silently working on the real query's wider selection.
 */
function alert(
  propertyId: string,
  overrides: { technicianId?: string | null; openHours?: number; trigger?: "departed" | "elapsed" } = {},
): AbandonedStopAlert<{ id: string; propertyId: string; technicianId: string | null }> {
  const openHours = overrides.openHours ?? 5;
  const trigger = overrides.trigger ?? "elapsed";
  return {
    visit: {
      id: `${propertyId}-${overrides.technicianId ?? "tech-1"}-${openHours}`,
      propertyId,
      technicianId: overrides.technicianId === undefined ? "tech-1" : overrides.technicianId,
    },
    decision:
      trigger === "departed"
        ? { alert: true, trigger: "departed", openHours, onSiteMinutes: 25 }
        : { alert: true, trigger: "elapsed", openHours },
  };
}

describe("groupAbandonedStopsByProperty", () => {
  it("puts every body of water at one address in a single group", () => {
    const groups = groupAbandonedStopsByProperty([
      alert("prop-a", { openHours: 5 }),
      alert("prop-a", { openHours: 4 }),
      alert("prop-a", { openHours: 6 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].propertyId).toBe("prop-a");
    expect(groups[0].stops).toHaveLength(3);
  });

  it("keeps separate addresses separate", () => {
    const groups = groupAbandonedStopsByProperty([alert("prop-a"), alert("prop-b"), alert("prop-a")]);
    expect(groups.map((g) => g.propertyId)).toEqual(["prop-a", "prop-b"]);
    expect(groups.map((g) => g.stops.length)).toEqual([2, 1]);
  });

  it("preserves the order the cron queried in, between groups and inside them", () => {
    // The cron orders by startedAt ascending so the longest-open stop is first, and the email
    // reads stops[0] for the duration it puts in the subject. A Map that reordered would
    // silently understate the oldest stop.
    const groups = groupAbandonedStopsByProperty([
      alert("prop-b", { openHours: 9 }),
      alert("prop-a", { openHours: 7 }),
      alert("prop-b", { openHours: 5 }),
    ]);
    expect(groups.map((g) => g.propertyId)).toEqual(["prop-b", "prop-a"]);
    expect(groups[0].stops.map((s) => s.decision.openHours)).toEqual([9, 5]);
  });

  it("returns nothing when nothing is alerting", () => {
    expect(groupAbandonedStopsByProperty([])).toEqual([]);
  });
});

describe("splitAbandonedStopsByTechnician", () => {
  it("gives one technician their whole property in one bucket", () => {
    const split = splitAbandonedStopsByTechnician([
      alert("prop-a", { openHours: 5 }),
      alert("prop-a", { openHours: 4 }),
    ]);
    expect(split).toHaveLength(1);
    expect(split[0].technicianId).toBe("tech-1");
    expect(split[0].stops).toHaveLength(2);
  });

  it("never tells one technician about another's stop at the same address", () => {
    // A big commercial site split between two people. Each notice has to be about only the
    // stops its recipient actually left open.
    const split = splitAbandonedStopsByTechnician([
      alert("prop-a", { technicianId: "tech-1" }),
      alert("prop-a", { technicianId: "tech-2" }),
      alert("prop-a", { technicianId: "tech-1", openHours: 6 }),
    ]);
    expect(split.map((s) => s.technicianId)).toEqual(["tech-1", "tech-2"]);
    expect(split.map((s) => s.stops.length)).toEqual([2, 1]);
  });

  it("drops a stop with no technician rather than inventing a bucket nobody can be emailed at", () => {
    // abandonedStopDecision already refuses these ("no-technician"), so this is belt and braces
    // for a caller that assembles alerts some other way.
    expect(splitAbandonedStopsByTechnician([alert("prop-a", { technicianId: null })])).toEqual([]);
  });
});
