import { describe, expect, it } from "vitest";
import { addMonthsToYmd, daysInMonthOfYmd, monthGridWeeks, startOfMonthYmd } from "@/lib/timezone";

describe("startOfMonthYmd", () => {
  it("snaps to the first of the month", () => {
    expect(startOfMonthYmd("2026-09-26")).toBe("2026-09-01");
    expect(startOfMonthYmd("2026-09-01")).toBe("2026-09-01");
  });
});

describe("daysInMonthOfYmd", () => {
  it("handles 31, 30 and February", () => {
    expect(daysInMonthOfYmd("2026-01-15")).toBe(31);
    expect(daysInMonthOfYmd("2026-09-26")).toBe(30);
    expect(daysInMonthOfYmd("2026-02-10")).toBe(28);
  });

  it("handles a leap February", () => {
    expect(daysInMonthOfYmd("2028-02-10")).toBe(29);
  });
});

describe("addMonthsToYmd", () => {
  it("steps forward and back from the 1st", () => {
    expect(addMonthsToYmd("2026-09-26", 1)).toBe("2026-10-01");
    expect(addMonthsToYmd("2026-09-26", -1)).toBe("2026-08-01");
  });

  it("crosses year boundaries", () => {
    expect(addMonthsToYmd("2026-12-05", 1)).toBe("2027-01-01");
    expect(addMonthsToYmd("2026-01-05", -1)).toBe("2025-12-01");
  });

  it("never lands on a day the target month lacks", () => {
    // The bug this guards: month arithmetic on the 31st overflowing into March.
    expect(addMonthsToYmd("2026-01-31", 1)).toBe("2026-02-01");
  });
});

describe("monthGridWeeks", () => {
  it("pads to whole Monday-first weeks", () => {
    const weeks = monthGridWeeks("2026-09-26");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // 1 Sep 2026 is a Tuesday, so one leading blank.
    expect(weeks[0][0]).toBeNull();
    expect(weeks[0][1]).toBe("2026-09-01");
  });

  it("contains every day of the month exactly once, in order", () => {
    const days = monthGridWeeks("2026-09-26").flat().filter((d): d is string => d !== null);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe("2026-09-01");
    expect(days[29]).toBe("2026-09-30");
    expect(new Set(days).size).toBe(30);
  });

  it("spills no neighbouring-month dates into the blanks", () => {
    for (const day of monthGridWeeks("2026-09-26").flat()) {
      if (day !== null) expect(day.startsWith("2026-09")).toBe(true);
    }
  });

  it("needs no leading blanks when the 1st is a Monday", () => {
    // 1 Jun 2026 is a Monday.
    expect(monthGridWeeks("2026-06-15")[0][0]).toBe("2026-06-01");
  });
});
