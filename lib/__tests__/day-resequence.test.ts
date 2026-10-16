import { describe, it, expect } from "vitest";
import { resequenceDay, type DaySequenceItem } from "@/lib/day-resequence";

function visit(id: string, seq: number | null, moveKey: string | null = null): DaySequenceItem {
  return { kind: "visit", id, seq, tiebreak: 0, moveKey };
}
function errand(id: string, seq: number | null): DaySequenceItem {
  return { kind: "adhoc", id, seq, tiebreak: 0, moveKey: null };
}

describe("resequenceDay", () => {
  it("writes nothing when the day already matches", () => {
    const day = [visit("a", 0, "A"), visit("b", 1, "B"), visit("c", 2, "C")];
    expect(resequenceDay(day, ["A", "B", "C"])).toEqual([]);
  });

  it("writes only the positions that move", () => {
    const day = [visit("a", 0, "A"), visit("b", 1, "B"), visit("c", 2, "C")];
    const writes = resequenceDay(day, ["A", "C", "B"]);
    expect(writes).toEqual([
      { kind: "visit", id: "c", index: 1 },
      { kind: "visit", id: "b", index: 2 },
    ]);
  });

  /**
   * The Oct 23 shape: San Tropez's three stops are on the route but had no visits that day, so
   * generation was about to insert them at their sortOrder positions 2/3/4 -- straight on top of
   * Milennium and both Playa Vista stops. Resequencing the day instead gives everyone a distinct
   * position.
   */
  it("gives every item a distinct position when new stops arrive mid-day", () => {
    const day = [
      visit("tailgate", 0, "TAILGATE"),
      visit("baymont", 1, "BAYMONT"),
      visit("milennium", 2, "MILENNIUM"),
      visit("playaWading", 3, "PLAYA_W"),
      visit("playaPool", 4, "PLAYA_P"),
      // freshly generated, all currently claiming positions already taken
      visit("sanTropezSpa", 2, "ST_SPA"),
      visit("sanTropezMain", 3, "ST_MAIN"),
      visit("sanTropezP2", 4, "ST_P2"),
    ];
    const routeOrder = ["TAILGATE", "BAYMONT", "ST_SPA", "ST_MAIN", "ST_P2", "MILENNIUM", "PLAYA_W", "PLAYA_P"];
    const writes = resequenceDay(day, routeOrder);

    const finalIndex = new Map(day.map((i) => [i.id, i.seq as number]));
    for (const w of writes) finalIndex.set(w.id, w.index);
    const positions = [...finalIndex.values()].sort((a, b) => a - b);
    expect(positions).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(positions).size).toBe(8);
  });

  it("keeps errands in the sequence and can move them", () => {
    const day = [visit("a", 0, "A"), errand("store", 1), visit("b", 2, "B")];
    const writes = resequenceDay(day, ["B", "A"]);
    const ids = new Map(day.map((i) => [i.id, i.seq as number]));
    for (const w of writes) ids.set(w.id, w.index);
    // The errand trails the stop it currently follows, so it travels with "a".
    expect([...ids.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id)).toEqual(["b", "a", "store"]);
    expect(writes.some((w) => w.kind === "adhoc")).toBe(true);
  });

  it("sorts an unpositioned item last before deciding", () => {
    const day = [visit("a", 0, "A"), visit("new", null, "NEW")];
    const writes = resequenceDay(day, ["A", "NEW"]);
    expect(writes).toEqual([{ kind: "visit", id: "new", index: 1 }]);
  });

  it("handles an empty day", () => {
    expect(resequenceDay([], ["A"])).toEqual([]);
  });
});
