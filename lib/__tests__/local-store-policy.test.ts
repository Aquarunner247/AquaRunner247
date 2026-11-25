import { describe, expect, it } from "vitest";
import {
  dayKey,
  isFresh,
  ymdOffsetFrom,
  pruneHorizonYmd,
  shouldPruneDay,
  MIRROR_FRESH_MS,
  MIRROR_RETAIN_DAYS,
} from "@/lib/local-store-policy";

const NOW = new Date("2026-11-24T14:00:00");

describe("dayKey", () => {
  it("namespaces by technician, so a shared phone cannot serve the wrong day", () => {
    // Two technicians sharing a device is normal in this business. A mirror keyed on date alone
    // would hand one of them the other's route.
    expect(dayKey("tech-a", "2026-11-24")).not.toBe(dayKey("tech-b", "2026-11-24"));
    expect(dayKey("tech-a", "2026-11-24")).toBe("tech-a:2026-11-24");
  });
});

describe("isFresh", () => {
  it("is fresh inside the window and stale outside it", () => {
    expect(isFresh(NOW.getTime() - MIRROR_FRESH_MS + 1000, NOW)).toBe(true);
    expect(isFresh(NOW.getTime() - MIRROR_FRESH_MS - 1000, NOW)).toBe(false);
  });

  it("treats a missing or unusable stamp as stale rather than fresh", () => {
    // Stale means "refresh if you can", which is always safe. Defaulting to fresh would mean
    // showing a technician data of unknown age and not even trying to improve on it.
    expect(isFresh(null, NOW)).toBe(false);
    expect(isFresh(undefined, NOW)).toBe(false);
    expect(isFresh(Number.NaN, NOW)).toBe(false);
  });

  it("treats a stamp from the future as stale, since that is a moved clock", () => {
    expect(isFresh(NOW.getTime() + 60_000, NOW)).toBe(false);
  });
});

describe("ymdOffsetFrom", () => {
  it("zero-pads, so string comparison equals date comparison", () => {
    // Everything in shouldPruneDay rests on this.
    expect(ymdOffsetFrom(new Date("2026-01-05T10:00:00"), 0)).toBe("2026-01-05");
    expect(ymdOffsetFrom(NOW, 0)).toBe("2026-11-24");
  });

  it("crosses a month boundary backwards", () => {
    expect(ymdOffsetFrom(new Date("2026-12-01T10:00:00"), -1)).toBe("2026-11-30");
  });

  it("crosses a year boundary backwards", () => {
    expect(ymdOffsetFrom(new Date("2026-01-01T10:00:00"), -1)).toBe("2025-12-31");
  });
});

describe("pruning", () => {
  it("keeps today and yesterday, drops what is older", () => {
    // Yesterday matters: a day finished at 23:58 is still being closed out after midnight.
    expect(shouldPruneDay("2026-11-24", NOW)).toBe(false);
    expect(shouldPruneDay("2026-11-23", NOW)).toBe(false);
    expect(shouldPruneDay("2026-11-20", NOW)).toBe(true);
  });

  it("keeps exactly MIRROR_RETAIN_DAYS days", () => {
    const oldest = ymdOffsetFrom(NOW, -(MIRROR_RETAIN_DAYS - 1));
    const tooOld = ymdOffsetFrom(NOW, -MIRROR_RETAIN_DAYS);
    expect(pruneHorizonYmd(NOW)).toBe(oldest);
    expect(shouldPruneDay(oldest, NOW)).toBe(false);
    expect(shouldPruneDay(tooOld, NOW)).toBe(true);
  });

  it("never prunes a future day, which a timezone can produce", () => {
    // The org's timezone decides the day, not the device's -- so a device can legitimately hold
    // a ymd ahead of its own local date, and dropping it would delete the day being worked.
    expect(shouldPruneDay("2026-11-25", NOW)).toBe(false);
  });
});
