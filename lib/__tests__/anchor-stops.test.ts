import { describe, it, expect } from "vitest";
import { metersBetween, splitAnchorCoincidentStops } from "@/lib/anchor-stops";

// Real coordinates from Rich's Friday, 2026-10-16.
const TAILGATE_START = { latitude: 36.0893921, longitude: -115.1746801 };
const OYO_END = { latitude: 36.099156, longitude: -115.1674676 };
const RICH_HOME = { latitude: 36.0273015, longitude: -114.961254 };

const stops = {
  tailgate: { id: "tailgate", latitude: 36.0894116, longitude: -115.174672 },
  oyoSouth: { id: "oyoSouth", latitude: 36.0991387, longitude: -115.1674756 },
  oyoNorth: { id: "oyoNorth", latitude: 36.0992817, longitude: -115.1674944 },
  baymont: { id: "baymont", latitude: 36.0493104, longitude: -115.1695785 },
  paseo: { id: "paseo", latitude: 36.0507319, longitude: -114.9642017 },
};
const all = [stops.tailgate, stops.oyoSouth, stops.oyoNorth, stops.baymont, stops.paseo];
const ids = (list: { id: string }[]) => list.map((s) => s.id);

describe("metersBetween", () => {
  it("measures the real gap between a stop and the anchor set to it", () => {
    expect(metersBetween(OYO_END, stops.oyoSouth)).toBeLessThan(5);
    expect(metersBetween(OYO_END, stops.oyoNorth)).toBeLessThan(20);
  });

  it("measures a genuinely distant stop in kilometres", () => {
    expect(metersBetween(OYO_END, stops.paseo)).toBeGreaterThan(18_000);
  });
});

describe("splitAnchorCoincidentStops", () => {
  /** The reported case: finish set to OYO, and OYO is two stops on that route. */
  it("pins every stop sitting on the end anchor, not just the nearest", () => {
    const split = splitAnchorCoincidentStops(all, TAILGATE_START, OYO_END);
    expect(ids(split.trailing)).toEqual(["oyoSouth", "oyoNorth"]);
    expect(ids(split.leading)).toEqual(["tailgate"]);
    expect(ids(split.middle)).toEqual(["baymont", "paseo"]);
  });

  /** The other half of the operator's description: some days finish at a home address. */
  it("leaves an anchor alone when no stop is on it", () => {
    const split = splitAnchorCoincidentStops(all, TAILGATE_START, RICH_HOME);
    expect(split.trailing).toEqual([]);
    expect(ids(split.leading)).toEqual(["tailgate"]);
    expect(ids(split.middle)).toEqual(["oyoSouth", "oyoNorth", "baymont", "paseo"]);
  });

  it("handles no anchors at all", () => {
    const split = splitAnchorCoincidentStops(all, null, null);
    expect(split.leading).toEqual([]);
    expect(split.trailing).toEqual([]);
    expect(ids(split.middle)).toEqual(ids(all));
  });

  it("keeps every stop exactly once, whatever the anchors", () => {
    for (const [start, end] of [
      [TAILGATE_START, OYO_END],
      [null, OYO_END],
      [TAILGATE_START, null],
      [RICH_HOME, RICH_HOME],
    ] as const) {
      const split = splitAnchorCoincidentStops(all, start, end);
      expect(ids([...split.leading, ...split.middle, ...split.trailing]).sort()).toEqual(ids(all).sort());
    }
  });

  it("preserves the incoming order within each group", () => {
    const split = splitAnchorCoincidentStops([stops.oyoNorth, stops.oyoSouth], null, OYO_END);
    expect(ids(split.trailing)).toEqual(["oyoNorth", "oyoSouth"]);
  });

  /** A stop you start at is where you begin, even if the day also finishes nearby. */
  it("gives the start anchor a tie", () => {
    const split = splitAnchorCoincidentStops([stops.oyoSouth], OYO_END, OYO_END);
    expect(ids(split.leading)).toEqual(["oyoSouth"]);
    expect(split.trailing).toEqual([]);
  });

  it("respects a custom tolerance", () => {
    // oyoNorth is ~14m from the anchor; a 5m tolerance must exclude it.
    const split = splitAnchorCoincidentStops(all, null, OYO_END, 5);
    expect(ids(split.trailing)).toEqual(["oyoSouth"]);
  });

  it("does not swallow a neighbouring property at the default tolerance", () => {
    // Baymont is 5.5km from the OYO anchor and must never be pinned to it.
    const split = splitAnchorCoincidentStops(all, null, OYO_END);
    expect(ids(split.trailing)).not.toContain("baymont");
  });
});
