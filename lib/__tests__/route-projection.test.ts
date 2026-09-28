import { describe, expect, it } from "vitest";
import { projectedStopsForYmd, routeRunsOnYmd, type ProjectableRoute } from "@/lib/route-projection";
import { coalesceCoord } from "@/lib/geocode";

/** 2026-09-28 is a Monday; 2026-09-29 a Tuesday. */
const MONDAY = "2026-09-28";
const TUESDAY = "2026-09-29";

function route(overrides: Partial<ProjectableRoute> = {}): ProjectableRoute {
  return { dayOfWeek: 1, startsOn: null, endsOn: null, stopCount: 4, ...overrides };
}

const utc = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe("routeRunsOnYmd", () => {
  it("matches only its own weekday", () => {
    expect(routeRunsOnYmd(route(), MONDAY)).toBe(true);
    expect(routeRunsOnYmd(route(), TUESDAY)).toBe(false);
  });

  it("runs on any date when unbounded", () => {
    expect(routeRunsOnYmd(route(), "2020-01-06")).toBe(true);
    expect(routeRunsOnYmd(route(), "2099-01-05")).toBe(true);
  });

  it("does not run before startsOn", () => {
    expect(routeRunsOnYmd(route({ startsOn: utc("2026-10-05") }), MONDAY)).toBe(false);
  });

  it("does not run after endsOn", () => {
    expect(routeRunsOnYmd(route({ endsOn: utc("2026-09-21") }), MONDAY)).toBe(false);
  });

  it("treats both bounds as inclusive", () => {
    expect(routeRunsOnYmd(route({ startsOn: utc(MONDAY) }), MONDAY)).toBe(true);
    expect(routeRunsOnYmd(route({ endsOn: utc(MONDAY) }), MONDAY)).toBe(true);
  });

  it("honours a closed window spanning the date", () => {
    const r = route({ startsOn: utc("2026-09-01"), endsOn: utc("2026-10-31") });
    expect(routeRunsOnYmd(r, MONDAY)).toBe(true);
  });

  it("never runs when the window excludes every date", () => {
    const r = route({ startsOn: utc("2026-10-01"), endsOn: utc("2026-09-01") });
    expect(routeRunsOnYmd(r, MONDAY)).toBe(false);
  });

  it("ignores a null dayOfWeek rather than matching everything", () => {
    expect(routeRunsOnYmd(route({ dayOfWeek: null }), MONDAY)).toBe(false);
  });

  it("ignores frequency, matching what visit generation actually does", () => {
    // A BIWEEKLY route still generates weekly, so two consecutive Mondays both run.
    const r = route();
    expect(routeRunsOnYmd(r, "2026-09-21")).toBe(true);
    expect(routeRunsOnYmd(r, MONDAY)).toBe(true);
  });
});

describe("projectedStopsForYmd", () => {
  it("sums stops across every route that runs that day", () => {
    const routes = [route({ stopCount: 4 }), route({ stopCount: 3 }), route({ dayOfWeek: 2, stopCount: 9 })];
    expect(projectedStopsForYmd(routes, MONDAY)).toBe(7);
    expect(projectedStopsForYmd(routes, TUESDAY)).toBe(9);
  });

  it("is zero with no routes", () => {
    expect(projectedStopsForYmd([], MONDAY)).toBe(0);
  });

  it("excludes out-of-window routes from the sum", () => {
    const routes = [route({ stopCount: 4 }), route({ stopCount: 5, endsOn: utc("2026-09-01") })];
    expect(projectedStopsForYmd(routes, MONDAY)).toBe(4);
  });
});

describe("coalesceCoord", () => {
  it("prefers the body of water's own pin", () => {
    expect(coalesceCoord(36.15, 36.99)).toBe(36.15);
  });

  it("falls back to the property when the body isn't pinned", () => {
    expect(coalesceCoord(null, 36.99)).toBe(36.99);
    expect(coalesceCoord(undefined, 36.99)).toBe(36.99);
  });

  it("is null when neither has coordinates", () => {
    expect(coalesceCoord(null, null)).toBeNull();
    expect(coalesceCoord(undefined, undefined)).toBeNull();
  });

  it("accepts Prisma Decimal-like values", () => {
    // What both schedule call sites actually hold -- an object whose Number() goes via toString.
    const decimal = (v: string) => ({ toString: () => v });
    expect(coalesceCoord(decimal("36.1699"), null)).toBeCloseTo(36.1699, 6);
    expect(coalesceCoord(null, decimal("-115.1398"))).toBeCloseTo(-115.1398, 6);
  });

  it("treats an unparseable value as missing rather than NaN", () => {
    expect(coalesceCoord({ toString: () => "not a number" }, null)).toBeNull();
  });

  it("keeps a legitimate zero", () => {
    // 0,0 is in the Atlantic, but it must not be mistaken for absent.
    expect(coalesceCoord(0, 36.99)).toBe(0);
  });
});
