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

// ---------------------------------------------------------------------------
// Alaska -- genuinely state-level (contrast with Nevada/Alabama's county sources).
// First curve-based threshold (pH redefines the FAC minimum via a lookup table, not a
// branch) and first lab-result-triggered closure with an indeterminate reopening window.
// The curve's actual data points aren't available -- seeded as flagged (isCurveBased +
// a ComplianceNote), never approximated.
// ---------------------------------------------------------------------------
const ALASKA: StateSeed = {
  state: "AK",
  ruleset: {
    stateName: "Alaska",
    healthDepartmentName: "Alaska Department of Environmental Conservation (ADEC)",
    isSupported: false,
    jurisdictionLevel: "STATE",
    officialCitation: "18 AAC 30 (18 AAC 30.550)",
    sourceDocument: "Pool Testing Guidelines (ADEC guidance doc, rev. 6/12/2012) + 18 AAC 30.550 regulatory text",
    logSheetSource: "BUILT_FROM_CODE",
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.0, maxValue: 8.0, unit: "", sourceConfidence: "confirmed", notes: "measured to nearest 0.2; must be maintained in this range while bathers are in the water" },
    { parameter: "TOTAL_CHLORINE", disinfectionMethod: "CHLORINE", minValue: 2.0, maxValue: 10.0, unit: "mg/l", sourceConfidence: "confirmed", notes: "Total Available Chlorine (TAC), nearest 0.2mg" },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      unit: "mg/l",
      isCurveBased: true,
      curveDescription:
        "18 AAC 30.550 Table E: the minimum free chlorine dosage needed to hit a 0.3 mg/l hypochlorous-acid yield changes with measured pH (lower pH needs less chlorine for the same kill power, higher pH needs more). Read pH -> find corresponding minimum FAC from the curve -> compare against tested FAC.",
      relationalRule: "Free Available Chlorine must be greater than half of Total Available Chlorine (equivalently: chloramines may not exceed one-half of the total chlorine level).",
      sourceConfidence: "gap",
      notes: "Curve data points not available -- see ComplianceNote. Target yield >= 0.3 mg/l hypochlorous acid, measured to nearest 0.2 mg/l.",
    },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", minValue: 2.0, maxValue: 4.0, unit: "mg/l", sourceConfidence: "confirmed", notes: "Free Available Bromine, nearest 0.2 mg/l" },
    { parameter: "TOTAL_ALKALINITY", minValue: 50, maxValue: 200, unit: "mg/l", sourceConfidence: "confirmed", notes: "resolved -- previously an open gap" },
    { parameter: "TOTAL_HARDNESS", minValue: 100, maxValue: 1000, unit: "mg/l", sourceConfidence: "confirmed" },
    {
      parameter: "CALCIUM_HARDNESS",
      unit: "",
      relationalRule: "Must be at least 70% of Total Hardness -- a proportional/derived requirement, not a flat range.",
      sourceConfidence: "confirmed",
    },
    { parameter: "SATURATION_INDEX", minValue: -0.5, maxValue: 0.5, unit: "", sourceConfidence: "confirmed", notes: "Langelier Saturation Index -- resolved, previously an open gap" },
    { parameter: "CYANURIC_ACID", maxValue: 0, unit: "mg/l", sourceConfidence: "confirmed", notes: "Cyanuric acid and chlorinated isocyanurates are prohibited entirely in Alaska (not just indoors, unlike Alabama)." },
  ],
  frequencyRules: [
    { parameter: "PH", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "TOTAL_CHLORINE", cadence: "daily", intervalMinutes: 1440 },
    {
      parameter: "FREE_CHLORINE",
      cadence: "daily, 2x per day",
      intervalMinutes: 720,
      notes: "Source table lists both 'daily' and '2x per day' for FAC -- interpreted as up to twice daily (the tighter reading); flagged as an ambiguity, not resolved to a single confirmed number.",
    },
    { parameter: "BROMINE", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "TOTAL_ALKALINITY", cadence: "weekly", intervalMinutes: 10080, notes: "Conditional per source: required depending on whether chemicals are routinely added to maintain water quality." },
    { parameter: "TOTAL_HARDNESS", cadence: "weekly", intervalMinutes: 10080, notes: "Same conditional as alkalinity above." },
    { parameter: "CALCIUM_HARDNESS", cadence: "weekly", intervalMinutes: 10080, notes: "Same conditional as alkalinity above." },
    { parameter: "SATURATION_INDEX", cadence: "weekly", intervalMinutes: 10080, notes: "Same conditional as alkalinity above." },
    {
      parameter: "BACTERIAL_SAMPLE",
      cadence: "monthly",
      intervalMinutes: 43200,
      notes: "Submitted to a department-certified lab per Standard Methods, 16th Edition. Max 200 bacteria/mL (standard agar plate count) or zero confirmed coliform per sample.",
    },
  ],
  eventProtocols: [
    {
      triggerType: "PATHOGEN_LAB_RESULT",
      triggerLabel: "Positive pathogen test (pseudomonas, etc.)",
      closureKind: "INDETERMINATE_LAB_RETEST",
      reopeningCondition: "A retest must confirm the water is free of the pathogen. No fixed reopening window like Arizona's 24-hour liquid-feces rule, since lab turnaround time isn't specified.",
      sourceConfidence: "confirmed",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "The actual Table E graph/curve values (pH-to-minimum-FAC lookup) aren't in hand as extractable numbers -- only the rule description.",
      detail: "If the actual table/graph image or its tabulated values become available, this could be built as real logic rather than a placeholder.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Arizona (Maricopa County) -- the clearest event-protocol example collected: an
// explicit fecal-contamination closure trigger with a real decision branch (solid vs.
// liquid feces) and, for liquid, a mandatory minimum duration plus a specific
// remediation sequence -- not just "retest before reopening."
// ---------------------------------------------------------------------------
const ARIZONA: StateSeed = {
  state: "AZ",
  ruleset: {
    stateName: "Arizona",
    healthDepartmentName: "Maricopa County Environmental Health",
    isSupported: false,
    jurisdictionLevel: "COUNTY",
    countyName: "Maricopa County",
    officialCitation: "Maricopa County Environmental Health Code, Chapter VI, Section 2 (Water Quality Standards), R 2-18-04",
    recordRetentionMonths: 12,
    logSheetSource: "BUILT_FROM_CODE",
  },
  chemistryThresholds: [
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, maxValue: 5.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 3.0, maxValue: 5.0, unit: "ppm", sourceConfidence: "confirmed", notes: "hydrotherapy pool/spa" },
    { parameter: "PH", minValue: 7.2, maxValue: 7.8, unit: "", sourceConfidence: "confirmed" },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.0, maxValue: 4.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 3.0, maxValue: 5.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "TOTAL_ALKALINITY", minValue: 60, maxValue: 180, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "CYANURIC_ACID", appliesWhen: "if used for stabilization (chlorinated isocyanurates)", maxValue: 100, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "TEMPERATURE", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "heated water only" },
    { parameter: "TURBIDITY", unit: "", sourceConfidence: "confirmed", notes: "Water must be clear enough that the main drain outlet is visible from the deck, or a 200mm Secchi disk is visible at the deepest point." },
  ],
  frequencyRules: [
    { parameter: "ALL", cadence: "at least once daily", intervalMinutes: 1440, notes: "pH, disinfectant residual, total alkalinity, and temperature all tested at least once daily." },
    {
      parameter: "BACTERIAL_SAMPLE",
      cadence: "routine, at Department's discretion",
      isPerformanceBased: true,
      notes: "No more than 15% of water samples may exceed 200 bacteria/mL (agar plate count) or show confirmed coliform presence. Frequency not explicitly stated, unlike Alaska's explicit monthly requirement.",
    },
  ],
  eventProtocols: [
    {
      triggerType: "FECAL_SOLID",
      triggerLabel: "Solid feces found",
      closureKind: "UNTIL_RETEST_PASSES",
      reopeningCondition: "Pool may reopen only once a retest confirms compliance with the water-quality standard (Reg 4).",
      remediationSteps: "All bathers exit immediately -> feces removed/disposed -> water retested for compliance.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "FECAL_LIQUID",
      triggerLabel: "Liquid feces found",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 1440,
      reopeningCondition: "Pool must stay closed a minimum of 24 hours, then may reopen only once a retest taken 24 hours after shock treatment confirms compliance.",
      remediationSteps: "All bathers exit immediately -> liquid feces removed as much as possible -> shock treatment applied -> retest 24 hours after shock treatment.",
      sourceConfidence: "confirmed",
    },
  ],
  complianceNotes: [],
};

