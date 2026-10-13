import { describe, expect, it } from "vitest";
import { MOVE_REFUSAL_MESSAGE, nextWorkingDayAnchor, refusalForMove } from "../visit-reschedule";
import { localDayBounds, ymdInTimeZone } from "../timezone";

const TZ = "America/Los_Angeles";
/** Rodrigo and Rich: Monday to Saturday, no Sunday. */
const MON_TO_SAT = new Set([1, 2, 3, 4, 5, 6]);
/** Steve: a Friday route and a Sunday route, nothing else. */
const FRI_AND_SUN = new Set([5, 7]);
/** Every day, for the "does it ever skip when it should not" case. */
const EVERY_DAY = new Set([1, 2, 3, 4, 5, 6, 7]);

/** A stop at `offsetMinutes` into its local day, which is what scheduledStart really encodes. */
const stopOn = (ymd: string, offsetMinutes = 7 * 60 + 25) =>
  new Date(localDayBounds(ymd, TZ).start.getTime() + offsetMinutes * 60_000);

describe("nextWorkingDayAnchor", () => {
  it("moves a weekday stop to the next day", () => {
    // 2026-10-13 is a Tuesday.
    expect(ymdInTimeZone(nextWorkingDayAnchor(stopOn("2026-10-13"), TZ, MON_TO_SAT), TZ)).toBe("2026-10-14");
  });

  it("moves Saturday to Monday for a technician who does not work Sunday", () => {
    // 2026-10-17 is a Saturday.
    expect(ymdInTimeZone(nextWorkingDayAnchor(stopOn("2026-10-17"), TZ, MON_TO_SAT), TZ)).toBe("2026-10-19");
  });

  it("moves Saturday to Sunday for the technician who DOES work Sunday", () => {
    expect(ymdInTimeZone(nextWorkingDayAnchor(stopOn("2026-10-17"), TZ, FRI_AND_SUN), TZ)).toBe("2026-10-18");
  });

  it("goes a whole week out for a technician who works one day", () => {
    // Friday-only: the next day they work really is next Friday. Surprising enough that the UI
    // reports the date back rather than moving the stop silently.
    expect(ymdInTimeZone(nextWorkingDayAnchor(stopOn("2026-10-16"), TZ, new Set([5])), TZ)).toBe("2026-10-23");
  });

  it("never skips a day when every day is worked", () => {
    expect(ymdInTimeZone(nextWorkingDayAnchor(stopOn("2026-10-17"), TZ, EVERY_DAY), TZ)).toBe("2026-10-18");
  });

  it("falls through to the next calendar day when nothing is known about the week", () => {
    // No active routes for this technician. Moving it somewhere beats refusing to move it.
    expect(ymdInTimeZone(nextWorkingDayAnchor(stopOn("2026-10-17"), TZ, new Set()), TZ)).toBe("2026-10-18");
  });

  it("keeps the same offset into the day, which is what scheduledStart encodes", () => {
    const offsetMinutes = 7 * 60 + 25;
    const moved = nextWorkingDayAnchor(stopOn("2026-10-13", offsetMinutes), TZ, MON_TO_SAT);
    expect(moved.getTime() - localDayBounds("2026-10-14", TZ).start.getTime()).toBe(offsetMinutes * 60_000);
  });

  it("survives the DST boundary instead of drifting an hour", () => {
    // 2026-11-01 is the US fall-back day: that local day is 25 hours long.
    const offsetMinutes = 8 * 60;
    const moved = nextWorkingDayAnchor(stopOn("2026-10-31", offsetMinutes), TZ, EVERY_DAY);
    expect(ymdInTimeZone(moved, TZ)).toBe("2026-11-01");
    expect(moved.getTime() - localDayBounds("2026-11-01", TZ).start.getTime()).toBe(offsetMinutes * 60_000);
  });

  it("rolls across a month end", () => {
    expect(ymdInTimeZone(nextWorkingDayAnchor(stopOn("2026-10-31", 1), TZ, EVERY_DAY), TZ)).toBe("2026-11-01");
  });
});

describe("refusalForMove", () => {
  const clean = { status: "SCHEDULED", hasReading: false, doseCount: 0, photoCount: 0 };

  it("allows a stop nobody has touched", () => {
    expect(refusalForMove(clean)).toBeNull();
  });

  it("allows a stop that was arrived at but not worked", () => {
    expect(refusalForMove({ ...clean, status: "IN_PROGRESS" })).toBeNull();
  });

  it("refuses a completed visit", () => {
    expect(refusalForMove({ ...clean, status: "COMPLETED" })).toBe("ALREADY_COMPLETED");
  });

  it.each([
    ["a reading", { hasReading: true }],
    ["a dose", { doseCount: 1 }],
    ["a photo", { photoCount: 1 }],
  ])("refuses when %s is already recorded, so it cannot be re-dated to tomorrow", (_label, over) => {
    expect(refusalForMove({ ...clean, ...over })).toBe("WORK_ALREADY_RECORDED");
  });

  it("has a message for every refusal", () => {
    expect(Object.keys(MOVE_REFUSAL_MESSAGE).sort()).toEqual(["ALREADY_COMPLETED", "WORK_ALREADY_RECORDED"]);
    for (const m of Object.values(MOVE_REFUSAL_MESSAGE)) expect(m.length).toBeGreaterThan(20);
  });
});
