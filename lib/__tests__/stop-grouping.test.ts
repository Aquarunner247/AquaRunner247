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

/** Defaults to a POOL with NO serviceGroup -- i.e. its own stop. Pass `serviceGroup` to declare
 *  two bodies one walk-up. bodyType no longer decides anything and is kept because cards label
 *  their members by kind. */
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
  /**
   * The same thirteen multi-body properties the distance rule was tuned against, now expressed as
   * declarations. The point of each case is unchanged; what decides it is.
   */
  it("bundles a pool and spa declared one walk-up (Fifty101)", () => {
    const stops = [stop("pool", { serviceGroup: "Main" }), spa("spa", { serviceGroup: "Main" })];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([["pool", "spa"]]);
  });

  /** 19.2m apart -- the widest real together-pair. Distance is no longer consulted at all. */
  it("bundles a pair however far apart, once declared (Ritiro)", () => {
    const stops = [
      stop("pool", { serviceGroup: "Main", ...BASE }),
      spa("spa", { serviceGroup: "Main", ...north(19.2) }),
    ];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([["pool", "spa"]]);
  });

  /**
   * OYO: two pools 16m apart on one deck, one arrival. The distance rule could never bundle these
   * because both are POOL -- a blanket guard against confusing lookalike pools in photos. Declared,
   * the operator can say this specific pair is one stop.
   */
  it("bundles two pools of the same kind when declared (OYO)", () => {
    const stops = [
      stop("north", { serviceGroup: "Pool deck", ...BASE }),
      stop("south", { serviceGroup: "Pool deck", ...north(16) }),
    ];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([["north", "south"]]);
  });

  /** And two lookalike pools NOT declared stay apart, which is the protection kept deliberate. */
  it("keeps two pools apart when nobody declared them together", () => {
    const stops = [stop("north", { ...BASE }), stop("south", { ...north(16) })];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([["north"], ["south"]]);
  });

  /** Borgata: four venues, two walk-ups 88m apart. One property, two groups. */
  it("makes two pairs out of Borgata's four venues", () => {
    const stops = [
      stop("clubPool", { serviceGroup: "Clubhouse" }),
      spa("clubSpa", { serviceGroup: "Clubhouse" }),
      stop("gymPool", { serviceGroup: "Gym" }),
      spa("gymSpa", { serviceGroup: "Gym" }),
    ];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([
      ["clubPool", "clubSpa"],
      ["gymPool", "gymSpa"],
    ]);
  });

  /** Zoom: three pools spread across the property, none declared together. */
  it("leaves Zoom's three pools separate", () => {
    const stops = [stop("north"), stop("garden"), stop("south")];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([["north"], ["garden"], ["south"]]);
  });

  /** Cornerstone: a declared office pair, plus a third pool on its own. */
  it("bundles only what is declared, leaving the rest alone (Cornerstone)", () => {
    const stops = [
      stop("officePool", { serviceGroup: "Office" }),
      spa("officeSpa", { serviceGroup: "Office" }),
      stop("pool2"),
    ];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([["officePool", "officeSpa"], ["pool2"]]);
  });
});