// ---------------------------------------------------------------------------
// Arkansas -- the most complete state collected: a full resolved chemistry table,
// explicit numeric immediate-closure triggers (captured as hazardMin/Max directly on the
// ChemistryThreshold rows, since Arkansas's routine range IS the closure trigger --
// single-tier, unlike Nevada's separate tighter hazard band), and the most detailed
// fecal-contamination protocol collected (exact ppm, exact hold duration, exact pH
// precondition) -- used as the template shape for EventProtocol going forward.
// ---------------------------------------------------------------------------
const ARKANSAS: StateSeed = {
  state: "AR",
  ruleset: {
    stateName: "Arkansas",
    healthDepartmentName: "Arkansas Department of Health (ADH)",
    isSupported: false,
    jurisdictionLevel: "STATE",
    officialCitation:
      "Arkansas Act 623 of 1987 (as amended); ADH Rules & Regulations effective August 1, 2012; numeric parameters per AR Appendix B; also references Model Aquatic Health Code (MAHC) 5th Edition",
    sourceDocument: "Guidelines for Arkansas Pools, Spas, and Other Aquatic Facility Operators — Updated Edition, 2026",
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Swimming Pool Daily Operation Record (EHP-3)",
    logSheetSourceNotes:
      "Fields: Date, Free Chlorine, pH, Alkalinity, Hardness, Chemicals Added (Cl Added, Soda Ash, Acid, Other), Water Temp, Make-up Water, Backwash, Bather Load, Accident, Remarks, Signature. Two additional required forms: Record of Pool Contamination Incident, and Report of Accident or Drowning.",
  },
  chemistryThresholds: [
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, idealMin: 1.0, idealMax: 3.0, maxValue: 5.0, hazardMin: 1.0, hazardMax: 5.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Also the explicit immediate-closure trigger per 'When to Close a Pool' -- single-tier, the routine range IS the closure trigger." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 2.0, idealMin: 3.0, idealMax: 5.0, maxValue: 5.0, hazardMin: 2.0, hazardMax: 5.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", appliesWhen: "if stabilizer used", minValue: 1.5, maxValue: 5.0, unit: "ppm", sourceConfidence: "confirmed" },
    {
      parameter: "COMBINED_CHLORINE",
      maxValue: 0.2,
      unit: "ppm",
      relationalRule: "Combined Chlorine = Total Chlorine − Free Chlorine. If the result is >= 0.2 ppm, breakpoint chlorination is required.",
      sourceConfidence: "confirmed",
    },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.25, idealMin: 2.25, idealMax: 4.0, maxValue: 4.0, hazardMin: 2.25, hazardMax: 4.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 2.25, idealMin: 3.0, idealMax: 5.0, maxValue: 5.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "PH", minValue: 7.0, idealMin: 7.4, idealMax: 7.6, maxValue: 7.8, hazardMin: 7.0, hazardMax: 7.8, unit: "", sourceConfidence: "confirmed", notes: "Also the explicit immediate-closure trigger per 'When to Close a Pool'." },
    {
      parameter: "TOTAL_ALKALINITY",
      appliesWhen: "unstabilized sanitizer (no CYA present)",
      minValue: 60,
      idealMin: 80,
      idealMax: 100,
      maxValue: 180,
      unit: "ppm",
      sourceConfidence: "confirmed",
      relationalRule: "Target range depends on both sanitizer type AND whether CYA is present -- not a single fixed range (see the stabilized/CYA-present variant of this threshold).",
    },
    {
      parameter: "TOTAL_ALKALINITY",
      appliesWhen: "stabilized sanitizer / CYA present",
      minValue: 60,
      idealMin: 100,
      idealMax: 120,
      maxValue: 180,
      unit: "ppm",
      sourceConfidence: "confirmed",
    },
    {
      parameter: "CYANURIC_ACID",
      idealMin: 25,
      idealMax: 40,
      maxValue: 90,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "CYA above 50 ppm is called out as 'high' -- known to interfere with alkalinity readings, chlorine kill time, and ORP sensor accuracy. A soft-warning threshold distinct from the hard 90 ppm max; not modeled as a separate hazard tier here.",
    },
    { parameter: "TDS", minValue: 300, idealMin: 1000, idealMax: 2000, maxValue: 3000, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "CALCIUM_HARDNESS", minValue: 150, idealMin: 200, idealMax: 400, maxValue: 1000, unit: "ppm", sourceConfidence: "confirmed", notes: "Source table shows the max as a range, '500-1,000' -- seeded as 1000 (the upper bound); flagged in case the lower end (500) turns out to be the intended ceiling." },
    { parameter: "HEAVY_METALS", unit: "", sourceConfidence: "confirmed", notes: "No routine threshold -- suspect-only testing, not part of the regular cadence." },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: "°F", sourceConfidence: "confirmed" },
    { parameter: "ORP", minValue: 650, unit: "mV", sourceConfidence: "confirmed", notes: "Supplemental measurement only -- does not replace the DPD test." },
  ],
  frequencyRules: [
    { parameter: "FREE_CHLORINE", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "BROMINE", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "PH", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "TOTAL_ALKALINITY", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "ORP", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "COMBINED_CHLORINE", cadence: "weekly", intervalMinutes: 10080 },
    { parameter: "CYANURIC_ACID", cadence: "weekly", intervalMinutes: 10080 },
    { parameter: "TDS", cadence: "monthly", intervalMinutes: 43200 },
    { parameter: "CALCIUM_HARDNESS", cadence: "monthly", intervalMinutes: 43200 },
  ],
  eventProtocols: [
    {
      triggerType: "CLARITY_FAILURE",
      triggerLabel: "Main drain not visible from deck",
      closureKind: "UNTIL_RETEST_PASSES",
      reopeningCondition: "Restore clarity so the main drain is visible from the deck.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "SAFETY_HAZARD",
      triggerLabel: "Non-chemistry immediate closure trigger",
      closureKind: "UNTIL_RETEST_PASSES",
      reopeningCondition:
        "Hazard resolved. For lightning/tornado warnings specifically: wait 30 minutes after the last thunder/lightning before reopening (the '30/30 rule').",
      remediationSteps:
        "Covers: missing/broken main drain cover, electrical hazard, power outage, drowning, lack of required lifeguard supervision, no emergency phone access, structural hazard, missing safety equipment, no barrier/gate, lightning within 10 miles or tornado warning, flooding, salt cell malfunction with no backup tablet feeder, flow meter out of range, unblocked vacuum port, no lifeline where required (>5.5 ft depth).",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Formed stool",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 30,
      reopeningCondition: "Free chlorine raised to and confirmed at >= 2.0 ppm, pH <= 7.5, maintained for 30 minutes with filtration running.",
      remediationSteps: "Clear pool -> remove stool with net/scoop (never a pool vacuum) -> raise free chlorine to >= 2.0 ppm -> pH <= 7.5 -> maintain 30 minutes with filtration running -> confirm FC before reopening.",
      notes: "Assumes CYA < 50 ppm; higher CYA roughly doubles the required treatment time (reduces chlorine's effective killing power).",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal stool",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 765,
      reopeningCondition: "Free chlorine raised to 20 ppm, pH <= 7.5 (critical), maintained for 12.75 hours with filtration running continuously; FC confirmed back to normal range before reopening.",
      remediationSteps: "Clear pool -> remove matter -> raise free chlorine to 20 ppm -> pH <= 7.5 -> maintain 12.75 hours, filtration running continuously -> backwash filter after treatment -> confirm FC returned to normal range.",
      notes: "Assumes CYA < 50 ppm; higher CYA roughly doubles the required treatment time.",
      sourceConfidence: "confirmed",
    },
  ],
  complianceNotes: [],
};

