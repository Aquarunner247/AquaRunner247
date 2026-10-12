import { describe, expect, it } from "vitest";
import { MAX_PLAUSIBLE_VISIT_MS, resolveMissingArrival } from "../arrival-backfill";

const completedAt = new Date("2026-10-12T20:00:00.000Z");

describe("resolveMissingArrival", () => {
  it("accepts a plausible arrival the device recorded while offline", () => {
    const r = resolveMissingArrival("2026-10-12T19:05:00.000Z", completedAt);
    expect(r).toEqual({ kind: "use", startedAt: new Date("2026-10-12T19:05:00.000Z") });
  });

  it("refuses when the client supplies nothing -- the never-arrived case this gate is for", () => {
    expect(resolveMissingArrival(undefined, completedAt)).toEqual({ kind: "refuse" });
    expect(resolveMissingArrival("", completedAt)).toEqual({ kind: "refuse" });
    expect(resolveMissingArrival(null, completedAt)).toEqual({ kind: "refuse" });
  });

  it("refuses a value that is not a date", () => {
    expect(resolveMissingArrival("yesterday", completedAt)).toEqual({ kind: "refuse" });
    expect(resolveMissingArrival(1760000000000, completedAt)).toEqual({ kind: "refuse" });
  });

  it("refuses an arrival that is clearly after completion", () => {
    expect(resolveMissingArrival("2026-10-12T21:00:00.000Z", completedAt)).toEqual({ kind: "refuse" });
  });

  it("clamps a device clock running a little fast rather than refusing real work", () => {
    const r = resolveMissingArrival("2026-10-12T20:02:00.000Z", completedAt);
    expect(r).toEqual({ kind: "use", startedAt: completedAt });
  });

  it("refuses a stale value carried over from another day", () => {
    const stale = new Date(completedAt.getTime() - MAX_PLAUSIBLE_VISIT_MS - 60_000).toISOString();
    expect(resolveMissingArrival(stale, completedAt)).toEqual({ kind: "refuse" });
  });

  it("accepts a long but possible stop at the edge of the window", () => {
    const edge = new Date(completedAt.getTime() - MAX_PLAUSIBLE_VISIT_MS + 60_000).toISOString();
    expect(resolveMissingArrival(edge, completedAt).kind).toBe("use");
  });
});
