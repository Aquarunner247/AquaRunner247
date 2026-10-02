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

  it("is not pushed while the stop is still open on its own day", () => {
    expect(isPushedVisit({ status: "IN_PROGRESS", pushedAt: null })).toBe(false);
  });

  /** The stamp is never cleared, so this is the case that decides whether the rule is written the
   *  right way round: finishing a pushed stop later must read as Completed. */
  it("is not pushed once someone actually completed it", () => {
    expect(isPushedVisit({ status: "COMPLETED", pushedAt: stamp })).toBe(false);
  });

  it("is not pushed when the stop was cancelled", () => {
    expect(isPushedVisit({ status: "CANCELLED", pushedAt: stamp })).toBe(false);
  });

  it("is not pushed when it was never started", () => {
    expect(isPushedVisit({ status: "SCHEDULED", pushedAt: null })).toBe(false);
  });
});
