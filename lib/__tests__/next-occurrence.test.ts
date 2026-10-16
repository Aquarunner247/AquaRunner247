import { describe, it, expect } from "vitest";
import { nextOccurrenceYmd } from "@/lib/service-weekdays";
import { isoWeekdayOfYmd } from "@/lib/timezone";

// 2026-10-16 is a Friday (ISO 5).
const FRIDAY = "2026-10-16";

describe("nextOccurrenceYmd", () => {
  it("is today when today is that weekday", () => {
    expect(isoWeekdayOfYmd(FRIDAY)).toBe(5);
    expect(nextOccurrenceYmd(FRIDAY, 5)).toBe(FRIDAY);
  });

  it("resolves forward within the week", () => {
    expect(nextOccurrenceYmd(FRIDAY, 6)).toBe("2026-10-17"); // Saturday
  });

  it("wraps into the following week", () => {
    expect(nextOccurrenceYmd(FRIDAY, 1)).toBe("2026-10-19"); // Monday
    expect(nextOccurrenceYmd(FRIDAY, 4)).toBe("2026-10-22"); // Thursday
  });

  it("crosses a month boundary", () => {
    expect(nextOccurrenceYmd("2026-10-29", 1)).toBe("2026-11-02");
  });

  it("crosses a year boundary", () => {
    expect(nextOccurrenceYmd("2026-12-31", 5)).toBe("2027-01-01");
  });

  it("always lands on the weekday asked for", () => {
    for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
      expect(isoWeekdayOfYmd(nextOccurrenceYmd(FRIDAY, weekday))).toBe(weekday);
    }
  });

  it("never looks backwards", () => {
    for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
      expect(nextOccurrenceYmd(FRIDAY, weekday) >= FRIDAY).toBe(true);
    }
  });
});
