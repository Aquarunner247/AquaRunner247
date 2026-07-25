import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Seeds full structured ComplianceRuleset data (chemistry thresholds, frequency rules,
 * event protocols, flagged gaps/conflicts) for the 9 states with real extracted
 * regulatory data in state-compliance-data.md. Run prisma/seed-compliance-rulesets.ts
 * first to ensure every state has at least a bare stub row.
 *
 * Idempotent: each state's seed deletes and recreates its own child rows inside a
 * transaction, so re-running this script is safe and one state's data never leaks into
 * another's.
 *
 * Usage:
 *   DATABASE_URL="<local dev connection string only -- see claude-code-handoff-
 *     compliance-ruleset.md, this must never run against production>" \
 *     npx tsx prisma/seed-compliance-data.ts [stateCode]
 *
 *   With no argument, seeds all 9 states. With a state code (e.g. "NV"), seeds just
 *   that one -- used to seed states one at a time per the handoff's build order.
 */

type ChemistryThresholdInput = Omit<Prisma.ChemistryThresholdCreateManyInput, "complianceRulesetId">;
type FrequencyRuleInput = Omit<Prisma.FrequencyRuleCreateManyInput, "complianceRulesetId">;
type EventProtocolInput = Omit<Prisma.EventProtocolCreateManyInput, "complianceRulesetId">;
type ComplianceNoteInput = Omit<Prisma.ComplianceNoteCreateManyInput, "complianceRulesetId">;

type StateSeed = {
  state: string;
  ruleset: Omit<
    Prisma.ComplianceRulesetCreateInput,
    "state" | "chemistryThresholds" | "frequencyRules" | "eventProtocols" | "complianceNotes" | "organizations"
  >;
  chemistryThresholds: ChemistryThresholdInput[];
  frequencyRules: FrequencyRuleInput[];
  eventProtocols: EventProtocolInput[];
  complianceNotes: ComplianceNoteInput[];
};

async function seedState(seed: StateSeed) {
  const ruleset = await prisma.complianceRuleset.upsert({
    where: { state: seed.state },
    create: { state: seed.state, ...seed.ruleset },
    update: seed.ruleset,
    select: { id: true, stateName: true },
  });

  await prisma.$transaction([
    prisma.chemistryThreshold.deleteMany({ where: { complianceRulesetId: ruleset.id } }),
    prisma.frequencyRule.deleteMany({ where: { complianceRulesetId: ruleset.id } }),
    prisma.eventProtocol.deleteMany({ where: { complianceRulesetId: ruleset.id } }),
    prisma.complianceNote.deleteMany({ where: { complianceRulesetId: ruleset.id } }),
    prisma.chemistryThreshold.createMany({
      data: seed.chemistryThresholds.map((t) => ({ ...t, complianceRulesetId: ruleset.id })),
    }),
    prisma.frequencyRule.createMany({
      data: seed.frequencyRules.map((f) => ({ ...f, complianceRulesetId: ruleset.id })),
    }),
    prisma.eventProtocol.createMany({
      data: seed.eventProtocols.map((e) => ({ ...e, complianceRulesetId: ruleset.id })),
    }),
    prisma.complianceNote.createMany({
      data: seed.complianceNotes.map((n) => ({ ...n, complianceRulesetId: ruleset.id })),
    }),
  ]);

  console.log(
    `  ${seed.state} (${ruleset.stateName}): ${seed.chemistryThresholds.length} thresholds, ${seed.frequencyRules.length} frequency rules, ${seed.eventProtocols.length} event protocols, ${seed.complianceNotes.length} notes`,
  );
}

// ---------------------------------------------------------------------------
// Nevada -- migrated from the previous pass's flat ComplianceRuleset fields, which were
// themselves migrated from the hardcoded values in app/dashboard/page.tsx,
// app/p/[publicSlug]/page.tsx, app/components/alerts-bell.tsx, and the visit-completion
// CYA-freshness check. See COMPLIANCE_RULESET_NOTES.md's "Migrating Nevada off the flat
// fields" section. This is the regression-check state: the app's existing behavior must
// be unchanged after reading from these rows instead of flat fields.
// ---------------------------------------------------------------------------
const NEVADA: StateSeed = {
  state: "NV",
  ruleset: {
    stateName: "Nevada",
    // Southern Nevada Health District is technically a Clark County entity, not a
    // statewide Nevada agency -- the only district AquaRunner has built rules for so far.
    healthDepartmentName: "Southern Nevada Health District",
    isSupported: true,
    jurisdictionLevel: "COUNTY",
    countyName: "Clark County",
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "SNHD paper log format",
    logSheetSourceNotes: "AquaRunner's public QR inspector log mirrors the layout of SNHD's paper chemistry/equipment log sheets.",
    codeReferenceLabel: "Southern Nevada Health District — Pool & Spa Regulations",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under SNHD (Clark County). These
are the same thresholds already built into the app's closure-risk banners and inspector log --
this page documents them in one place rather than asserting new rules.

### Chemistry targets (routine range)
- **Free chlorine:** 2 ppm minimum (pools), 3 ppm minimum (spas), 10 ppm maximum
- **pH:** 7.2 – 7.8
- **Total alkalinity:** 60 – 180 ppm
- **Cyanuric acid:** 30 – 50 ppm, tested at least once every 30 days

### Closure-risk hazard thresholds
Readings outside these ranges are flagged as an imminent health hazard requiring closure
until resolved:
- **pH:** below 6.5 or above 8.0
- **Cyanuric acid:** above 100 ppm

A closure carries a $909 reopening fee once triggered.

### Log format
The public per-body-of-water inspector log mirrors SNHD's paper chemistry/equipment log
layout, so an inspector can review it the same way as a physical binder.

*This page reflects AquaRunner's built-in rule engine, not a substitute for SNHD's own
published code. Verify against the authoritative source for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 2, maxValue: 10, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 3, maxValue: 10, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "PH", idealMin: 7.2, idealMax: 7.8, hazardMin: 6.5, hazardMax: 8.0, unit: "", sourceConfidence: "confirmed" },
    { parameter: "TOTAL_ALKALINITY", idealMin: 60, idealMax: 180, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "CYANURIC_ACID", idealMin: 30, idealMax: 50, hazardMax: 100, unit: "ppm", sourceConfidence: "confirmed" },
  ],
  frequencyRules: [{ parameter: "CYANURIC_ACID", cadence: "every 30 days", intervalMinutes: 43200 }],
  eventProtocols: [
    {
      triggerType: "CHEMISTRY_HAZARD_THRESHOLD",
      triggerLabel: "pH or cyanuric acid outside the hazard range",
      closureKind: "CHEMISTRY_HAZARD_THRESHOLD",
      reopeningCondition: "Return pH to 6.5–8.0 and cyanuric acid to ≤100 ppm.",
      feeAmount: 909,
      feeNote: "reopening fee",
      sourceConfidence: "confirmed",
    },
  ],
  complianceNotes: [],
};

const ALL_STATES: StateSeed[] = [NEVADA];

async function main() {
  const arg = process.argv[2]?.toUpperCase();
  const toSeed = arg ? ALL_STATES.filter((s) => s.state === arg) : ALL_STATES;
  if (arg && toSeed.length === 0) {
    throw new Error(`No seed data defined yet for state "${arg}". Defined: ${ALL_STATES.map((s) => s.state).join(", ")}`);
  }

  console.log(`Seeding ${toSeed.length} state(s): ${toSeed.map((s) => s.state).join(", ")}`);
  for (const state of toSeed) {
    await seedState(state);
  }
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
