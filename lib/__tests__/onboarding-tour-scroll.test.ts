import { describe, expect, it } from "vitest";
import { tourScrollDecision } from "@/lib/onboarding-tour-scroll";

/**
 * A phone-ish window, so the numbers below read as plausible screens rather than as arithmetic.
 * With the default 24px margin this leaves 752px of usable height, which is the threshold a
 * target has to reach to count as "taller than the window".
 */
const VIEWPORT = 800;

function box(top: number, height: number) {
  return { top, bottom: top + height, height };
}

describe("tourScrollDecision", () => {
  describe("a target the reader can already see", () => {
    it("does not scroll", () => {
      const decision = tourScrollDecision({ target: box(100, 200), viewportHeight: VIEWPORT });
      expect(decision).toEqual({ scroll: false, reason: "already-visible" });
    });

    it("does not scroll when it sits exactly on the margins", () => {
      // top === margin, bottom === viewportHeight - margin, and short enough to stay off the
      // tall-target path.
      expect(tourScrollDecision({ target: box(24, 750), viewportHeight: VIEWPORT }).scroll).toBe(false);
    });

    /**
     * The reason the visibility test exists at all. Several tours point at consecutive cards
     * inside one section; centring each of them in turn would tug the page on every Next even
     * though the reader is already looking at the right place.
     */
    it("leaves the page alone across consecutive steps within one screen", () => {
      for (const top of [60, 180, 300, 420, 540]) {
        expect(tourScrollDecision({ target: box(top, 120), viewportHeight: VIEWPORT }).scroll).toBe(false);
      }
    });
  });

  describe("a target the reader cannot see", () => {
    /**
     * The actual bug: /dashboard/routes orders its steps top-to-bottom down a long page, so by
     * the third or fourth one the target was hundreds of pixels below the fold -- spotlight
     * off-screen, bubble clamped to the viewport edge, callout describing nothing visible.
     */
    it("scrolls a target below the fold to the centre", () => {
      expect(tourScrollDecision({ target: box(1400, 200), viewportHeight: VIEWPORT })).toEqual({
        scroll: true,
        block: "center",
      });
    });

    it("scrolls back up for a target above the viewport", () => {
      expect(tourScrollDecision({ target: box(-300, 200), viewportHeight: VIEWPORT })).toEqual({
        scroll: true,
        block: "center",
      });
    });

    it("scrolls when only the top of the target is showing", () => {
      expect(tourScrollDecision({ target: box(700, 200), viewportHeight: VIEWPORT }).scroll).toBe(true);
    });

    it("scrolls when the target is flush against the top edge", () => {
      // Visible, but with no room above it for a top-placed bubble or the spotlight's padding.
      expect(tourScrollDecision({ target: box(10, 200), viewportHeight: VIEWPORT }).scroll).toBe(true);
    });
  });

  describe("a target taller than the window", () => {
    it("does not scroll while its top edge is visible and high", () => {
      const decision = tourScrollDecision({ target: box(100, 1500), viewportHeight: VIEWPORT });
      expect(decision).toEqual({ scroll: false, reason: "tall-top-visible" });
    });

    it("aligns to the start when its top has scrolled off", () => {
      expect(tourScrollDecision({ target: box(-500, 1500), viewportHeight: VIEWPORT })).toEqual({
        scroll: true,
        block: "start",
      });
    });

    it("aligns to the start when its top is stranded in the lower half", () => {
      expect(tourScrollDecision({ target: box(600, 1500), viewportHeight: VIEWPORT })).toEqual({
        scroll: true,
        block: "start",
      });
    });

    /**
     * Centring something taller than the window drives its heading off the top of the screen --
     * the one part of it the callout is naming.
     */
    it("never centres one", () => {
      for (const top of [-2000, -500, -1, 0, 401, 600, 1200]) {
        const decision = tourScrollDecision({ target: box(top, 1500), viewportHeight: VIEWPORT });
        if (decision.scroll) expect(decision.block).toBe("start");
      }
    });

    it("treats a target exactly filling the usable height as tall", () => {
      // 800 - 24*2 === 752, and the threshold is inclusive.
      const decision = tourScrollDecision({ target: box(24, 752), viewportHeight: VIEWPORT });
      expect(decision).toEqual({ scroll: false, reason: "tall-top-visible" });
    });
  });

  it("honours a caller-supplied margin", () => {
    const target = box(0, 200);
    expect(tourScrollDecision({ target, viewportHeight: VIEWPORT }).scroll).toBe(true);
    expect(tourScrollDecision({ target, viewportHeight: VIEWPORT, margin: 0 }).scroll).toBe(false);
  });
});
