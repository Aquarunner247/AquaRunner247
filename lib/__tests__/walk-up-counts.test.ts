import { describe, it, expect } from "vitest";
import { countFinishedWalkUps, countWalkUps, type CountableStop } from "@/lib/stop-grouping";

function stop(id: string, over: Partial<CountableStop> = {}): CountableStop {
  return { id, propertyId: "p1", latitude: null, longitude: null, bodyType: "POOL", serviceGroup: null, status: "SCHEDULED", ...over };
}

/** Rich's Friday shape: eleven venues, two of them declared walk-ups of two. */
const day: CountableStop[] = [
  stop("tailgate", { propertyId: "tailgate" }),
  stop("pacificSpa", { propertyId: "pacific", serviceGroup: "Main" }),
  stop("pacificPool", { propertyId: "pacific", serviceGroup: "Main" }),
  stop("paseoSpa", { propertyId: "paseo", serviceGroup: "Main" }),
  stop("paseoPool", { propertyId: "paseo", serviceGroup: "Main" }),
  stop("baymont", { propertyId: "baymont" }),
];

describe("countWalkUps", () => {
  it("counts a declared walk-up once", () => {
    expect(day).toHaveLength(6);
    expect(countWalkUps(day)).toBe(4);
  });

  it("counts an ungrouped venue on its own", () => {
    expect(countWalkUps([stop("a", { propertyId: "x" }), stop("b", { propertyId: "y" })])).toBe(2);
  });

  it("counts two venues at one property separately when undeclared", () => {
    expect(countWalkUps([stop("a"), stop("b")])).toBe(2);
  });

  it("is zero for an empty day", () => {
    expect(countWalkUps([])).toBe(0);
  });
});

describe("countFinishedWalkUps", () => {
  const withStatus = (ids: Record<string, string>) =>
    day.map((s) => (ids[s.id] ? { ...s, status: ids[s.id] } : s));

  it("does not count a walk-up until every venue is finished", () => {
    expect(countFinishedWalkUps(withStatus({ pacificPool: "COMPLETED" }))).toBe(0);
  });

  it("counts it once the last venue finishes", () => {
    expect(countFinishedWalkUps(withStatus({ pacificPool: "COMPLETED", pacificSpa: "COMPLETED" }))).toBe(1);
  });

  /** Nobody is going back for a skipped spa, so the stop is settled. */
  it("treats a skipped venue as finished alongside a completed one", () => {
    expect(countFinishedWalkUps(withStatus({ pacificPool: "COMPLETED", pacificSpa: "CANCELLED" }))).toBe(1);
  });

  it("counts a lone completed stop", () => {
    expect(countFinishedWalkUps(withStatus({ tailgate: "COMPLETED" }))).toBe(1);
  });

  it("can reach the whole day", () => {
    const allDone = day.map((s) => ({ ...s, status: "COMPLETED" }));
    expect(countFinishedWalkUps(allDone)).toBe(countWalkUps(day));
  });

  it("is zero when nothing is finished", () => {
    expect(countFinishedWalkUps(day)).toBe(0);
  });
});
