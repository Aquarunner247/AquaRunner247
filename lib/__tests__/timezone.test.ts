import { describe, it, expect } from "vitest";
import { ymdInTimeZone, localDayBounds, addDaysToYmd, isoWeekdayOfYmd, startOfWeekYmd, hasUtcOffset } from "@/lib/timezone";

const PACIFIC = "America/Los_Angeles";

describe("ymdInTimeZone", () => {
  it("reads the calendar day in the target zone, not UTC", () => {
    // 2026-09-21 01:00 UTC is still 2026-09-20 evening in Pacific (UTC-7 in September).
    const date = new Date("2026-09-21T01:00:00Z");
    expect(ymdInTimeZone(date, PACIFIC)).toBe("2026-09-20");
    expect(ymdInTimeZone(date, "UTC")).toBe("2026-09-21");
  });
});

describe("localDayBounds", () => {
  it("returns the UTC instant range for a local calendar day", () => {
    const { start, end } = localDayBounds("2026-09-21", PACIFIC);
    // Pacific midnight on 2026-09-21 is 07:00 UTC that day (PDT, UTC-7).
    expect(start.toISOString()).toBe("2026-09-21T07:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-22T07:00:00.000Z");
  });

  it("round-trips with ymdInTimeZone at the boundary instants", () => {
    const { start, end } = localDayBounds("2026-09-21", PACIFIC);
    expect(ymdInTimeZone(start, PACIFIC)).toBe("2026-09-21");
    expect(ymdInTimeZone(new Date(end.getTime() - 1), PACIFIC)).toBe("2026-09-21");
    expect(ymdInTimeZone(end, PACIFIC)).toBe("2026-09-22");
  });
});

describe("addDaysToYmd", () => {
  it("adds and subtracts days across month/year boundaries", () => {
    expect(addDaysToYmd("2026-09-21", 1)).toBe("2026-09-22");
    expect(addDaysToYmd("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysToYmd("2027-01-01", -1)).toBe("2026-12-31");
  });
});

describe("isoWeekdayOfYmd", () => {
  it("returns Mon=1..Sun=7 independent of timezone", () => {
    // 2026-09-21 is a Monday.
    expect(isoWeekdayOfYmd("2026-09-21")).toBe(1);
    expect(isoWeekdayOfYmd("2026-09-27")).toBe(7); // Sunday
  });
});

describe("startOfWeekYmd", () => {
  it("resolves to the Monday of the containing week", () => {
    expect(startOfWeekYmd("2026-09-21")).toBe("2026-09-21"); // already Monday
    expect(startOfWeekYmd("2026-09-27")).toBe("2026-09-21"); // Sunday -> prior Monday
    expect(startOfWeekYmd("2026-09-23")).toBe("2026-09-21"); // Wednesday -> that week's Monday
  });
});

describe("hasUtcOffset", () => {
  it("accepts a Z-terminated instant, which is what toISOString produces", () => {
    expect(hasUtcOffset("2026-09-29T15:30:00.000Z")).toBe(true);
    expect(hasUtcOffset("2026-09-29T15:30:00Z")).toBe(true);
    expect(hasUtcOffset("2026-09-29T15:30:00z")).toBe(true);
  });

  it("accepts a numeric offset, with or without a colon", () => {
    expect(hasUtcOffset("2026-09-29T08:30:00-07:00")).toBe(true);
    expect(hasUtcOffset("2026-09-29T08:30:00-0700")).toBe(true);
    expect(hasUtcOffset("2026-09-29T08:30:00+05:30")).toBe(true);
  });

  /**
   * The exact string the visit form used to send, and the whole reason this exists: parsed as the
   * server's own local time (UTC on Vercel), a Pacific wall clock landed 7 hours off.
   */
  it("rejects a bare wall clock with no zone", () => {
    expect(hasUtcOffset("2026-09-29T08:30:00")).toBe(false);
    expect(hasUtcOffset("2026-09-29T08:30")).toBe(false);
  });

  /** The date's own hyphens must not read as a negative offset. */
  it("does not mistake the date's hyphens for an offset", () => {
    expect(hasUtcOffset("2026-09-29T08:30:00")).toBe(false);
    expect(hasUtcOffset("2026-09-29")).toBe(false);
  });

  it("rejects strings with no time portion at all", () => {
    expect(hasUtcOffset("")).toBe(false);
    expect(hasUtcOffset("2026-09-29")).toBe(false);
    expect(hasUtcOffset("not a date")).toBe(false);
  });
});

/**
 * How the CSV importer and the visit form both store a wall-clock time read off a paper log or typed
 * on a phone: local midnight in the business's zone, plus the minutes into that day.
 *
 * The bug this guards against is `new Date(y, m, d, h, min)`, which resolves against the RUNTIME's
 * zone -- UTC on Vercel. That stored a logged 8:30am as 08:30 UTC and displayed it back as 1:30am,
 * and it dated every timeless imported row to noon UTC, which is 5am local.
 */
describe("storing a logged wall-clock time", () => {
  const PACIFIC = "America/Los_Angeles";

  function storedInstant(ymd: string, hours: number, minutes: number): Date {
    return new Date(localDayBounds(ymd, PACIFIC).start.getTime() + (hours * 60 + minutes) * 60_000);
  }

  it("round-trips 8:30am on a winter date", () => {
    // 2026-01-28 is PST (UTC-8), so 08:30 local is 16:30 UTC.
    const stored = storedInstant("2026-01-28", 8, 30);
    expect(stored.toISOString()).toBe("2026-01-28T16:30:00.000Z");
  });

  it("round-trips 8:30am on a summer date, shifting with DST", () => {
    // 2026-07-14 is PDT (UTC-7), so 08:30 local is 15:30 UTC -- an hour earlier than in January.
    const stored = storedInstant("2026-07-14", 8, 30);
    expect(stored.toISOString()).toBe("2026-07-14T15:30:00.000Z");
  });

  it("puts a timeless row at local noon, not noon UTC", () => {
    // The importer's fallback for a row with a backwash but no time. Noon UTC would have been 5am
    // local, which reads as a backwash before anyone arrived.
    const noon = storedInstant("2026-01-28", 12, 0);
    expect(noon.toISOString()).toBe("2026-01-28T20:00:00.000Z");
    expect(noon.toISOString()).not.toBe("2026-01-28T12:00:00.000Z");
  });

  it("keeps a late-evening time on the same local day", () => {
    // 23:00 local is already tomorrow in UTC; the local calendar day must not shift with it.
    const stored = storedInstant("2026-07-14", 23, 0);
    expect(stored.toISOString()).toBe("2026-07-15T06:00:00.000Z");
    expect(ymdInTimeZone(stored, PACIFIC)).toBe("2026-07-14");
  });
});
