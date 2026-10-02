import { describe, it, expect } from "vitest";
import { monthWindowInTimeZone, logDayOfMonth, bucketVisitsByLogDay } from "@/lib/reading-log-days";

const LAS_VEGAS = "America/Los_Angeles";

describe("logDayOfMonth", () => {
  /** The regression: 6pm in Nevada is the next day in UTC, and the server runs on UTC. */
  it("files an evening reading under the day it was taken locally", () => {
    const sixPmPdt = new Date("2026-10-02T01:00:00.000Z"); // 2026-10-01 18:00 PDT
    expect(logDayOfMonth(sixPmPdt, LAS_VEGAS)).toBe(1);
    expect(sixPmPdt.getUTCDate()).toBe(2); // what the old code would have used
  });

  it("files an early-morning reading under that same local day", () => {
    expect(logDayOfMonth(new Date("2026-10-15T14:30:00.000Z"), LAS_VEGAS)).toBe(15); // 7:30am PDT
  });

  it("holds up on the standard-time side of the DST change", () => {
    // 2026-11-10 18:00 PST = 2026-11-11 02:00 UTC
    expect(logDayOfMonth(new Date("2026-11-11T02:00:00.000Z"), LAS_VEGAS)).toBe(10);
  });
});

describe("monthWindowInTimeZone", () => {
  it("starts at local midnight, not UTC midnight", () => {
    const { start } = monthWindowInTimeZone(2026, 9, LAS_VEGAS); // October 2026
    expect(start.toISOString()).toBe("2026-10-01T07:00:00.000Z"); // PDT is UTC-7
  });

  it("ends at the start of the next month, exclusively", () => {
    const { endExclusive } = monthWindowInTimeZone(2026, 9, LAS_VEGAS);
    expect(endExclusive.toISOString()).toBe("2026-11-01T07:00:00.000Z");
  });

  /** The other half of the bug: a reading taken on the last evening of the month used to fall past an
   *  end built in the server's zone, and vanished from the log entirely rather than moving a day. */
  it("includes a reading taken on the last evening of the month", () => {
    const { start, endExclusive } = monthWindowInTimeZone(2026, 9, LAS_VEGAS);
    const lastEvening = new Date("2026-11-01T02:00:00.000Z"); // 2026-10-31 19:00 PDT
    expect(lastEvening >= start && lastEvening < endExclusive).toBe(true);
    expect(logDayOfMonth(lastEvening, LAS_VEGAS)).toBe(31);
  });

  it("counts the days of the month it was asked for", () => {
    expect(monthWindowInTimeZone(2026, 9, LAS_VEGAS).totalDays).toBe(31); // October
    expect(monthWindowInTimeZone(2026, 1, LAS_VEGAS).totalDays).toBe(28); // February 2026
    expect(monthWindowInTimeZone(2028, 1, LAS_VEGAS).totalDays).toBe(29); // leap
  });

  it("spans a year boundary", () => {
    const { start, endExclusive } = monthWindowInTimeZone(2026, 11, LAS_VEGAS); // December
    expect(start.toISOString()).toBe("2026-12-01T08:00:00.000Z"); // PST is UTC-8
    expect(endExclusive.toISOString()).toBe("2027-01-01T08:00:00.000Z");
  });
});

describe("bucketVisitsByLogDay", () => {
  const morning = { id: "tech", completedAt: new Date("2026-10-02T16:00:00.000Z") }; // 9am PDT
  const evening = { id: "maintenance", completedAt: new Date("2026-10-03T01:30:00.000Z") }; // 6:30pm PDT, same local day

  /** The behaviour the operator asked for: two readings on one day show as one line, the later one. */
  it("keeps the latest reading of a day, not the first", () => {
    const byDay = bucketVisitsByLogDay([morning, evening], LAS_VEGAS);
    expect(byDay.size).toBe(1);
    expect(byDay.get(2)?.id).toBe("maintenance");
  });

  it("keeps separate days separate", () => {
    const nextDay = { id: "next", completedAt: new Date("2026-10-03T16:00:00.000Z") };
    const byDay = bucketVisitsByLogDay([morning, evening, nextDay], LAS_VEGAS);
    expect(byDay.size).toBe(2);
    expect(byDay.get(2)?.id).toBe("maintenance");
    expect(byDay.get(3)?.id).toBe("next");
  });

  it("ignores a visit with no completion time", () => {
    expect(bucketVisitsByLogDay([{ id: "open", completedAt: null }], LAS_VEGAS).size).toBe(0);
  });
});
