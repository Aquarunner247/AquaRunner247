import { describe, it, expect } from "vitest";
import { ymdInTimeZone, localDayBounds, addDaysToYmd, isoWeekdayOfYmd, startOfWeekYmd } from "@/lib/timezone";

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
