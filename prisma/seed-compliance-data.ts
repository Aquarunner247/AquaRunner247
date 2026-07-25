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

// ---------------------------------------------------------------------------
// Connecticut -- real thresholds are high-confidence (DPH guideline), but the source
// document has no closure-risk trigger at all and the CYA cadence is explicitly a
// business-decision assumption, not a sourced requirement. isSupported stays false: the
// app's Nevada-shaped consumption code would otherwise silently fall back to Nevada's
// hazard numbers for CT's missing hazard tier, which is exactly wrong (see design note
// above and COMPLIANCE_RULESET_NOTES.md).
// ---------------------------------------------------------------------------
const CONNECTICUT: StateSeed = {
  state: "CT",
  ruleset: {
    stateName: "Connecticut",
    healthDepartmentName: "Connecticut Department of Public Health",
    isSupported: false,
    jurisdictionLevel: "STATE",
    officialCitation: "CT Public Health Code § 19-13-B33b",
    sourceDocument:
      "Sanitation Guidelines from the Connecticut Department of Public Health — Inspection of Public Swimming Pools (DPH guideline summary, not full code text)",
    logSheetSource: "BUILT_FROM_CODE",
  },
  chemistryThresholds: [
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", minValue: 0.8, unit: "ppm", sourceConfidence: "confirmed", notes: "standard minimum residual" },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      minValue: 1.5,
      unit: "ppm",
      appliesWhen: "if chlorinated cyanurates used",
      sourceConfidence: "confirmed",
    },
    { parameter: "PH", idealMin: 7.2, idealMax: 7.8, unit: "", sourceConfidence: "confirmed", notes: "no separate closure-risk hazard tier stated" },
    { parameter: "TOTAL_ALKALINITY", idealMin: 80, idealMax: 120, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "CYANURIC_ACID", maxValue: 100, unit: "ppm", sourceConfidence: "confirmed" },
  ],
  frequencyRules: [
    {
      parameter: "ALL",
      cadence: "minimum daily; DPH recommends 3x/day",
      intervalMinutes: 1440,
      notes: "Bundled chlorine + pH reading. 1440 min reflects the required minimum; the 3x/day recommendation isn't a hard requirement.",
    },
    {
      parameter: "CYANURIC_ACID",
      cadence: "monthly (business decision, not a sourced CT requirement)",
      intervalMinutes: 43200,
      notes: "See ComplianceNote -- no official CT source specifies a CYA cadence; this matches Nevada's existing 30-day cycle as a placeholder.",
    },
  ],
  eventProtocols: [],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "No explicit numeric closure-risk threshold stated in the source document.",
      detail: "Unlike Nevada's SNHD rules, this guideline document doesn't define closure triggers for out-of-range chemistry readings.",
    },
    {
      kind: "ASSUMPTION",
      summary: "CYA 30-day testing cadence is a business decision matching Nevada's cadence, not a sourced CT requirement.",
      detail: "No official CT source specifying a CYA testing frequency was found in the guideline document.",
    },
    {
      kind: "GAP",
      summary: "Alkalinity testing frequency isn't explicitly stated beyond 'should be recorded in the log'.",
      detail: "No full code text was found to confirm a cadence; treat as periodic/non-daily until clarified further.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Alabama -- pool-vs-spa threshold AND frequency both differ (pattern 8: spa is hourly,
// pool is twice-daily), not just the numeric range. Has an unresolved conflict between
// an indoor-CYA-ban provision and a flat numeric CYA range with no indoor/outdoor split
// -- seeded as-flagged per the handoff's explicit instruction, not resolved here.
// ---------------------------------------------------------------------------
const ALABAMA: StateSeed = {
  state: "AL",
  ruleset: {
    stateName: "Alabama",
    healthDepartmentName: "Alabama Department of Public Health",
    isSupported: false,
    jurisdictionLevel: "COUNTY",
    countyName: "Baldwin County",
    officialCitation: "Alabama pool rules — General Provisions (Sections 5–6); Appendix A (Public Swimming Pool); Appendix B (Public Spa)",
    sourceDocument: "Baldwin County Health Dept, Environmental Health Section — General Provisions + Appendix A/B, and the 'Operational Report' log form",
    recordRetentionMonths: 12,
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Baldwin County Health Dept 'Operational Report' form (monthly, one row per day)",
    logSheetSourceNotes:
      "Fields: Date, Filter Rate (GPM), Free Chlorine, pH, Alkalinity, Water Temp, Filter Backwash, Pump Strainer Cleaned, Super Chlorination, Cyanuric Acid, Calcium Hardness, Initials, Notes. Pool type captured via checkboxes: Outdoor Pool, Indoor Pool, Wading Pool, Water Attraction Pool, Spa, Therapy Pool, Exercise Pool, Other.",
  },
  chemistryThresholds: [
    // Public Pool -- Appendix A
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, idealMin: 1.0, idealMax: 3.0, maxValue: 3.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", appliesWhen: "if used", minValue: 2.0, idealMin: 2.0, idealMax: 4.0, maxValue: 4.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "PH", bodyOfWaterCategory: "POOL", minValue: 7.2, idealMin: 7.4, idealMax: 7.6, maxValue: 7.8, unit: "", sourceConfidence: "confirmed" },
    { parameter: "TOTAL_ALKALINITY", bodyOfWaterCategory: "POOL", minValue: 60, idealMin: 80, idealMax: 120, maxValue: 180, unit: "ppm", sourceConfidence: "confirmed" },
    {
      parameter: "CYANURIC_ACID",
      bodyOfWaterCategory: "POOL",
      appliesWhen: "if used",
      minValue: 10,
      idealMin: 30,
      idealMax: 50,
      maxValue: 150,
      unit: "ppm",
      sourceConfidence: "conflict",
      notes: "See ComplianceNote -- conflicts with an earlier indoor-CYA-ban provision; this Appendix A range is seeded as the primary rule per the handoff's explicit instruction, not a resolution of the conflict.",
    },
    { parameter: "CALCIUM_HARDNESS", bodyOfWaterCategory: "POOL", minValue: 100, maxValue: 200, unit: "ppm", sourceConfidence: "confirmed", notes: "recommended, not a hard requirement" },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "POOL", idealMin: 78, idealMax: 82, unit: "°F", sourceConfidence: "confirmed" },
    { parameter: "TDS", bodyOfWaterCategory: "POOL", maxValue: 1550, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "TURBIDITY", bodyOfWaterCategory: "POOL", unit: "", sourceConfidence: "confirmed", notes: "Main drain / 6-inch black-and-white disk must be clearly visible -- not a numeric range." },
    { parameter: "BACTERIA", bodyOfWaterCategory: "POOL", unit: "", sourceConfidence: "confirmed", notes: "Not required routinely -- monitored at Health Dept's discretion." },
    // Public Spa -- Appendix B (notably stricter and more frequent than the pool table)
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 2.0, idealMin: 3.0, idealMax: 5.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", appliesWhen: "if used", minValue: 2.0, idealMin: 4.0, idealMax: 6.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "PH", bodyOfWaterCategory: "SPA", minValue: 7.2, idealMin: 7.4, idealMax: 7.6, maxValue: 7.8, unit: "", sourceConfidence: "confirmed" },
    { parameter: "TOTAL_ALKALINITY", bodyOfWaterCategory: "SPA", minValue: 60, idealMin: 80, idealMax: 120, maxValue: 180, unit: "ppm", sourceConfidence: "confirmed" },
    {
      parameter: "CYANURIC_ACID",
      bodyOfWaterCategory: "SPA",
      appliesWhen: "if used",
      minValue: 10,
      idealMin: 30,
      idealMax: 50,
      maxValue: 150,
      unit: "ppm",
      sourceConfidence: "conflict",
      notes: "Same indoor-CYA-ban conflict as the pool threshold above -- see ComplianceNote.",
    },
    { parameter: "CALCIUM_HARDNESS", bodyOfWaterCategory: "SPA", minValue: 100, idealMin: 150, idealMax: 250, maxValue: 800, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: "°F", sourceConfidence: "confirmed" },
    { parameter: "TDS", bodyOfWaterCategory: "SPA", maxValue: 1550, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "TURBIDITY", bodyOfWaterCategory: "SPA", unit: "", sourceConfidence: "confirmed", notes: "6-inch black-and-white disk visible at deepest point, or main drain cover visible." },
    { parameter: "BACTERIA", bodyOfWaterCategory: "SPA", unit: "", sourceConfidence: "confirmed", notes: "Not required routinely -- monitored at Health Dept's discretion." },
  ],
  frequencyRules: [
    { parameter: "FREE_CHLORINE", bodyOfWaterCategory: "POOL", cadence: "twice daily", intervalMinutes: 720 },
    { parameter: "PH", bodyOfWaterCategory: "POOL", cadence: "twice daily", intervalMinutes: 720 },
    { parameter: "TURBIDITY", bodyOfWaterCategory: "POOL", cadence: "hourly", intervalMinutes: 60 },
    { parameter: "FREE_CHLORINE", bodyOfWaterCategory: "SPA", cadence: "hourly", intervalMinutes: 60 },
    { parameter: "PH", bodyOfWaterCategory: "SPA", cadence: "hourly", intervalMinutes: 60 },
    { parameter: "TURBIDITY", bodyOfWaterCategory: "SPA", cadence: "hourly", intervalMinutes: 60 },
  ],
  eventProtocols: [],
  complianceNotes: [
    {
      kind: "CONFLICT",
      summary: "General Provisions text states CYA is prohibited indoors entirely, but Appendix A/B gives a flat 10–150 ppm range with no indoor/outdoor distinction at all.",
      detail:
        "Unclear whether the appendix range only applies outdoors (with indoor pools defaulting to CYA=0/not used), or whether the indoor ban is from an older/different provision than this appendix. The Appendix A/B numeric range is seeded as the primary rule per explicit instruction, but this conflict is not resolved -- recommend surfacing to Alabama/Baldwin County directly rather than guessing.",
    },
    {
      kind: "GAP",
      summary: "Source documents are from Baldwin County Health Dept specifically; unclear whether this form/these rules apply statewide in Alabama or are county-specific.",
      detail: "Seeded with jurisdictionLevel=COUNTY, countyName=Baldwin County pending confirmation, same pattern as Nevada/SNHD.",
    },
  ],
};

const ALL_STATES: StateSeed[] = [NEVADA, CONNECTICUT, ALABAMA];

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
