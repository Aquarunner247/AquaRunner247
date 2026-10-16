import { describe, it, expect } from "vitest";
import { mergeRouteOrderIntoDay, type DayOrderItem } from "@/lib/route-order-merge";

/** `a:A` = item id "a", movable route stop "A". `x` alone = a fixed item. */
function day(spec: string): DayOrderItem[] {
  return spec.split(" ").map((token) => {
    const [id, moveKey] = token.split(":");
    return { id, moveKey: moveKey ?? null };
  });
}

describe("mergeRouteOrderIntoDay", () => {
  it("puts the route's stops in the route's new order", () => {
    expect(mergeRouteOrderIntoDay(day("a:A b:B c:C"), ["C", "A", "B"])).toEqual(["c", "a", "b"]);
  });

  it("returns every item exactly once, so no two can share a position", () => {
    const current = day("a:A r b:B f c:C");
    const result = mergeRouteOrderIntoDay(current, ["C", "B", "A"]);
    expect([...result].sort()).toEqual(["a", "b", "c", "f", "r"]);
    expect(new Set(result).size).toBe(result.length);
  });

  /** The Rich's-Friday shape: Ritiro sits behind Pacific Harbors and should stay behind it. */
  it("keeps a fixed item with the stop it currently follows", () => {
    const result = mergeRouteOrderIntoDay(day("pac:PAC ritiro pas:PAS"), ["PAS", "PAC"]);
    expect(result).toEqual(["pas", "pac", "ritiro"]);
  });

  it("carries several trailers along, in their own order", () => {
    const result = mergeRouteOrderIntoDay(day("a:A t1 t2 b:B"), ["B", "A"]);
    expect(result).toEqual(["b", "a", "t1", "t2"]);
  });

  /** A morning's completed work sits ahead of every movable stop and belongs at the front. */
  it("leaves items that precede every movable stop at the front", () => {
    const result = mergeRouteOrderIntoDay(day("done1 done2 a:A b:B"), ["B", "A"]);
    expect(result).toEqual(["done1", "done2", "b", "a"]);
  });

  it("ignores route stops that are not on this day", () => {
    expect(mergeRouteOrderIntoDay(day("a:A b:B"), ["B", "ELSEWHERE", "A"])).toEqual(["b", "a"]);
  });

  /** A stop dropped from the route is still on the day and still needs a position. */
  it("keeps a movable stop the route no longer lists, at the end", () => {
    const result = mergeRouteOrderIntoDay(day("a:A orphan:ORPHAN b:B"), ["B", "A"]);
    expect(result).toEqual(["b", "a", "orphan"]);
  });

  it("handles a day with nothing movable on it", () => {
    expect(mergeRouteOrderIntoDay(day("x y z"), ["A", "B"])).toEqual(["x", "y", "z"]);
  });

  it("handles an empty day", () => {
    expect(mergeRouteOrderIntoDay([], ["A"])).toEqual([]);
  });

  /** Re-applying the order the day is already in must not shuffle anything. */
  it("is a no-op when the day already matches", () => {
    const current = day("a:A t b:B c:C");
    expect(mergeRouteOrderIntoDay(current, ["A", "B", "C"])).toEqual(["a", "t", "b", "c"]);
  });

  /** Running it twice gives the same answer as running it once. */
  it("is idempotent", () => {
    const current = day("a:A r b:B f c:C");
    const once = mergeRouteOrderIntoDay(current, ["C", "A", "B"]);
    const asItems: DayOrderItem[] = once.map((id) => current.find((i) => i.id === id)!);
    expect(mergeRouteOrderIntoDay(asItems, ["C", "A", "B"])).toEqual(once);
  });
});