describe("groupNearbyStops — rules", () => {
  it("never bundles across different properties, even with the same group name", () => {
    const stops = [stop("a", { serviceGroup: "Main" }), spa("b", { propertyId: "p2", serviceGroup: "Main" })];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([["a"], ["b"]]);
  });

  it("starts a new group when the technician changes", () => {
    const stops = [
      stop("a", { serviceGroup: "Main", technicianId: "t1" }),
      spa("b", { serviceGroup: "Main", technicianId: "t2" }),
    ];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([["a"], ["b"]]);
  });

  it("an errand breaks a run and joins nothing", () => {
    const stops = [
      stop("a", { serviceGroup: "Main" }),
      { id: "errand", propertyId: null, latitude: null, longitude: null, bodyType: null },
      spa("b", { serviceGroup: "Main" }),
    ];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([["a"], ["b"]]);
  });

  it("a skipped stop between two members keeps them together", () => {
    const stops = [
      stop("a", { serviceGroup: "Main" }),
      stop("skipped", { serviceGroup: "Main", ignored: true }),
      spa("b", { serviceGroup: "Main" }),
    ];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([["a", "b"]]);
  });

  it("excludes a skipped stop from membership entirely", () => {
    const stops = [stop("a", { serviceGroup: "Main" }), spa("skipped", { serviceGroup: "Main", ignored: true })];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([["a"]]);
  });

  /** Contiguity still matters: a card is one position in the day. */
  it("splits the same group visited twice with another property between", () => {
    const stops = [
      stop("a", { serviceGroup: "Main" }),
      stop("other", { propertyId: "p2" }),
      spa("b", { serviceGroup: "Main" }),
    ];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([["a"], ["other"], ["b"]]);
  });

  it("gives an ungrouped body its own group, however close it sits", () => {
    const stops = [stop("a", { serviceGroup: "Main" }), spa("loner")];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([["a"], ["loner"]]);
  });

  /** Whitespace is not a group. An empty-ish value must not bundle every blank body together. */
  it("treats a blank group as no group", () => {
    const stops = [stop("a", { serviceGroup: "   " }), spa("b", { serviceGroup: "" })];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([["a"], ["b"]]);
  });

  it("bundles three bodies of any kinds when all three are declared together", () => {
    const stops = [
      stop("a", { serviceGroup: "Main" }),
      spa("b", { serviceGroup: "Main" }),
      stop("c", { serviceGroup: "Main", bodyType: "OTHER" }),
    ];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([["a", "b", "c"]]);
  });

  it("does not bundle different groups at one property", () => {
    const stops = [stop("a", { serviceGroup: "Front" }), spa("b", { serviceGroup: "Back" })];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([["a"], ["b"]]);
  });

  it("returns a single-member group for a lone stop", () => {
    expect(groupNearbyStops([stop("only")]).map((g) => g.memberIds)).toEqual([["only"]]);
  });

  it("returns nothing for no stops", () => {
    expect(groupNearbyStops([])).toEqual([]);
  });

  /** Coordinates are irrelevant now -- an unpinned body still bundles if it was declared. */
  it("bundles a body with no coordinates at all, once declared", () => {
    const stops = [
      stop("a", { serviceGroup: "Main" }),
      spa("b", { serviceGroup: "Main", latitude: null, longitude: null }),
    ];
    expect(groupNearbyStops(stops).map((g) => g.memberIds)).toEqual([["a", "b"]]);
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
  it("un-interleaves two declared walk-ups without reordering the properties", () => {
    const pacificSpa = spa("pacificSpa", { propertyId: "pacific", serviceGroup: "Main" });
    const paseoSpa = spa("paseoSpa", { propertyId: "paseo", serviceGroup: "Main" });
    const pacificPool = stop("pacificPool", { propertyId: "pacific", serviceGroup: "Main" });
    const paseoPool = stop("paseoPool", { propertyId: "paseo", serviceGroup: "Main" });

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
    const input = [
      stop("pool", { serviceGroup: "Main" }),
      spa("spa", { serviceGroup: "Main" }),
      stop("other", { propertyId: "p2" }),
    ];
    expect(coalesceBundleMembers(input).map((s) => s.id)).toEqual(["pool", "spa", "other"]);
  });

  /** The Alcove's front and back decks: declared as two walk-ups, so neither collects the other. */
  it("does not pull in a body from a different group at the same property", () => {
    const input = [
      stop("backPool", { serviceGroup: "Back" }),
      stop("frontPool", { serviceGroup: "Front" }),
      spa("backSpa", { serviceGroup: "Back" }),
    ];
    expect(coalesceBundleMembers(input).map((s) => s.id)).toEqual(["backPool", "backSpa", "frontPool"]);
  });

  /** OYO's two pools, left undeclared: an ungrouped body collects nothing and is collected by nothing. */
  it("does not pull in an ungrouped body", () => {
    const input = [stop("pool1"), stop("elsewhere", { propertyId: "p2" }), stop("pool2")];
    expect(coalesceBundleMembers(input).map((s) => s.id)).toEqual(["pool1", "elsewhere", "pool2"]);
  });

  it("never moves an errand, and an errand never collects anything", () => {
    const input = [
      stop("errand", { propertyId: null, serviceGroup: null }),
      stop("pool", { serviceGroup: "Main" }),
      stop("other", { propertyId: "p2" }),
      spa("spa", { serviceGroup: "Main" }),
    ];
    expect(coalesceBundleMembers(input).map((s) => s.id)).toEqual(["errand", "pool", "spa", "other"]);
  });

  it("leaves a skipped stop where it is", () => {
    const input = [
      stop("pool", { serviceGroup: "Main" }),
      stop("skipped", { serviceGroup: "Main", ignored: true }),
      spa("spa", { serviceGroup: "Main" }),
    ];
    // The skipped stop is not a bundle member, so it is not gathered; pool still collects the spa.
    expect(coalesceBundleMembers(input).map((s) => s.id)).toEqual(["pool", "spa", "skipped"]);
  });

  it("keeps different technicians apart", () => {
    const input = [
      stop("poolA", { technicianId: "t1", serviceGroup: "Main" }),
      stop("poolB", { technicianId: "t2", propertyId: "p2" }),
      spa("spaA", { technicianId: "t2", serviceGroup: "Main" }),
    ];
    // spaA is at the same property and group as poolA but assigned elsewhere, so it isn't gathered.
    expect(coalesceBundleMembers(input).map((s) => s.id)).toEqual(["poolA", "poolB", "spaA"]);
  });

  it("returns an empty list unchanged", () => {
    expect(coalesceBundleMembers([])).toEqual([]);
  });
});
