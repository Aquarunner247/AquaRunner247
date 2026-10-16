import { describe, it, expect } from "vitest";
import {
  calendarDaysBetween,
  describeRecency,
  readingProvenance,
  readingTakenAt,
} from "@/lib/last-reading";

const LV = "America/Los_Angeles";

describe("readingTakenAt", () => {
  const scheduledStart = new Date("2026-10-14T07:00:00.000Z");

  it("prefers the moment the reading was captured", () => {
    const capturedAt = new Date("2026-10-14T16:12:00.000Z");
    expect(readingTakenAt({ capturedAt, completedAt: null, scheduledStart })).toEqual({
      at: capturedAt,
      hasTimeOfDay: true,
    });
  });

  it("falls back to completion when nothing was captured", () => {
    const completedAt = new Date("2026-10-14T17:30:00.000Z");
    expect(readingTakenAt({ capturedAt: null, completedAt, scheduledStart })).toEqual({
      at: completedAt,
      hasTimeOfDay: true,
    });
  });

  /**
   * The whole reason this helper exists. scheduledStart is local midnight + etaOffsetMinutes --
   * a sort anchor, not a clock reading -- so an imported logbook row must contribute its DATE and
   * never its time, or the screen claims the reading was taken at 12:04am.
   */
  it("uses scheduledStart for the date only, never as a time of day", () => {
    const result = readingTakenAt({ capturedAt: null, completedAt: null, scheduledStart });
    expect(result.at).toEqual(scheduledStart);
    expect(result.hasTimeOfDay).toBe(false);
  });
});

describe("calendarDaysBetween", () => {
  /** Calendar days, not elapsed hours: 10 hours apart but either side of midnight is 1 day. */
  it("counts the day boundary, not the gap", () => {
    const evening = new Date("2026-10-13T21:00:00.000Z"); // 2pm Tue in Las Vegas
    const nextMorning = new Date("2026-10-14T14:00:00.000Z"); // 7am Wed
    expect(calendarDaysBetween(evening, nextMorning, LV)).toBe(1);
  });

  it("is zero within one local day", () => {
    const morning = new Date("2026-10-14T15:00:00.000Z");
    const evening = new Date("2026-10-15T02:00:00.000Z"); // still 7pm Tue in Las Vegas
    expect(calendarDaysBetween(morning, evening, LV)).toBe(0);
  });

  /** A late-evening Pacific instant is already the next day in UTC -- counting in UTC would
   *  report this reading as a day older than it is. */
  it("counts in the business's timezone, not UTC", () => {
    const lateEvening = new Date("2026-10-15T05:00:00.000Z"); // 10pm Tue Oct 14 in Las Vegas
    const nextAfternoon = new Date("2026-10-15T20:00:00.000Z"); // 1pm Wed Oct 15
    expect(calendarDaysBetween(lateEvening, nextAfternoon, LV)).toBe(1);
  });

  it("spans months", () => {
    expect(calendarDaysBetween(new Date("2026-09-21T18:00:00.000Z"), new Date("2026-10-15T18:00:00.000Z"), LV)).toBe(24);
  });
});

describe("describeRecency", () => {
  const now = new Date("2026-10-15T18:00:00.000Z"); // 11am Thu Oct 15, Las Vegas

  function relative(takenAt: string, hasTimeOfDay = true) {
    return describeRecency(new Date(takenAt), hasTimeOfDay, now, LV).relative;
  }

  it("names today and yesterday rather than counting", () => {
    expect(relative("2026-10-15T15:00:00.000Z")).toBe("Earlier today");
    expect(relative("2026-10-14T16:00:00.000Z")).toBe("Yesterday");
  });

  it("counts days inside the week", () => {
    expect(relative("2026-10-12T16:00:00.000Z")).toBe("3 days ago");
  });

  it("rounds to weeks and months as it gets older", () => {
    expect(relative("2026-10-07T16:00:00.000Z")).toBe("Last week");
    expect(relative("2026-09-21T16:00:00.000Z")).toBe("3 weeks ago");
    expect(relative("2026-07-01T16:00:00.000Z")).toBe("4 months ago");
  });

  it("switches to years rather than counting past a dozen months", () => {
    expect(relative("2024-09-23T07:00:00.000Z", false)).toBe("2 years ago");
    expect(relative("2025-09-01T07:00:00.000Z", false)).toBe("1 year ago");
    // Just under a year still counts in months, which is the more useful unit there.
    expect(relative("2025-10-20T07:00:00.000Z", false)).toBe("12 months ago");
  });

  it("includes the time of day when there is a real one", () => {
    expect(describeRecency(new Date("2026-10-14T16:12:00.000Z"), true, now, LV).absolute).toMatch(/9:12/);
  });

  /** An imported logbook row has no time -- showing one would be inventing it. */
  it("omits the time of day when the source has none", () => {
    const absolute = describeRecency(new Date("2026-10-14T07:00:00.000Z"), false, now, LV).absolute;
    expect(absolute).not.toMatch(/:/);
    expect(absolute).toMatch(/Oct/);
  });

  /** The imported logbooks reach back to 2024, where "Mon, Sep 23" alone is ambiguous. */
  it("adds the year once a reading is old enough to be from another season", () => {
    expect(describeRecency(new Date("2024-09-23T07:00:00.000Z"), false, now, LV).absolute).toMatch(/2024/);
  });

  it("reports daysAgo alongside the labels", () => {
    expect(describeRecency(new Date("2026-10-14T16:00:00.000Z"), true, now, LV).daysAgo).toBe(1);
  });
});

describe("readingProvenance", () => {
  it("is an ordinary service visit by default", () => {
    expect(readingProvenance({ logOnlyRecord: false, loggedByCustomerUserId: null })).toBe("SERVICE");
  });

  it("recognizes an imported logbook row", () => {
    expect(readingProvenance({ logOnlyRecord: true, loggedByCustomerUserId: null })).toBe("IMPORTED");
  });

  /** Portal rows always carry logOnlyRecord too, so the customer check has to win. */
  it("recognizes a reading the property logged itself", () => {
    expect(readingProvenance({ logOnlyRecord: true, loggedByCustomerUserId: "cu_1" })).toBe("PORTAL");
  });
});
