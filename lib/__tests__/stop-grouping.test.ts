import { describe, expect, it } from "vitest";
import {
  BUNDLE_RADIUS_METERS,
  coalesceBundleMembers,
  formatSequenceRange,
  groupNearbyStops,
  metersBetween,
  type GroupableStop,
} from "@/lib/stop-grouping";

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

/** Defaults to a POOL, so existing cases keep their meaning; pass bodyType to vary the kind. A
 *  bundle holds at most one body of each kind, so a pair that should group needs two kinds. */
function stop(id: string, overrides: Partial<GroupableStop> = {}): GroupableStop {
  return {
    id,
    propertyId: "p1",
    latitude: BASE.latitude,
    longitude: BASE.longitude,
    bodyType: "POOL",
    ...overrides,
  };
}

/** A spa at the same spot -- the ordinary bundling partner for a pool. */
function spa(id: string, overrides: Partial<GroupableStop> = {}): GroupableStop {
  return stop(id, { bodyType: "SPA", ...overrides });
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
    const groups = groupNearbyStops([stop("pool"), spa("spa", { ...north(6.4) })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].memberIds).toEqual(["pool", "spa"]);
  });

  it("bundles the widest real together-pair (19.2m, Ritiro)", () => {
    const groups = groupNearbyStops([stop("pool"), spa("spa", { ...north(19.2) })]);
    expect(groups).toHaveLength(1);
  });

  it("keeps two pools on one deck separate (16m, OYO), close as they are", () => {
    // "Pool 1 (North)" and "Pool 2 (South)" are 16m apart on one deck, so distance alone bundled
    // them -- and that is where photos kept being misfiled, because two similar pools are hard to
    // tell apart in a photo. Proximity is not enough; the kinds have to differ too.
    const groups = groupNearbyStops([stop("pool1"), stop("pool2", { ...north(16) })]);
    expect(groups.map((g) => g.memberIds)).toEqual([["pool1"], ["pool2"]]);
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
      spa("gymSpa"),
      stop("gymPool", { ...north(10.1) }),
      spa("clubSpa", { ...north(87.6) }),
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
    const groups = groupNearbyStops([stop("a"), spa("b", { ...north(30) }), stop("c", { ...north(60) })]);
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
      spa("spa", { ...north(6) }),
    ]);
    expect(groups.map((g) => g.memberIds)).toEqual([["pool"], ["spa"]]);
  });

  it("a skipped stop between two members keeps them together", () => {
    const groups = groupNearbyStops([
      stop("pool"),
      stop("skipped", { ignored: true }),
      spa("spa", { ...north(6) }),
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
    const pair = [stop("a"), spa("b", { ...north(50) })];
    expect(groupNearbyStops(pair, 60)).toHaveLength(1);
    expect(groupNearbyStops(pair, 10)).toHaveLength(2);
  });

  it("uses a 40m default", () => {
    expect(BUNDLE_RADIUS_METERS).toBe(40);
  });

  it("allows at most one body of each kind in a bundle", () => {
    // A pool with two spas beside it: the first spa joins, the second starts its own group rather
    // than sharing a card with a body a technician could confuse it for.
    const groups = groupNearbyStops([stop("pool"), spa("spa1", { ...north(5) }), spa("spa2", { ...north(8) })]);
    expect(groups.map((g) => g.memberIds)).toEqual([["pool", "spa1"], ["spa2"]]);
  });

  it("still bundles a third body when its kind is new", () => {
    const groups = groupNearbyStops([
      stop("pool"),
      spa("spa", { ...north(5) }),
      stop("wading", { bodyType: "OTHER", ...north(8) }),
    ]);
    expect(groups.map((g) => g.memberIds)).toEqual([["pool", "spa", "wading"]]);
  });

  it("bundles Playa Vista's pool with its wading pool, which are different kinds", () => {
    // POOL + OTHER, 17.4m apart -- a real pair that must keep bundling under the kind rule.
    const groups = groupNearbyStops([stop("pool"), stop("wading", { bodyType: "OTHER", ...north(17.4) })]);
    expect(groups).toHaveLength(1);
  });

  it("gives a body of unknown kind its own group", () => {
    // An unlabelled card is the ambiguity this rule exists to prevent, so null never bundles.
    expect(groupNearbyStops([stop("pool"), stop("mystery", { bodyType: null, ...north(5) })])).toHaveLength(2);
    expect(groupNearbyStops([stop("mystery", { bodyType: null }), spa("spa", { ...north(5) })])).toHaveLength(2);
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

describe("coalesceBundleMembers", () => {
  /**
   * The live case this exists for. Pacific Harbors and Paseo Del Prado came out of the optimizer
   * interleaved -- spa, spa, pool, pool -- because two properties that close make the interleaved
   * order cost the same as the grouped one, so nothing preferred grouping and neither pair could be
   * drawn as one card.
   */
  it("un-interleaves two nearby properties without reordering the properties", () => {
    const pacificSpa = spa("pacificSpa", { propertyId: "pacific" });
    const paseoSpa = spa("paseoSpa", { propertyId: "paseo", ...north(200) });
    const pacificPool = stop("pacificPool", { propertyId: "pacific", ...north(6.9) });
    const paseoPool = stop("paseoPool", { propertyId: "paseo", ...north(200 + 7.9) });

    const result = coalesceBundleMembers([pacificSpa, paseoSpa, pacificPool, paseoPool]);

    expect(result.map((s) => s.id)).toEqual(["pacificSpa", "pacificPool", "paseoSpa", "paseoPool"]);
    // And the result now actually bundles, which the input did not.
    expect(groupNearbyStops(result).map((g) => g.memberIds)).toEqual([
      ["pacificSpa", "pacificPool"],
      ["paseoSpa", "paseoPool"],
    ]);
    expect(groupNearbyStops([pacificSpa, paseoSpa, pacificPool, paseoPool])).toHaveLength(4);
  });

  it("leaves an already-grouped sequence exactly as it was", () => {
    const input = [stop("pool"), spa("spa", { ...north(7) }), stop("other", { propertyId: "p2", ...north(300) })];
    expect(coalesceBundleMembers(input).map((s) => s.id)).toEqual(["pool", "spa", "other"]);
  });

  it("does not pull in a body too far away to be one walk-up", () => {
    // The Alcove's front and back decks, 136m apart: the optimizer's order stands.
    const input = [
      stop("backPool"),
      stop("frontPool", { ...north(136) }),
      spa("backSpa", { ...north(12.3) }),
    ];
    expect(coalesceBundleMembers(input).map((s) => s.id)).toEqual(["backPool", "backSpa", "frontPool"]);
  });

  it("does not pull in a second body of the same kind", () => {
    // OYO's two pools: close, but they must stay separate rows.
    const input = [stop("pool1"), stop("elsewhere", { propertyId: "p2", ...north(300) }), stop("pool2", { ...north(16) })];
    expect(coalesceBundleMembers(input).map((s) => s.id)).toEqual(["pool1", "elsewhere", "pool2"]);
  });

  it("never moves an errand, and an errand never collects anything", () => {
    const input = [
      stop("errand", { propertyId: null }),
      stop("pool"),
      stop("other", { propertyId: "p2", ...north(300) }),
      spa("spa", { ...north(7) }),
    ];
    expect(coalesceBundleMembers(input).map((s) => s.id)).toEqual(["errand", "pool", "spa", "other"]);
  });

  it("leaves a skipped stop where it is", () => {
    const input = [stop("pool"), stop("skipped", { ignored: true, ...north(5) }), spa("spa", { ...north(7) })];
    // The skipped stop is not a bundle member, so it is not gathered; pool still collects the spa.
    expect(coalesceBundleMembers(input).map((s) => s.id)).toEqual(["pool", "spa", "skipped"]);
  });

  it("keeps different technicians apart", () => {
    const input = [
      stop("poolA", { technicianId: "t1" }),
      stop("poolB", { technicianId: "t2", ...north(300), propertyId: "p2" }),
      spa("spaA", { technicianId: "t2", ...north(7) }),
    ];
    // spaA is at the same property as poolA but assigned elsewhere, so it isn't gathered.
    expect(coalesceBundleMembers(input).map((s) => s.id)).toEqual(["poolA", "poolB", "spaA"]);
  });

  it("returns an empty list unchanged", () => {
    expect(coalesceBundleMembers([])).toEqual([]);
  });
});
