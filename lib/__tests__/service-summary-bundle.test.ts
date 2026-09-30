import { describe, expect, it } from "vitest";
import { resolveSummaryBundle, type BundleCandidate } from "@/lib/service-summary-bundle";

/** Real measured separations from this customer's pins: a pool and its spa sit 6-19m apart, while
 *  a front and back deck are 87m+. */
const BASE = { latitude: 36.1699, longitude: -115.1398 };
function north(meters: number) {
  return { latitude: BASE.latitude + meters / 111_320, longitude: BASE.longitude };
}

function visit(id: string, overrides: Partial<BundleCandidate> = {}): BundleCandidate {
  return {
    visitId: id,
    bodyType: "POOL",
    latitude: BASE.latitude,
    longitude: BASE.longitude,
    status: "COMPLETED",
    summaryEmailSentAt: null,
    ...overrides,
  };
}
function spa(id: string, overrides: Partial<BundleCandidate> = {}): BundleCandidate {
  return visit(id, { bodyType: "SPA", ...overrides });
}

describe("resolveSummaryBundle", () => {
  it("treats a lone body as its own bundle and sends immediately", () => {
    const d = resolveSummaryBundle("pool", [visit("pool")]);
    expect(d.memberIds).toEqual(["pool"]);
    expect(d.readyToSend).toBe(true);
    expect(d.reason).toBe("ready");
  });

  /** The behaviour asked for: completing the pool sends nothing while the spa is outstanding. */
  it("waits while a sibling body is still outstanding", () => {
    const candidates = [visit("pool"), spa("spa", { ...north(7), status: "SCHEDULED" })];
    const d = resolveSummaryBundle("pool", candidates);
    expect(d.memberIds).toEqual(["pool", "spa"]);
    expect(d.readyToSend).toBe(false);
    expect(d.reason).toBe("members-outstanding");
  });

  it("sends once the last member of the bundle finishes", () => {
    const candidates = [visit("pool"), spa("spa", { ...north(7) })];
    const d = resolveSummaryBundle("spa", candidates);
    expect(d.readyToSend).toBe(true);
    expect(d.completedIds).toEqual(["pool", "spa"]);
    expect(d.skippedIds).toEqual([]);
  });

  it("counts a skipped member as finished, and names it", () => {
    const candidates = [visit("pool"), spa("spa", { ...north(7), status: "CANCELLED" })];
    const d = resolveSummaryBundle("pool", candidates);
    expect(d.readyToSend).toBe(true);
    expect(d.completedIds).toEqual(["pool"]);
    expect(d.skippedIds).toEqual(["spa"]);
  });

  it("sends nothing when every member was skipped", () => {
    const candidates = [visit("pool", { status: "CANCELLED" }), spa("spa", { ...north(7), status: "CANCELLED" })];
    const d = resolveSummaryBundle("pool", candidates);
    expect(d.readyToSend).toBe(false);
    expect(d.reason).toBe("nothing-completed");
  });

  /** The duplicate guard. Two completions landing together must not both send. */
  it("refuses once any member has already been emailed", () => {
    const candidates = [visit("pool", { summaryEmailSentAt: new Date() }), spa("spa", { ...north(7) })];
    const d = resolveSummaryBundle("spa", candidates);
    expect(d.readyToSend).toBe(false);
    expect(d.reason).toBe("already-sent");
  });

  it("keeps a front and back deck as separate emails", () => {
    // The Alcove: back pool/spa and front pool/spa, the two decks 136m apart.
    const candidates = [
      visit("backPool"),
      spa("backSpa", { ...north(12.3) }),
      visit("frontPool", { ...north(136) }),
      spa("frontSpa", { ...north(136 + 6.5) }),
    ];
    expect(resolveSummaryBundle("backPool", candidates).memberIds).toEqual(["backPool", "backSpa"]);
    expect(resolveSummaryBundle("frontSpa", candidates).memberIds).toEqual(["frontPool", "frontSpa"]);
  });

  /**
   * OYO's two pools are 16m apart but both POOL, so they no longer share a card -- and must not
   * share an email either, or the customer gets one message for what are two separate records and
   * the reason the bodies were split in the first place is undone.
   */
  it("keeps two pools of the same kind as separate emails even at 16m", () => {
    const candidates = [visit("pool1"), visit("pool2", { ...north(16) })];
    expect(resolveSummaryBundle("pool1", candidates).memberIds).toEqual(["pool1"]);
    expect(resolveSummaryBundle("pool2", candidates).memberIds).toEqual(["pool2"]);
    expect(resolveSummaryBundle("pool1", candidates).readyToSend).toBe(true);
  });

  it("bundles a pool with a wading pool, which is a different kind", () => {
    // Playa Vista: POOL + OTHER, 17.4m apart.
    const candidates = [visit("pool"), visit("wading", { bodyType: "OTHER", ...north(17.4) })];
    expect(resolveSummaryBundle("pool", candidates).memberIds).toEqual(["pool", "wading"]);
  });

  it("does not bundle a body with no pin, so it can't be assumed nearby", () => {
    const candidates = [visit("pool"), spa("spa", { latitude: null, longitude: null })];
    expect(resolveSummaryBundle("pool", candidates).memberIds).toEqual(["pool"]);
    expect(resolveSummaryBundle("spa", candidates).memberIds).toEqual(["spa"]);
  });

  it("falls back to the visit alone if it isn't among the candidates", () => {
    // Defensive: a caller passing a mismatched set should not crash the completion request.
    const d = resolveSummaryBundle("missing", [visit("pool")]);
    expect(d.memberIds).toEqual(["missing"]);
    expect(d.completedIds).toEqual([]);
    expect(d.readyToSend).toBe(false);
    expect(d.reason).toBe("nothing-completed");
  });

  it("handles a three-body bundle, sending only after the third finishes", () => {
    const withStatus = (s: string) => [
      visit("pool"),
      spa("spa", { ...north(6) }),
      visit("wading", { bodyType: "OTHER", ...north(10), status: s }),
    ];
    expect(resolveSummaryBundle("pool", withStatus("IN_PROGRESS")).readyToSend).toBe(false);
    const done = resolveSummaryBundle("wading", withStatus("COMPLETED"));
    expect(done.readyToSend).toBe(true);
    expect(done.completedIds).toEqual(["pool", "spa", "wading"]);
  });
});
