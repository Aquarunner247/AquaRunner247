import { describe, expect, it } from "vitest";
import { resolveRouteEndpoints, sameEndpoint } from "@/lib/route-endpoints";

const HOME = { startLatitude: 36.1, startLongitude: -115.2, startAddress: "Home" };
const WAREHOUSE = { startLatitude: 36.3, startLongitude: -115.0, startAddress: "Warehouse" };
const SHOP = { endLatitude: 36.05, endLongitude: -115.3, endAddress: "Shop" };

describe("resolveRouteEndpoints", () => {
  it("returns no points when nothing is set anywhere", () => {
    expect(resolveRouteEndpoints({})).toEqual({ start: null, end: null });
    expect(resolveRouteEndpoints({ route: {}, technician: {} })).toEqual({ start: null, end: null });
  });

  /** The behavior every existing row must keep: a start with no end is a round trip. */
  it("finishes back at the start when no end is set", () => {
    const { start, end } = resolveRouteEndpoints({ technician: HOME });
    expect(start).toEqual({ latitude: 36.1, longitude: -115.2, label: "Home" });
    expect(end).toEqual(start);
    expect(sameEndpoint(start, end)).toBe(true);
  });

  it("uses the technician's default start and end", () => {
    const { start, end } = resolveRouteEndpoints({ technician: { ...HOME, ...SHOP } });
    expect(start?.label).toBe("Home");
    expect(end?.label).toBe("Shop");
    expect(sameEndpoint(start, end)).toBe(false);
  });

  it("lets a route override the start for one day", () => {
    const { start, end } = resolveRouteEndpoints({ route: WAREHOUSE, technician: HOME });
    expect(start?.label).toBe("Warehouse");
    expect(end?.label).toBe("Warehouse"); // no end anywhere -> round trip from the override
  });

  /**
   * The two chains are independent. Overriding only Thursday's start must not drag the finish
   * along with it -- the technician still goes home at the end of Thursday.
   */
  it("keeps the technician's end when only the route's start is overridden", () => {
    const { start, end } = resolveRouteEndpoints({ route: WAREHOUSE, technician: { ...HOME, ...SHOP } });
    expect(start?.label).toBe("Warehouse");
    expect(end?.label).toBe("Shop");
  });

  it("lets a route override only the end", () => {
    const { start, end } = resolveRouteEndpoints({
      route: { endLatitude: 36.9, endLongitude: -115.9, endAddress: "Dump run" },
      technician: { ...HOME, ...SHOP },
    });
    expect(start?.label).toBe("Home");
    expect(end?.label).toBe("Dump run");
  });

  it("prefers the route's own pair when both are overridden", () => {
    const { start, end } = resolveRouteEndpoints({
      route: { ...WAREHOUSE, endLatitude: 36.9, endLongitude: -115.9, endAddress: "Dump run" },
      technician: { ...HOME, ...SHOP },
    });
    expect(start?.label).toBe("Warehouse");
    expect(end?.label).toBe("Dump run");
  });

  it("accepts Prisma Decimal-shaped values", () => {
    const decimal = (v: string) => ({ toString: () => v });
    const { start } = resolveRouteEndpoints({
      technician: { startLatitude: decimal("36.1000000"), startLongitude: decimal("-115.2000000"), startAddress: "Home" },
    });
    expect(start).toEqual({ latitude: 36.1, longitude: -115.2, label: "Home" });
  });

  it("treats a half-set pair as not set, and falls through to the next layer", () => {
    const { start } = resolveRouteEndpoints({
      route: { startLatitude: 36.3, startLongitude: null, startAddress: "Half" },
      technician: HOME,
    });
    expect(start?.label).toBe("Home");
  });

  it("treats an unparseable coordinate as not set rather than NaN", () => {
    const { start } = resolveRouteEndpoints({
      technician: { startLatitude: "not-a-number", startLongitude: -115.2, startAddress: "Bad" },
    });
    expect(start).toBeNull();
  });

  it("carries a null label without inventing one", () => {
    const { start } = resolveRouteEndpoints({ technician: { startLatitude: 36.1, startLongitude: -115.2 } });
    expect(start).toEqual({ latitude: 36.1, longitude: -115.2, label: null });
  });
});

describe("sameEndpoint", () => {
  const a = { latitude: 36.1, longitude: -115.2, label: "a" };

  it("ignores the label and sub-centimetre drift", () => {
    expect(sameEndpoint(a, { latitude: 36.1, longitude: -115.2, label: "different name" })).toBe(true);
    expect(sameEndpoint(a, { latitude: 36.10000001, longitude: -115.2, label: null })).toBe(true);
  });

  it("separates places a pin-drop apart", () => {
    expect(sameEndpoint(a, { latitude: 36.1001, longitude: -115.2, label: null })).toBe(false);
  });

  it("handles nulls", () => {
    expect(sameEndpoint(null, null)).toBe(true);
    expect(sameEndpoint(a, null)).toBe(false);
    expect(sameEndpoint(null, a)).toBe(false);
  });
});
