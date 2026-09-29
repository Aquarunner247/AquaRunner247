import { describe, expect, it } from "vitest";
import { serviceWindowExclusionBounds, ymdOfDateColumn } from "@/lib/route-service-window";
import { localDayBounds } from "@/lib/timezone";

/** How Prisma hands back a `@db.Date` column, and how parseDateFieldOrNull builds one. */
function dateColumn(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** How lib/visit-generation.ts stores a generated visit: local midnight as a UTC instant,
 *  plus the stop's etaOffsetMinutes. Not wall-clock time. */
function scheduledStart(ymd: string, timeZone: string, etaOffsetMinutes: number): Date {
  return new Date(localDayBounds(ymd, timeZone).start.getTime() + etaOffsetMinutes * 60_000);
}

const PACIFIC = "America/Los_Angeles";

describe("ymdOfDateColumn", () => {
  it("reads the calendar day off a UTC-midnight date column", () => {
    expect(ymdOfDateColumn(dateColumn("2026-10-02"))).toBe("2026-10-02");
  });
});

describe("serviceWindowExclusionBounds", () => {
  it("excludes nothing when the window is unbounded on both sides", () => {
    expect(serviceWindowExclusionBounds(null, null, PACIFIC)).toEqual({ before: null, after: null });
  });

  it("excludes nothing on a side that is unbounded", () => {
    const { before, after } = serviceWindowExclusionBounds(dateColumn("2026-10-02"), null, PACIFIC);
    expect(before).toBeInstanceOf(Date);
    expect(after).toBeNull();
  });

  /**
   * The bug this fixes, with the operator's real numbers: a Friday route given
   * startsOn 2026-10-02 still showed its 11 stops on Friday 2026-09-25, because those visits
   * had already been generated before the window was set.
   */
  it("excludes a visit generated a week before the window opens", () => {
    const { before } = serviceWindowExclusionBounds(dateColumn("2026-10-02"), null, PACIFIC);
    const strayVisit = scheduledStart("2026-09-25", PACIFIC, 0);
    expect(strayVisit.getTime()).toBeLessThan(before!.getTime());
  });

  it("keeps the earliest and latest visit on the opening day itself", () => {
    const { before } = serviceWindowExclusionBounds(dateColumn("2026-10-02"), null, PACIFIC);
    // 0 and 80 minutes bracket the real offsets seen in production (07:00-08:20 UTC).
    for (const offset of [0, 80, 24 * 60 - 1]) {
      expect(scheduledStart("2026-10-02", PACIFIC, offset).getTime()).toBeGreaterThanOrEqual(before!.getTime());
    }
  });

  it("keeps the last visit of the closing day and excludes the next day", () => {
    const { after } = serviceWindowExclusionBounds(null, dateColumn("2026-10-02"), PACIFIC);
    expect(scheduledStart("2026-10-02", PACIFIC, 24 * 60 - 1).getTime()).toBeLessThan(after!.getTime());
    expect(scheduledStart("2026-10-03", PACIFIC, 0).getTime()).toBeGreaterThanOrEqual(after!.getTime());
  });

  /**
   * The reason this goes through localDayBounds at all. Comparing scheduledStart against the
   * raw @db.Date value would put the boundary at UTC midnight, 7 hours before the org's local
   * midnight -- so the opening day's own early-morning visits would sort BEFORE it and be
   * deleted as out-of-window. Guards against "re-saving the window wiped the first day".
   */
  it("does not delete the opening day's visits, which a raw date compare would", () => {
    const startsOn = dateColumn("2026-10-02");
    const { before } = serviceWindowExclusionBounds(startsOn, null, PACIFIC);
    const firstVisitOfOpeningDay = scheduledStart("2026-10-02", PACIFIC, 25);

    expect(firstVisitOfOpeningDay.getTime()).toBeGreaterThanOrEqual(before!.getTime());
    // The naive comparison this replaces would have excluded it.
    expect(firstVisitOfOpeningDay.getTime()).toBeGreaterThan(startsOn.getTime());
    expect(before!.getTime()).toBeGreaterThan(startsOn.getTime());
  });

  it("shifts the boundary with the org's own zone rather than the server's", () => {
    const startsOn = dateColumn("2026-10-02");
    const pacific = serviceWindowExclusionBounds(startsOn, null, PACIFIC).before!;
    const eastern = serviceWindowExclusionBounds(startsOn, null, "America/New_York").before!;
    // Eastern midnight happens 3 hours earlier than Pacific midnight.
    expect(pacific.getTime() - eastern.getTime()).toBe(3 * 60 * 60 * 1000);
  });

  it("handles a window that opens and closes on the same day", () => {
    const day = dateColumn("2026-10-02");
    const { before, after } = serviceWindowExclusionBounds(day, day, PACIFIC);
    const onTheDay = scheduledStart("2026-10-02", PACIFIC, 60);
    expect(onTheDay.getTime()).toBeGreaterThanOrEqual(before!.getTime());
    expect(onTheDay.getTime()).toBeLessThan(after!.getTime());
  });

  it("puts the boundary at local midnight across a DST change", () => {
    // 2026-11-01 is the US DST fall-back; the window opens the day after it.
    const { before } = serviceWindowExclusionBounds(dateColumn("2026-11-02"), null, PACIFIC);
    expect(before!.toISOString()).toBe("2026-11-02T08:00:00.000Z"); // PST, UTC-8
    const beforeDst = serviceWindowExclusionBounds(dateColumn("2026-10-30"), null, PACIFIC).before!;
    expect(beforeDst.toISOString()).toBe("2026-10-30T07:00:00.000Z"); // PDT, UTC-7
  });
});
