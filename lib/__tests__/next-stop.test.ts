import { describe, expect, it } from "vitest";
import { pickNextStop, type NextStopCandidate } from "@/lib/next-stop";

function stop(id: string, seq: number | null, done = false, createdAtMs = 0): NextStopCandidate {
  return { id, kind: "visit", routeSequence: seq, done, createdAtMs };
}

describe("pickNextStop", () => {
  it("returns the next stop after the one just finished", () => {
    const all = [stop("a", 0, true), stop("b", 1), stop("c", 2)];
    expect(pickNextStop(all, "a")?.id).toBe("b");
  });

  it("skips stops already done", () => {
    const all = [stop("a", 0, true), stop("b", 1, true), stop("c", 2)];
    expect(pickNextStop(all, "a")?.id).toBe("c");
  });

  it("is null when everything else is done", () => {
    expect(pickNextStop([stop("a", 0, true), stop("b", 1, true)], "a")).toBeNull();
  });

  it("sends a technician onward rather than backward when they skipped ahead", () => {
    // Finished stop 3 with stop 1 still outstanding: going on to 4 beats doubling back.
    const all = [stop("a", 0), stop("b", 1, true), stop("c", 2, true), stop("d", 3)];
    expect(pickNextStop(all, "c")?.id).toBe("d");
  });

  it("falls back to earlier unfinished work when nothing follows", () => {
    // Finished the LAST stop but stop 1 was never done -- there is still work, so say so.
    const all = [stop("a", 0), stop("b", 1, true)];
    expect(pickNextStop(all, "b")?.id).toBe("a");
  });

  it("never returns the stop just finished", () => {
    expect(pickNextStop([stop("a", 0)], "a")).toBeNull();
  });

  it("ranks errands in the same sequence space as visits", () => {
    const all: NextStopCandidate[] = [
      stop("visit1", 0, true),
      { id: "errand", kind: "adhoc", routeSequence: 1, done: false, createdAtMs: 0 },
      stop("visit2", 2),
    ];
    expect(pickNextStop(all, "visit1")?.id).toBe("errand");
  });

  it("sorts a null sequence last", () => {
    const all = [stop("a", 0, true), stop("legacy", null), stop("b", 1)];
    expect(pickNextStop(all, "a")?.id).toBe("b");
  });

  it("tiebreaks equal sequences by creation order", () => {
    const all = [stop("a", 0, true), stop("later", 1, false, 200), stop("earlier", 1, false, 100)];
    expect(pickNextStop(all, "a")?.id).toBe("earlier");
  });

  it("handles the finished stop not being in the list", () => {
    const all = [stop("a", 0), stop("b", 1)];
    expect(pickNextStop(all, "missing")?.id).toBe("a");
  });

  it("is null for an empty day", () => {
    expect(pickNextStop([], "a")).toBeNull();
  });
});
