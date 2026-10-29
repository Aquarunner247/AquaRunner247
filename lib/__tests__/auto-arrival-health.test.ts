import { describe, expect, it } from "vitest";
import {
  autoArrivalHealth,
  autoArrivalPercent,
  techniciansNeedingAttention,
  AUTO_ARRIVAL_MIN_SAMPLE,
  type ArrivalCounts,
} from "@/lib/auto-arrival-health";

/**
 * The numbers here are the real ones from production on 2026-10-29, because they are what the
 * thresholds were chosen against and a synthetic example would not have caught the sample-size
 * problem.
 */

const counts = (name: string, arrivals: number, gpsArrivals: number): ArrivalCounts => ({
  technicianId: name.toLowerCase(),
  technicianName: name,
  arrivals,
  gpsArrivals,
});

const RODRIGO = counts("Rodrigo", 187, 26); // 14%
const RICH = counts("Rich", 93, 7); //          8%
const STEVE = counts("Steve", 7, 6); //        86%, on seven arrivals

describe("autoArrivalHealth", () => {
  it("flags the two technicians whose automatic arrival is barely working", () => {
    expect(autoArrivalHealth(RODRIGO)).toBe("low");
    expect(autoArrivalHealth(RICH)).toBe("low");
  });

  it("says nothing about a technician with too few arrivals to judge", () => {
    // Steve's 86% is on seven arrivals -- one bad week swings it to 40%. A number that moves
    // that far on one stop should not be put in front of somebody as a finding.
    expect(autoArrivalHealth(STEVE)).toBe("too-few");
  });

  it("separates nothing-at-all from merely-low", () => {
    // Zero is a phone that is not doing it, which is fixable in a settings screen. Low is
    // usually a route full of pump rooms.
    expect(autoArrivalHealth(counts("Zero", 40, 0))).toBe("none");
    expect(autoArrivalHealth(counts("Some", 40, 15))).toBe("low");
  });

  it("passes a technician whose automatic arrival is working", () => {
    expect(autoArrivalHealth(counts("Good", 40, 30))).toBe("good");
    // Exactly at the threshold counts as working -- a real route loses fixes underground, and a
    // rule that flagged half the company forever would be ignored within a week.
    expect(autoArrivalHealth(counts("Half", 40, 20))).toBe("good");
  });

  it("treats the sample floor as a floor, not a target", () => {
    expect(autoArrivalHealth(counts("Just under", AUTO_ARRIVAL_MIN_SAMPLE - 1, 0))).toBe("too-few");
    expect(autoArrivalHealth(counts("Just at", AUTO_ARRIVAL_MIN_SAMPLE, 0))).toBe("none");
  });
});

describe("autoArrivalPercent", () => {
  it("matches the production figures", () => {
    expect(autoArrivalPercent(RODRIGO)).toBe(14);
    expect(autoArrivalPercent(RICH)).toBe(8);
  });

  it("does not divide by zero", () => {
    expect(autoArrivalPercent(counts("Nobody", 0, 0))).toBe(0);
  });
});

describe("techniciansNeedingAttention", () => {
  it("lists only the ones worth acting on, worst first", () => {
    const out = techniciansNeedingAttention([RODRIGO, RICH, STEVE, counts("Fine", 50, 45)]);
    expect(out.map((c) => c.technicianName)).toEqual(["Rich", "Rodrigo"]);
  });

  it("puts a technician with no automatic arrivals above a merely low one", () => {
    const out = techniciansNeedingAttention([counts("Low", 40, 15), counts("Zero", 40, 0)]);
    expect(out[0].technicianName).toBe("Zero");
  });

  it("is empty when everybody is fine, so the card can hide itself", () => {
    expect(techniciansNeedingAttention([counts("A", 40, 40), STEVE])).toEqual([]);
  });
});