// ---------------------------------------------------------------------------
// California -- first facility-attribute-based frequency exception (small-HOA pools get
// reduced testing), first equipment-performance-triggered closure (UV dosage), and first
// performance-based/adaptive frequency (combined chlorine's cadence is "whatever
// maintains compliance," not a stated number). Also the first ambiguous jurisdiction
// level: CCR Title 22 is genuinely state-level, but the log sheet itself is
// Sacramento-County-branded -- seeded as its own value rather than silently picked as
// either STATE or COUNTY.
// ---------------------------------------------------------------------------
const CALIFORNIA: StateSeed = {
  state: "CA",
  ruleset: {
    stateName: "California",
    healthDepartmentName: "California Department of Public Health",
    isSupported: false,
    jurisdictionLevel: "COUNTY_DISTRIBUTED_STATE_DERIVED",
    countyName: "Sacramento County",
    officialCitation:
      "California Code of Regulations (CCR), Title 22, Division 4, Chapter 20 — §65523 (Operation Records), §65529 (Public Pool Disinfection), §65530 (Public Pool Water Characteristics); also California Health and Safety Code §116048 (small common-interest-development exception)",
    recordRetentionMonths: 24,
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Pool/Spa Daily Maintenance Log",
    logSheetSourceNotes: "Branded Sacramento County Environmental Health, but its numbers directly mirror the state code -- functionally a state-standard form even though county-distributed.",
  },
  chemistryThresholds: [
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "no CYA present", minValue: 1.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "with CYA present", minValue: 2.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed" },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "SPA",
      minValue: 3.0,
      maxValue: 10.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "Same range regardless of CYA use. Also applies to wading pools and spray grounds (not duplicated as separate rows).",
    },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.0, unit: "ppm", sourceConfidence: "confirmed", notes: "No stated maximum." },
    {
      parameter: "BROMINE",
      disinfectionMethod: "BROMINE",
      bodyOfWaterCategory: "SPA",
      minValue: 4.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "No stated maximum. Also applies to wading pools and spray grounds (not duplicated as separate rows).",
    },
    { parameter: "PH", minValue: 7.2, maxValue: 7.8, idealMin: 7.4, idealMax: 7.6, unit: "", sourceConfidence: "confirmed", notes: "7.2-7.8 is the legal range; the log sheet separately notes 7.4-7.6 as a non-binding 'ideal'." },
    { parameter: "CYANURIC_ACID", minValue: 0, maxValue: 100, idealMin: 20, idealMax: 50, unit: "ppm", sourceConfidence: "confirmed", notes: "0-100 is the legal range; the log sheet separately notes 20-50 ppm as a non-binding 'ideal'." },
    { parameter: "COMBINED_CHLORINE", maxValue: 0.4, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "TEMPERATURE", maxValue: 104, unit: "°F", sourceConfidence: "confirmed" },
  ],
  frequencyRules: [
    { parameter: "ALL", cadence: "minimum once per day", intervalMinutes: 1440, notes: "Disinfectant residual + pH." },
    { parameter: "TEMPERATURE", cadence: "minimum once per day", intervalMinutes: 1440, notes: "Heated pools only." },
    { parameter: "CYANURIC_ACID", cadence: "minimum once per month", intervalMinutes: 43200 },
    {
      parameter: "COMBINED_CHLORINE",
      cadence: "at a frequency required to maintain the 0.4 ppm max",
      isPerformanceBased: true,
      notes: "Performance-based per §65523: the required test interval itself is conditional on staying in compliance, not a stated cadence -- contrast with Arkansas's flat 'weekly'.",
    },
    {
      parameter: "ALL",
      facilityAttribute: "common_interest_development_under_25_units",
      cadence: "twice per week, no more than 4 days apart",
      intervalMinutes: 5760,
      notes: "Per Health & Safety Code §116048: pools in common-interest developments with fewer than 25 separate units get reduced frequency instead of daily. intervalMinutes reflects the maximum allowed gap (4 days).",
    },
  ],
  eventProtocols: [
    {
      triggerType: "UV_DOSAGE_BELOW_MINIMUM",
      triggerLabel: "UV dosage drops below 40 mJ/cm² (spray grounds/water features)",
      closureKind: "EQUIPMENT_PERFORMANCE",
      reopeningCondition: "Restore continuous UV dosage to at least 40 mJ/cm² before reopening the spray ground/water feature to bathers.",
      sourceConfidence: "confirmed",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "Incident recording (fecal, vomit, blood, near-drowning, drowning) is required per §65546, but that section's actual text wasn't in the source excerpt.",
      detail: "California requires this recordkeeping, but the specific decontamination protocol/numbers aren't available the way they are for Arkansas or Arizona.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Jurisdiction level seeded as COUNTY_DISTRIBUTED_STATE_DERIVED rather than picking STATE or COUNTY outright.",
      detail: "The regulation itself (CCR Title 22) is genuinely state-level, but the log sheet form is Sacramento-County-branded even though its numbers mirror the state code.",
    },
  ],
};

const ALL_STATES: StateSeed[] = [NEVADA, CONNECTICUT, ALABAMA, ALASKA, ARIZONA, ARKANSAS, CALIFORNIA];

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
