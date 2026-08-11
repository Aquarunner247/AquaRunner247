/**
 * Simulates activeChemistryThresholds()/chlorineFamilyThreshold() against every
 * isSupported:true state's seed data, without touching the database. Exists because
 * COMPLIANCE_RULESET_NOTES.md's "Verifying isSupported readiness" section documents three
 * real bugs (Alabama, Connecticut, Hawaii) where a state's numbers were correct in the
 * seed file but silently resolved to null in the app due to a scoping mismatch --
 * invisible from reading the seed data alone. Run this before flipping any new state's
 * isSupported to true.
 *
 * Usage: node --env-file=.env node_modules/.bin/tsx prisma/verify-compliance-seed.ts
 * (needs DATABASE_URL because seed-compliance-data.ts imports lib/prisma at module load
 * and runs its own main() as a side effect -- against whatever DATABASE_URL points to, so
 * only ever run this against a local dev database, never production.)
 */

import { activeChemistryThresholds, chlorineFamilyThreshold } from "@/lib/compliance";
import { ALL_STATES } from "@/prisma/seed-compliance-data";

type FakeThreshold = {
  parameter: string;
  disinfectionMethod?: string;
  bodyOfWaterCategory?: string | null;
  appliesWhen?: string | null;
  minValue?: number | null;
  idealMin?: number | null;
  idealMax?: number | null;
  maxValue?: number | null;
  hazardMin?: number | null;
  hazardMax?: number | null;
  unit?: string | null;
};

function toChemistryThresholds(raw: FakeThreshold[]): any[] {
  return raw.map((t, i) => ({
    id: `fake-${i}`,
    complianceRulesetId: "fake",
    parameter: t.parameter,
    disinfectionMethod: t.disinfectionMethod ?? "NOT_APPLICABLE",
    bodyOfWaterCategory: t.bodyOfWaterCategory ?? null,
    indoorOutdoor: null,
    appliesWhen: t.appliesWhen ?? null,
    minValue: t.minValue ?? null,
    idealMin: t.idealMin ?? null,
    idealMax: t.idealMax ?? null,
    maxValue: t.maxValue ?? null,
    hazardMin: t.hazardMin ?? null,
    hazardMax: t.hazardMax ?? null,
    unit: t.unit ?? null,
    relationalRule: null,
    isCurveBased: false,
    curveDescription: null,
    curveDataPoints: null,
    sourceConfidence: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
}

let problems = 0;
let checked = 0;

for (const seed of ALL_STATES) {
  if (!seed.ruleset.isSupported) continue;
  checked++;

  const thresholds = toChemistryThresholds(seed.chemistryThresholds as unknown as FakeThreshold[]);
  const ruleset = {
    id: "fake",
    state: seed.state,
    chemistryThresholds: thresholds,
    frequencyRules: [] as any[],
    eventProtocols: [] as any[],
  } as any;

  const active = activeChemistryThresholds(ruleset);
  const issues: string[] = [];

  if (thresholds.some((t) => t.parameter === "PH") && active.phTargetMin == null && active.phTargetMax == null) {
    issues.push("PH: rows exist but phTargetMin/Max both resolved null");
  }

  const hasNumeric = (param: string) =>
    thresholds.some((t) => t.parameter === param && (t.minValue != null || t.maxValue != null || t.idealMin != null || t.idealMax != null));

  if (hasNumeric("TOTAL_ALKALINITY") && active.alkalinityTargetMinPpm == null && active.alkalinityTargetMaxPpm == null) {
    issues.push("TOTAL_ALKALINITY: numeric rows exist but both target bounds resolved null");
  }
  if (hasNumeric("CYANURIC_ACID") && active.cyaTargetMinPpm == null && active.cyaTargetMaxPpm == null) {
    issues.push("CYANURIC_ACID: numeric rows exist but both target bounds resolved null");
  }

  for (const bodyType of ["POOL", "SPA"] as const) {
    for (const method of ["CHLORINE", "BROMINE"] as const) {
      const param = method === "BROMINE" ? "BROMINE" : "FREE_CHLORINE";
      const rowsForCombo = thresholds.filter(
        (t) => t.parameter === param && t.bodyOfWaterCategory === bodyType && t.disinfectionMethod === method,
      );
      if (rowsForCombo.length === 0) continue;

      const result = chlorineFamilyThreshold(ruleset, bodyType, method as unknown as any);
      if (!result || (result.min == null && result.max == null)) {
        issues.push(`${param}/${bodyType}/${method}: ${rowsForCombo.length} row(s) exist but chlorineFamilyThreshold resolved null min & max`);
      }
    }
  }

  if (issues.length > 0) {
    problems++;
    console.log(`\n❌ ${seed.state} (${seed.ruleset.stateName})`);
    for (const issue of issues) console.log(`   - ${issue}`);
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`Checked ${checked} isSupported:true states. ${problems} state(s) with resolution issues.`);
if (problems === 0) {
  console.log("All isSupported:true states resolve their gated parameters correctly.");
} else {
  process.exitCode = 1;
}
