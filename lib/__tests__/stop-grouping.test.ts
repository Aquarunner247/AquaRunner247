import { describe, expect, it } from "vitest";
import { BUNDLE_RADIUS_METERS, formatSequenceRange, groupNearbyStops, metersBetween, type GroupableStop } from "@/lib/stop-grouping";

/**
 * Coordinates are synthetic but the DISTANCES mirror the customer's real measured pins, which is
 * what the threshold was chosen against:
 *   together: 6.4m (Fifty101 pool/spa) .. 19.2m (Ritiro pool/spa)
 *   apart:    87.6m (Borgata clubhouse/gym) .. 278.4m (Zoom north/south)
 */
const BASE = { latitude: 36.1699, longitude: -115.1398 };

/** Offsets `BASE` north by roughly `meters`. 1 degree of latitude ~= 111_320m. */
function north(meters: number) {
  return { latitude: BASE.latitude + meters / 111_320, longitude: BASE.longitude };
}

function stop(id: string, overrides: Partial<GroupableStop> = {}): GroupableStop {
  return { id, propertyId: "p1", latitude: BASE.latitude, longitude: BASE.longitude, ...overrides };
}

describe("metersBetween", () => {
  it("measures a known offset", () => {
    expect(metersBetween(BASE, north(100))).toBeCloseTo(100, 0);
  });

  it("is zero for the same point", () => {
    expect(metersBetween(BASE, BASE)).toBeCloseTo(0, 6);
  });
});

describe("groupNearbyStops — the customer's real shapes", () => {
  it("bundles a pool and spa on one deck (6.4m, Fifty101)", () => {
    const groups = groupNearbyStops([stop("pool"), stop("spa", { ...north(6.4) })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].memberIds).toEqual(["pool", "spa"]);
  });

  it("bundles the widest real together-pair (19.2m, Ritiro)", () => {
    const groups = groupNearbyStops([stop("pool"), stop("spa", { ...north(19.2) })]);
    expect(groups).toHaveLength(1);
  });

  it("bundles two pools on one deck (16m, OYO) — which no name rule would", () => {
    // "Pool 1 (North)" and "Pool 2 (South)": different names, same place.
    const groups = groupNearbyStops([stop("pool1"), stop("pool2", { ...north(16) })]);
    expect(groups).toHaveLength(1);
  });

  it("splits the closest real apart-pair (87.6m, Borgata clubhouse vs gym)", () => {
    const groups = groupNearbyStops([stop("clubhouse"), stop("gym", { ...north(87.6) })]);
    expect(groups).toHaveLength(2);
  });

  it("splits a front and back deck (135.8m, The Alcove)", () => {
    const groups = groupNearbyStops([stop("back"), stop("front", { ...north(135.8) })]);
    expect(groups).toHaveLength(2);
  });

  it("makes two pairs out of Borgata's four venues", () => {
    const groups = groupNearbyStops([
      stop("gymSpa"),
      stop("gymPool", { ...north(10.1) }),
      stop("clubSpa", { ...north(87.6) }),
      stop("clubPool", { ...north(87.6 + 12.1) }),
    ]);
    expect(groups.map((g) => g.memberIds)).toEqual([
      ["gymSpa", "gymPool"],
      ["clubSpa", "clubPool"],
    ]);
  });

  it("leaves Zoom's three pools separate", () => {
    const groups = groupNearbyStops([
      stop("south"),
      stop("garden", { ...north(135.6) }),
      stop("north", { ...north(135.6 + 142.7) }),
    ]);
    expect(groups).toHaveLength(3);
  });
});

describe("groupNearbyStops — rules", () => {
  it("measures from the group's first member, so 30m hops can't chain across a property", () => {
    const groups = groupNearbyStops([stop("a"), stop("b", { ...north(30) }), stop("c", { ...north(60) })]);
    // b joins a (30m). c is 60m from the ANCHOR a, so it starts a new group even though it is
    // only 30m from b.
    expect(groups.map((g) => g.memberIds)).toEqual([["a", "b"], ["c"]]);
  });

  it("never bundles across different properties", () => {
    const groups = groupNearbyStops([stop("a"), stop("b", { propertyId: "p2" })]);
    expect(groups).toHaveLength(2);
  });

  it("starts a new group when the technician changes", () => {
    const groups = groupNearbyStops([stop("a", { technicianId: "t1" }), stop("b", { technicianId: "t2" })]);
    expect(groups).toHaveLength(2);
  });

  it("an errand breaks a run and joins nothing", () => {
    const groups = groupNearbyStops([
      stop("pool"),
      stop("errand", { propertyId: null }),
      stop("spa", { ...north(6) }),
    ]);
    expect(groups.map((g) => g.memberIds)).toEqual([["pool"], ["spa"]]);
  });

  it("a skipped stop between two members keeps them together", () => {
    const groups = groupNearbyStops([
      stop("pool"),
      stop("skipped", { ignored: true }),
      stop("spa", { ...north(6) }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].memberIds).toEqual(["pool", "spa"]);
  });

  it("excludes a skipped stop from membership entirely", () => {
    const groups = groupNearbyStops([stop("pool"), stop("skipped", { ignored: true })]);
    expect(groups[0].memberIds).toEqual(["pool"]);
  });

  it("gives an unmeasurable stop its own group rather than assuming it is nearby", () => {
    const groups = groupNearbyStops([stop("a"), stop("nocoords", { latitude: null, longitude: null })]);
    expect(groups).toHaveLength(2);
  });

  it("splits the same property visited twice with other stops between", () => {
    const groups = groupNearbyStops([
      stop("frontA"),
      stop("elsewhere", { propertyId: "p2" }),
      stop("frontB", { ...north(5) }),
    ]);
    expect(groups.map((g) => g.memberIds)).toEqual([["frontA"], ["elsewhere"], ["frontB"]]);
  });

  it("returns a single-member group for a lone stop", () => {
    expect(groupNearbyStops([stop("only")])).toEqual([{ groupId: "g0", propertyId: "p1", memberIds: ["only"] }]);
  });

  it("returns nothing for no stops", () => {
    expect(groupNearbyStops([])).toEqual([]);
  });

  it("honours a custom radius", () => {
    const pair = [stop("a"), stop("b", { ...north(50) })];
    expect(groupNearbyStops(pair, 60)).toHaveLength(1);
    expect(groupNearbyStops(pair, 10)).toHaveLength(2);
  });

  it("uses a 40m default", () => {
    expect(BUNDLE_RADIUS_METERS).toBe(40);
  });
});

describe("formatSequenceRange", () => {
  it("collapses consecutive positions", () => {
    expect(formatSequenceRange([4, 5, 6])).toBe("4–6");
  });

  it("lists non-consecutive positions", () => {
    expect(formatSequenceRange([4, 6])).toBe("4, 6");
  });

  it("returns a lone position as-is", () => {
    expect(formatSequenceRange([4])).toBe("4");
  });

  it("sorts before formatting", () => {
    expect(formatSequenceRange([6, 4, 5])).toBe("4–6");
  });

  it("is empty for no positions", () => {
    expect(formatSequenceRange([])).toBe("");
  });
});
