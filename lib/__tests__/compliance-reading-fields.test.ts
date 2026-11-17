import { describe, it, expect, vi } from "vitest";

// lib/compliance.ts imports lib/prisma, which builds a live connection pool at module load
// and throws without DATABASE_URL. activeReadingFields is pure -- it reads the ruleset rows
// handed to it and touches nothing else -- so the chain is stubbed rather than stood up,
// same as lib/__tests__/recording-notice.test.ts.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { activeReadingFields, temperatureThreshold, type ComplianceRulesetWithRules } from "@/lib/compliance";

/**
 * Water temperature's place on the chemistry card.
 *
 * Every other field there appears only when the body of water's own state defines a
 * threshold for it. Temperature is the deliberate exception: no state frames it as
 * pass/fail, it is absent from activeChemistryThresholds entirely, and it is what explains
 * chlorine demand -- so it shows everywhere and blocks nothing. Nevada, which has no
 * TEMPERATURE row at all, is the case that made this visible: 1,783 of 1,796 production
 * readings had no temperature because the field was never on the screen.
 */

type Threshold = ComplianceRulesetWithRules["chemistryThresholds"][number];

/** Only the columns activeReadingFields actually reads; the rest of the row is irrelevant here. */
function threshold(partial: {
  parameter: string;
  bodyOfWaterCategory?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  idealMin?: number | null;
  idealMax?: number | null;
  hazardMin?: number | null;
  hazardMax?: number | null;
  unit?: string | null;
  appliesWhen?: string | null;
}): Threshold {
  return {
    parameter: partial.parameter,
    bodyOfWaterCategory: partial.bodyOfWaterCategory ?? null,
    appliesWhen: partial.appliesWhen ?? null,
    minValue: partial.minValue ?? null,
    maxValue: partial.maxValue ?? null,
    idealMin: partial.idealMin ?? null,
    idealMax: partial.idealMax ?? null,
    hazardMin: partial.hazardMin ?? null,
    hazardMax: partial.hazardMax ?? null,
    unit: partial.unit ?? null,
  } as unknown as Threshold;
}

function ruleset(thresholds: Threshold[], isSupported = true): ComplianceRulesetWithRules {
  return {
    isSupported,
    chemistryThresholds: thresholds,
    frequencyRules: [],
    eventProtocols: [],
    equipmentReadingRequirements: [],
  } as unknown as ComplianceRulesetWithRules;
}

/** The smallest supported ruleset that isn't about temperature, so the card isn't empty. */
const CHLORINE_POOL = threshold({ parameter: "FREE_CHLORINE", bodyOfWaterCategory: "POOL", minValue: 2, maxValue: 10, unit: "ppm" });
const CHLORINE_SPA = threshold({ parameter: "FREE_CHLORINE", bodyOfWaterCategory: "SPA", minValue: 3, maxValue: 10, unit: "ppm" });

const temperatureFieldOf = (fields: ReturnType<typeof activeReadingFields>) =>
  fields.filter((f) => f.key === "temperatureF");

