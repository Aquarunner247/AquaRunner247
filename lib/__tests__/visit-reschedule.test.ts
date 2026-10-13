import { describe, expect, it } from "vitest";
import { MOVE_REFUSAL_MESSAGE, nextDayAnchor, refusalForMove } from "../visit-reschedule";
import { localDayBounds, ymdInTimeZone } from "../timezone";

const TZ = "America/Los_Angeles";

describe("nextDayAnchor", () => {
  it("lands on the next local calendar day", () => {
    const start = new Date("2026-10-12T15:00:00.000Z"); // 08:00 local
    expect(ymdInTimeZone(nextDayAnchor(start, TZ), TZ)).toBe("2026-10-13");
  });

  it("keeps the same offset into the day, which is what scheduledStart actually encodes", () => {
    const ymd = "2026-10-12";
    const offsetMinutes = 7 * 60 + 25; // the 07:25 stops on this route
    const start = new Date(localDayBounds(ymd, TZ).start.getTime() + offsetMinutes * 60_000);
    const moved = nextDayAnchor(start, TZ);
    const movedOffset = moved.getTime() - localDayBounds("2026-10-13", TZ).start.getTime();
    expect(movedOffset).toBe(offsetMinutes * 60_000);
  });

  it("survives the DST boundary instead of drifting an hour", () => {
    // 2026-11-01 is the US fall-back day: that local day is 25 hours long.
    const ymd = "2026-10-31";
    const offsetMinutes = 8 * 60;
    const start = new Date(localDayBounds(ymd, TZ).start.getTime() + offsetMinutes * 60_000);
    const moved = nextDayAnchor(start, TZ);
    expect(ymdInTimeZone(moved, TZ)).toBe("2026-11-01");
    // Still 8 hours into ITS day, even though that day is 25 hours long. Adding a flat 24h would
    // have put it at 07:00 local instead.
    expect(moved.getTime() - localDayBounds("2026-11-01", TZ).start.getTime()).toBe(offsetMinutes * 60_000);
  });

  it("rolls across a month end", () => {
    const start = new Date(localDayBounds("2026-10-31", TZ).start.getTime() + 60_000);
    expect(ymdInTimeZone(nextDayAnchor(start, TZ), TZ)).toBe("2026-11-01");
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
