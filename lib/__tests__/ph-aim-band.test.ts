import { describe, it, expect, vi } from "vitest";

// lib/dosing-calculator.ts imports lib/prisma, which builds a connection Pool at module load
// and throws without DATABASE_URL. Same mock as lib/__tests__/compliance-reading-fields.test.ts
// -- nothing under test here touches the database.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { applyPhAimBand, PH_ACID_CEILING, PH_AIM } from "@/lib/dosing-calculator";

/** Nevada as seeded: ideal 7.0-7.8, which activeChemistryThresholds prefers over the legal
 * band, so this is the exact shape that left 7.8 silent. */
const nevada = { targetValue: 7.4, boundMin: 7.0, boundMax: 7.8 };

describe("applyPhAimBand", () => {
  it("pulls a wide state ceiling down to where acid starts", () => {
    expect(applyPhAimBand(nevada).boundMax).toBe(PH_ACID_CEILING);
  });

  it("leaves the state's floor alone", () => {
    // The operator asked for acid above 7.6 and nothing about the low side; tightening the
    // floor would start demanding a Base Demand test on readings nobody complained about.
    expect(applyPhAimBand(nevada).boundMin).toBe(7.0);
  });

  it("aims at the Acid Demand endpoint, not the band's midpoint", () => {
    expect(applyPhAimBand(nevada).targetValue).toBe(PH_AIM);
  });

  it("keeps a state band already tighter than the ceiling", () => {
    // Illinois: routine 7.2-7.6. Its own number is already the stricter one.
    const illinois = { targetValue: 7.4, boundMin: 7.2, boundMax: 7.6 };
    expect(applyPhAimBand(illinois)).toEqual({ targetValue: 7.5, boundMin: 7.2, boundMax: 7.6 });
  });

  it("never raises a ceiling", () => {
    const narrow = { targetValue: 7.3, boundMin: 7.2, boundMax: 7.4 };
    const result = applyPhAimBand(narrow);
    expect(result.boundMax).toBe(7.4);
    // The aim has to come back inside the band it was clamped into, or the card would print a
    // target the technician is being told not to reach.
    expect(result.targetValue).toBe(7.4);
  });

  it("never pushes the ceiling below the floor", () => {
    // No state seeds a pH floor above 7.6 today (every one is 7.2 or lower), but an inverted
    // band would make isInRange reject every possible reading, so it is guarded rather than
    // assumed away.
    const hypothetical = { targetValue: 7.9, boundMin: 7.8, boundMax: 8.2 };
    const result = applyPhAimBand(hypothetical);
    expect(result.boundMax).toBe(7.8);
    expect(result.targetValue).toBe(7.8);
  });

  it("imposes the ceiling when a ruleset gives a floor and no maximum", () => {
    const floorOnly = { targetValue: 7.2, boundMin: 7.2, boundMax: null };
    expect(applyPhAimBand(floorOnly).boundMax).toBe(PH_ACID_CEILING);
  });
});

/** The in/out decision the Dosing Card actually makes, mirroring isInRange's own
 * at-the-boundary-is-inside rule: "not at 7.6 but anything above 7.6" (operator, 2026-11-17). */
function promptsFor(ph: number): "LOWER" | "RAISE" | null {
  const band = applyPhAimBand(nevada);
  if (band.boundMin != null && ph < band.boundMin) return "RAISE";
  if (band.boundMax != null && ph > band.boundMax) return "LOWER";
  return null;
}

describe("the pH readings this changes", () => {
  it("asks for acid at 7.8 -- 203 readings in 90 days that said nothing", () => {
    expect(promptsFor(7.8)).toBe("LOWER");
  });

  it("asks for acid at 7.7", () => {
    expect(promptsFor(7.7)).toBe("LOWER");
  });

  it("stays quiet at exactly 7.6", () => {
    expect(promptsFor(7.6)).toBeNull();
  });

  it("stays quiet across the common readings", () => {
    // 7.40 (801 readings), 7.50 (350) and 7.60 (309) are three quarters of this org's log.
    expect(promptsFor(7.4)).toBeNull();
    expect(promptsFor(7.5)).toBeNull();
  });

  it("still asks for acid at 8.0, as it already did", () => {
    expect(promptsFor(8.0)).toBe("LOWER");
  });

  it("does not start prompting on the low side", () => {
    // 7.0-7.3 is 121 readings in the same window. Unchanged, deliberately.
    expect(promptsFor(7.3)).toBeNull();
    expect(promptsFor(7.2)).toBeNull();
    expect(promptsFor(7.0)).toBeNull();
  });

  it("still asks for a base at 6.5, as it already did", () => {
    expect(promptsFor(6.5)).toBe("RAISE");
  });
});