describe("activeReadingFields: water temperature", () => {
  it("shows temperature for a state with no TEMPERATURE row at all (Nevada's shape)", () => {
    const fields = activeReadingFields(ruleset([CHLORINE_POOL]), "POOL", "CHLORINE", true);
    const temp = temperatureFieldOf(fields);

    expect(temp).toHaveLength(1);
    expect(temp[0].label).toBe("Water Temperature");
    expect(temp[0].unitLabel).toBe("°F");
    expect(temp[0].required).toBe(false);
  });

  it("draws no ideal band when the state defines none, rather than inventing one", () => {
    const [temp] = temperatureFieldOf(activeReadingFields(ruleset([CHLORINE_POOL]), "POOL", "CHLORINE", true));

    // Both null is what makes the gauge render without a coloured zone or an "Ideal x-y"
    // label. A number here would be this app asserting a range no regulation gave it.
    expect(temp.zoneMin).toBeNull();
    expect(temp.zoneMax).toBeNull();
  });

  it("appears exactly once, never duplicated by the fallback path", () => {
    const withRow = activeReadingFields(
      ruleset([CHLORINE_POOL, threshold({ parameter: "TEMPERATURE", maxValue: 104, unit: "°F" })]),
      "POOL",
      "CHLORINE",
      true,
    );
    expect(temperatureFieldOf(withRow)).toHaveLength(1);
  });

  it("uses the unconditional row's numbers when the state has one (Colorado's shape)", () => {
    const fields = activeReadingFields(
      ruleset([
        CHLORINE_POOL,
        threshold({ parameter: "TEMPERATURE", minValue: 77, maxValue: 104, idealMin: 82, idealMax: 84, unit: "°F" }),
      ]),
      "POOL",
      "CHLORINE",
      true,
    );
    const [temp] = temperatureFieldOf(fields);

    // idealMin/idealMax win over the outer min/max, same precedence as every other field.
    expect(temp.zoneMin).toBe(82);
    expect(temp.zoneMax).toBe(84);
  });

  it("matches the body category's own row before the unconditional one", () => {
    // Alabama's shape: a POOL comfort range and a SPA ceiling, no unconditional row. Matching
    // on null alone found neither, so these states showed no temperature field either.
    const thresholds = [
      CHLORINE_POOL,
      CHLORINE_SPA,
      threshold({ parameter: "TEMPERATURE", bodyOfWaterCategory: "POOL", idealMin: 78, idealMax: 82, unit: "°F" }),
      threshold({ parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: "°F" }),
    ];

    const [pool] = temperatureFieldOf(activeReadingFields(ruleset(thresholds), "POOL", "CHLORINE", true));
    expect(pool.zoneMin).toBe(78);
    expect(pool.zoneMax).toBe(82);

    const [spa] = temperatureFieldOf(activeReadingFields(ruleset(thresholds), "SPA", "CHLORINE", true));
    // A bare ceiling and no floor: still no band to draw, which is the honest rendering of a
    // rule that only says "not above 104".
    expect(spa.zoneMin).toBeNull();
    expect(spa.zoneMax).toBe(104);
  });

  it("falls back to the unconditional row for a body category the state does not scope", () => {
    // Wisconsin's shape: a SPA-specific row plus a pool range; a spa reads the spa row.
    const fields = activeReadingFields(
      ruleset([
        CHLORINE_POOL,
        threshold({ parameter: "TEMPERATURE", minValue: 70, maxValue: 90, unit: "°F" }),
        threshold({ parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", minValue: 90, maxValue: 104, unit: "°F" }),
      ]),
      "POOL",
      "CHLORINE",
      true,
    );
    const [temp] = temperatureFieldOf(fields);

    expect(temp.zoneMin).toBe(70);
    expect(temp.zoneMax).toBe(90);
  });

  it("never requires temperature, even where the state publishes a hard ceiling", () => {
    const fields = activeReadingFields(
      ruleset([CHLORINE_SPA, threshold({ parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", minValue: 90, maxValue: 104, unit: "°F" })]),
      "SPA",
      "CHLORINE",
      true,
    );
    const [temp] = temperatureFieldOf(fields);

    // A spa with no thermometer reading must still be a completable stop -- the complete
    // route gates on exactly this flag (app/api/visits/[id]/complete/route.ts).
    expect(temp.required).toBe(false);
  });

  it("carries the state's own unit label when it gives one", () => {
    const fields = activeReadingFields(
      ruleset([CHLORINE_POOL, threshold({ parameter: "TEMPERATURE", maxValue: 40, unit: "°C" })]),
      "POOL",
      "CHLORINE",
      true,
    );
    expect(temperatureFieldOf(fields)[0].unitLabel).toBe("°C");
  });

  it("includes temperature, unrequired, on the legacy fallback set for an unlinked account", () => {
    const [temp] = temperatureFieldOf(activeReadingFields(null, "POOL", "CHLORINE", true));

    expect(temp).toBeDefined();
    expect(temp.required).toBe(false);
    expect(temp.zoneMin).toBe(80);
    expect(temp.zoneMax).toBe(104);
  });

  it("stays unrequired for an unsupported state carrying advisory data only", () => {
    const fields = activeReadingFields(
      ruleset([CHLORINE_POOL, threshold({ parameter: "TEMPERATURE", minValue: 77, maxValue: 104, unit: "°F" })], false),
      "POOL",
      "CHLORINE",
      true,
    );
    const [temp] = temperatureFieldOf(fields);

    expect(temp.required).toBe(false);
    // The advisory numbers still render -- forceOptional strips required-ness, not the zone.
    expect(temp.zoneMin).toBe(77);
    expect(temp.zoneMax).toBe(104);
  });

  it("leaves every other field's presence driven by the state's own data", () => {
    // The exception is temperature and only temperature: a state with no alkalinity row
    // still shows no alkalinity field.
    const keys = activeReadingFields(ruleset([CHLORINE_POOL]), "POOL", "CHLORINE", true).map((f) => f.key);

    expect(keys).toContain("freeChlorinePpm");
    expect(keys).toContain("temperatureF");
    expect(keys).not.toContain("alkalinityPpm");
    expect(keys).not.toContain("cyanuricAcidPpm");
  });
});

describe("temperatureThreshold", () => {
  // Nevada's real shape as of 2026-11-16: a spa ceiling that is also the closure trigger,
  // and deliberately no pool rule at all.
  const NEVADA = ruleset([
    CHLORINE_POOL,
    CHLORINE_SPA,
    threshold({ parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: "\u00B0F" }),
  ]);

  const NEVADA_WITH_HAZARD = ruleset([
    CHLORINE_POOL,
    CHLORINE_SPA,
    threshold({ parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, hazardMax: 104, unit: "\u00B0F" }),
  ]);

  it("gives a spa its own ceiling", () => {
    expect(temperatureThreshold(NEVADA, "SPA")).toEqual({ max: 104, hazardMax: null, unit: "\u00B0F" });
  });

  it("gives a pool nothing rather than borrowing the spa's number", () => {
    // The failure this guards against is a pool inheriting 104 and then never flagging a
    // genuinely overheated body, or worse, a pool chart drawing a ceiling SNHD never set.
    expect(temperatureThreshold(NEVADA, "POOL")).toBeNull();
  });

  it("treats every non-spa body type as a pool, matching the rest of this file", () => {
    expect(temperatureThreshold(NEVADA, "OTHER")).toBeNull();
  });

  it("carries the hazard ceiling through when the state sets one", () => {
    expect(temperatureThreshold(NEVADA_WITH_HAZARD, "SPA")?.hazardMax).toBe(104);
  });

  it("falls back to the unconditional row for a body category the state does not scope", () => {
    const rs = ruleset([CHLORINE_POOL, threshold({ parameter: "TEMPERATURE", maxValue: 104, unit: "\u00B0F" })]);

    expect(temperatureThreshold(rs, "POOL")?.max).toBe(104);
    expect(temperatureThreshold(rs, "SPA")?.max).toBe(104);
  });

  it("returns null for a state with no temperature row at all", () => {
    expect(temperatureThreshold(ruleset([CHLORINE_POOL]), "POOL")).toBeNull();
    expect(temperatureThreshold(ruleset([CHLORINE_POOL]), "SPA")).toBeNull();
  });

  it("defaults the unit when the row leaves it blank", () => {
    const rs = ruleset([CHLORINE_SPA, threshold({ parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: null })]);
    expect(temperatureThreshold(rs, "SPA")?.unit).toBe("\u00B0F");
  });

  it("reports a hazard only strictly above the ceiling, never at it", () => {
    // Mirrors the comparison in app/dashboard/page.tsx: a spa sitting exactly at the
    // published limit is at the limit, not over it.
    const { hazardMax } = temperatureThreshold(NEVADA_WITH_HAZARD, "SPA")!;
    const isHazard = (reading: number) => hazardMax != null && reading > hazardMax;

    expect(isHazard(103.9)).toBe(false);
    expect(isHazard(104)).toBe(false);
    expect(isHazard(104.1)).toBe(true);
  });
});
