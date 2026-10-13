import { describe, it, expect } from "vitest";
import { isPushedVisit } from "@/lib/visit-pushed";

const stamp = new Date("2026-09-30T11:00:00.000Z");

describe("isPushedVisit", () => {
  it("is pushed when still in progress and stamped", () => {
    expect(isPushedVisit({ status: "IN_PROGRESS", pushedAt: stamp })).toBe(true);
  });

  it("accepts a serialized stamp, since client components receive strings", () => {
    expect(isPushedVisit({ status: "IN_PROGRESS", pushedAt: stamp.toISOString() })).toBe(true);
  });

  /** Also the shape of a RESUMED stop: as of 2026-10-11 arrival clears pushedAt, so picking a
   *  swept stop back up lands here rather than continuing to read "Pushed". */
  it("is not pushed while the stop is still open on its own day", () => {
    expect(isPushedVisit({ status: "IN_PROGRESS", pushedAt: null })).toBe(false);
  });

  /** Completion does not clear the stamp, so this is the case that decides whether the rule is
   *  written the right way round: finishing a pushed stop later must read as Completed. */
  it("is not pushed once someone actually completed it", () => {
    expect(isPushedVisit({ status: "COMPLETED", pushedAt: stamp })).toBe(false);
  });

  it("is not pushed when the stop was cancelled", () => {
    expect(isPushedVisit({ status: "CANCELLED", pushedAt: stamp })).toBe(false);
  });

  it("is not pushed when it was never started and never swept", () => {
    expect(isPushedVisit({ status: "SCHEDULED", pushedAt: null })).toBe(false);
  });

  /** As of 2026-10-13 the sweep closes out stops nobody ever started, which had been accumulating
   *  as permanently-overdue -- 109 of them. They carry the stamp while still SCHEDULED. */
  it("IS pushed when a never-started stop has been swept", () => {
    expect(isPushedVisit({ status: "SCHEDULED", pushedAt: stamp })).toBe(true);
  });

  it("is not pushed once a swept never-started stop is completed later", () => {
    expect(isPushedVisit({ status: "COMPLETED", pushedAt: stamp })).toBe(false);
  });
});
