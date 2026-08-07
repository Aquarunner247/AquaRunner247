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
// Connecticut -- real code text (§19-13-B33b) is now confirmed, not just the earlier DPH
// guideline summary. The closure-risk gap is resolved: the code frames closure as a
// two-tier discretionary/mandatory health-director authority rather than a flat
// threshold, unlike every other state's closure logic collected so far. Alkalinity and
// CYA cadence are real local-health-district conventions (Newtown, Franklin, Meriden,
// etc.), not business-decision placeholders, though still not *state*-code numbers --
// isSupported stays false since the state code itself still leaves alkalinity range and
// CYA cadence genuinely unstated at the state level (see COMPLIANCE_RULESET_NOTES.md).
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
      "CT Public Health Code § 19-13-B33b (actual code text, portal.ct.gov) and the Connecticut Public Swimming Pool Manual/Design Guide (April 2021), which reprints it",
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
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 1.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "PH", idealMin: 7.2, idealMax: 7.8, unit: "", sourceConfidence: "confirmed", notes: "Code also states 'caustic alkalinity shall not be present'. No separate numeric closure-risk hazard tier -- see the two-tier discretionary/mandatory EventProtocol rows instead." },
    {
      parameter: "TOTAL_ALKALINITY",
      idealMin: 80,
      idealMax: 150,
      unit: "ppm",
      sourceConfidence: "assumption",
      notes:
        "The state code itself specifies no alkalinity range at all. 80-150 ppm is the range commonly adopted by local health districts that enforce the state code (Newtown, Franklin, Meriden, and others) -- a real, sourced local-district convention, not a state requirement. Replaces an earlier 80-120 ppm placeholder that wasn't sourced from anywhere.",
    },
    { parameter: "CYANURIC_ACID", maxValue: 100, unit: "ppm", sourceConfidence: "confirmed" },
  ],
  frequencyRules: [
    {
      parameter: "ALL",
      cadence: "immediately prior to daily opening, then at sufficient frequency during bather use to keep levels adequate",
      intervalMinutes: 1440,
      notes: "Bundled disinfectant residual + pH per §19-13-B33b(b)(6)-(7). Not a fixed count like '3x/day' -- an adequacy-based standard with immediate corrective action required if levels are found inadequate. 1440 min reflects the required daily floor (pre-opening check).",
    },
    {
      parameter: "TOTAL_ALKALINITY",
      cadence: "weekly, and within 3 hours of adding make-up water (local-district convention)",
      intervalMinutes: 10080,
      appliesWhen: "per commonly-adopted local health district requirements (Newtown, Franklin, Meriden, etc.)",
      notes: "State code doesn't prescribe a cadence at all -- see ComplianceNote. This is the real, sourced local-district convention, not a business-decision placeholder.",
    },
    {
      parameter: "CYANURIC_ACID",
      cadence: "weekly, and within 3 hours of adding make-up water (local-district convention)",
      intervalMinutes: 10080,
      appliesWhen: "per commonly-adopted local health district requirements",
      notes: "Replaces the earlier 'business decision matching Nevada's cadence' placeholder. Still not a *state*-code number, but now a real, sourced local-district convention (same districts as the alkalinity cadence above) rather than an arbitrary assumption.",
    },
  ],
  eventProtocols: [
    {
      triggerType: "CHEMISTRY_HAZARD_THRESHOLD",
      triggerLabel: "Discretionary closure authority",
      closureKind: "AUTHORITY_DISCRETIONARY",
      reopeningCondition: "The Director of Health MAY order a pool closed for any failure to meet the regulations, or any condition constituting a public health/safety hazard or nuisance -- discretionary, not automatic.",
      sourceConfidence: "confirmed",
      notes: "§19-13-B33b(g). Every other state's closure logic collected reads as a flat threshold trigger; Connecticut's actual code frames this as a health director's authority instead, with a broader discretionary tier and the narrower mandatory tier below.",
    },
    {
      triggerType: "CHEMISTRY_HAZARD_THRESHOLD",
      triggerLabel: "Mandatory closure authority",
      closureKind: "AUTHORITY_MANDATORY",
      reopeningCondition:
        "The Director of Health SHALL order a pool closed specifically for significant evidence of communicable disease transmission through the pool, operation constituting a significant health nuisance, or imminent safety hazards. The numeric minima above (0.8 ppm FC, pH 7.2-7.8, clarity) function as the practical triggers for this mandatory tier -- falling below them is functionally 'significant health nuisance' territory, even though the code states it as an authority/duty structure rather than a flat threshold rule.",
      sourceConfidence: "confirmed",
      notes: "§19-13-B33b(g). Resolves the earlier-flagged 'no closure trigger stated' gap -- the trigger exists, it's just authority-shaped rather than a flat number.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "The state code specifies no alkalinity range and no CYA testing cadence at all -- both are filled by commonly-adopted local health district conventions, not state requirements.",
      detail: "Newtown, Franklin, Meriden, and other districts that adopt/enforce the state code commonly add 80-150 ppm alkalinity and weekly (within 3 hours of make-up water) CYA/alkalinity testing. Which district applies determines the actual enforced number for a given AquaRunner customer -- a two-layer regulatory structure (state floor + local addition), distinct from Nevada/Alabama/Arizona's simpler 'the county document just is the rule' pattern.",
    },
    {
      kind: "GAP",
      summary: "Alkalinity testing frequency beyond the local-district weekly convention above isn't stated anywhere in the state code itself -- confirmed as a genuine gap in the code, not a missing excerpt.",
      detail: "§19-13-B33b(b)(6)-(7) covers disinfectant residual and pH cadence explicitly but is silent on alkalinity frequency at the state level.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Alabama -- pool-vs-spa threshold AND frequency both differ (pattern 8: spa is hourly,
// pool is twice-daily), not just the numeric range. The indoor-CYA-ban conflict flagged
// in the original pass is resolved: checking the core General Provisions and Appendix A/B
// text across Mobile, Jefferson, and Baldwin counties, none contain a written indoor CYA
// ban -- the flat 10-150 ppm Appendix A/B range (no indoor/outdoor split) is the actual
// enforceable rule. The earlier "banned indoors" claim likely came from informal inspector
// guidance (no UV protection needed indoors, reduced chlorine efficacy) rather than
// written code -- kept below as a soft advisory note, not a compliance threshold.
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
      sourceConfidence: "confirmed",
      notes: "No indoor/outdoor split -- see ComplianceNote for the resolved indoor-ban question (informal inspector guidance discourages indoor use in practice, but it's not a written county-code prohibition).",
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
      sourceConfidence: "confirmed",
      notes: "No indoor/outdoor split -- see ComplianceNote for the resolved indoor-ban question.",
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
      kind: "ASSUMPTION",
      summary: "The earlier-flagged 'CYA banned indoors' conflict is resolved: no such ban exists in the actual county rules. The flat 10-150 ppm Appendix A/B range applies with no indoor/outdoor branch.",
      detail:
        "Checked against Mobile, Jefferson, and Baldwin County General Provisions/Appendix A-B text -- none contain a written indoor CYA prohibition. The earlier claim likely traced to informal inspector/training guidance that discourages indoor CYA use on practical grounds (no UV protection needed indoors, reduced chlorine efficacy, higher combined-chlorine risk) rather than enforceable code. If AquaRunner wants to surface that guidance as an in-app tip, it should be a soft advisory layer, not a compliance threshold -- it must not block or fail a reading the way the numeric appendix range does.",
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
    isSupported: true,
    jurisdictionLevel: "COUNTY",
    countyName: "Maricopa County",
    officialCitation: "Maricopa County Environmental Health Code, Chapter VI, Section 2 (Water Quality Standards), R 2-18-04",
    recordRetentionMonths: 12,
    logSheetSource: "BUILT_FROM_CODE",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under Maricopa County
Environmental Health Code, Chapter VI, Section 2 (R 2-18-04).

### Chemistry targets
- **Free chlorine:** 1.0 – 5.0 ppm (pools), 3.0 – 5.0 ppm (hydrotherapy pools/spas)
- **pH:** 7.2 – 7.8
- **Total alkalinity:** 60 – 180 ppm
- **Cyanuric acid:** max 100 ppm, only if used for stabilization

### Testing frequency
pH, disinfectant residual, total alkalinity, and temperature all tested at least once daily.

### Closure protocol
Maricopa County's code defines an explicit fecal-contamination closure sequence, distinct
from a chemistry-threshold breach:
- **Solid feces:** pool closes immediately, feces removed, water retested for compliance
  before reopening.
- **Liquid feces:** pool closes a **minimum of 24 hours**, liquid feces removed, shock
  treatment applied, retested 24 hours after treatment before reopening.

*This page reflects AquaRunner's built-in rule engine, not a substitute for Maricopa
County's own published code. Verify against the authoritative source for anything
compliance-critical.*`,
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
    isSupported: true,
    jurisdictionLevel: "STATE",
    officialCitation:
      "Arkansas Act 623 of 1987 (as amended); ADH Rules & Regulations effective August 1, 2012; numeric parameters per AR Appendix B; also references Model Aquatic Health Code (MAHC) 5th Edition",
    sourceDocument: "Guidelines for Arkansas Pools, Spas, and Other Aquatic Facility Operators — Updated Edition, 2026",
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Swimming Pool Daily Operation Record (EHP-3)",
    logSheetSourceNotes:
      "Fields: Date, Free Chlorine, pH, Alkalinity, Hardness, Chemicals Added (Cl Added, Soda Ash, Acid, Other), Water Temp, Make-up Water, Backwash, Bather Load, Accident, Remarks, Signature. Two additional required forms: Record of Pool Contamination Incident, and Report of Accident or Drowning.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under the Arkansas
Department of Health's Rules & Regulations Pertaining to Swimming Pools and Other Related
Facilities.

### Chemistry targets (routine range)
- **Free chlorine:** 1.0 – 5.0 ppm (pools), 2.0 – 5.0 ppm (spas)
- **pH:** 7.0 – 7.8
- **Total alkalinity:** 60 – 180 ppm (target sub-range shown assumes no CYA/stabilizer in
  use — the range shifts higher if your sanitizer uses cyanuric acid)
- **Cyanuric acid:** 25 – 40 ppm ideal, max 90 ppm — tested weekly

### Closure-risk thresholds
Arkansas's routine range doubles as its immediate-closure trigger for chlorine and pH —
there's no separate, looser hazard band the way Nevada has:
- **Free chlorine:** below 1.0 ppm (pools) / 2.0 ppm (spas), or above 5.0 ppm
- **pH:** below 7.0 or above 7.8

Arkansas's own regulation does not define a closure-risk hazard tier for cyanuric acid
specifically — only the 90 ppm routine maximum applies.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Arkansas
Department of Health's own published code. Verify against the authoritative source for
anything compliance-critical.*`,
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
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Formed fecal stool or vomit",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 25,
      cascadesToSharedFiltration: true,
      reopeningCondition: "Free chlorine >= 2 ppm maintained for at least 25 minutes, pH <= 7.5, water temperature >= 77°F (25°C); reopen once disinfection is complete and free chlorine/pH are back within §65529/§65530's normal operating ranges.",
      remediationSteps:
        "Per §65546(a): immediately close the affected pool AND all interconnected pools sharing the same filtration system -> remove contaminating material, dispose to sanitary sewer/approved wastewater process, clean and disinfect removal tools -> ensure pH <= 7.5 -> maintain water temp >= 77°F -> keep filtration running throughout -> test free chlorine at multiple points throughout the pool, not just one location -> after disinfection, replace affected cartridge filters or backwash non-cartridge filters (discharge to sanitary sewer/approved disposal, never back into the pool).",
      notes:
        "§65546(b) also requires three separate documented chemistry snapshots per incident (discovery, immediately after disinfection completes, and again at reopening) plus incident type, procedures followed, user count, and elapsed time -- a recordkeeping shape richer than a single incident record, not modeled as separate rows this pass. Retention 2 years, matching California's routine-log retention.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal stool, no CYA present",
      appliesWhen: "no cyanuric acid present",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 765,
      ctValue: 15300,
      ctValueUnit: "ppm·min",
      cascadesToSharedFiltration: true,
      reopeningCondition: "Free chlorine raised to 20 ppm, pH <= 7.5, maintained >= 12.75 hours (CT ~15,300); reopen once disinfection is complete and free chlorine/pH are back within normal operating ranges.",
      remediationSteps: "Same closure/removal/filtration steps as the formed-stool row above, held for the longer diarrheal duration.",
      sourceConfidence: "confirmed",
      notes: "Matches the same CDC/MAHC CT=15,300 standard already confirmed across Arkansas, New York, and Florida.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal stool, cyanuric acid present",
      appliesWhen: "cyanuric acid present",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 1800,
      ctValue: 72000,
      ctValueUnit: "ppm·min",
      cascadesToSharedFiltration: true,
      reopeningCondition: "pH lowered to 6.5, free chlorine raised to 40 ppm, maintained >= 30 hours (CT ~72,000); reopen once disinfection is complete and free chlorine/pH are back within normal operating ranges.",
      remediationSteps: "Same closure/removal/filtration steps as the no-CYA diarrheal row, at the stricter CYA-specific target.",
      sourceConfidence: "confirmed",
      notes:
        "California is the only state collected that defines an entirely separate target for CYA-present diarrheal incidents (different pH, higher chlorine ceiling, longer hold) rather than a time multiplier -- contrast New York (exactly doubles the standard treatment time) and Florida (offers removing the CYA itself as the first option). Don't assume any one state's CYA-during-incident mechanism generalizes to another.",
    },
    {
      triggerType: "BLOOD",
      triggerLabel: "Blood contamination",
      closureKind: "UNTIL_RETEST_PASSES",
      reopeningCondition:
        "Check free chlorine at the time of the incident; if below the required minimum, close until the minimum is restored. If already at or above the minimum, no closure is required.",
      sourceConfidence: "confirmed",
      notes: "Matches Florida's and Maryland's 'check the current level, don't assume elevated risk' approach -- notably less lenient than New York's blanket blood-closure exemption, since California still requires closure if chlorine is already out of range.",
    },
  ],
  complianceNotes: [
    {
      kind: "ASSUMPTION",
      summary: "Jurisdiction level seeded as COUNTY_DISTRIBUTED_STATE_DERIVED rather than picking STATE or COUNTY outright.",
      detail: "The regulation itself (CCR Title 22) is genuinely state-level, but the log sheet form is Sacramento-County-branded even though its numbers mirror the state code.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Near-drowning/drowning triggers the same documentation and full response protocol as a contamination incident; many local health departments default to the stricter diarrheal-tier disinfection target when fecal/vomit/blood contamination can't be ruled out.",
      detail: "A local-district judgment call layered on the state's baseline rule (same state-floor/local-addition shape as Connecticut's pattern, though here it's a stricter default rather than a numeric addition) -- not modeled as a separate EventProtocol row since it reuses the existing FECAL_DIARRHEAL rows rather than defining new numbers.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Colorado -- the most structurally complex state collected: four parallel disinfection
// methods (chlorine/bromine/hydrogen peroxide/copper+silver ion) each with a full
// threshold set (disinfectionMethod axis), a cross-method dependency (ion generators
// only valid alongside a 0.4ppm chlorine residual), a per-parameter frequency matrix by
// body-of-water type (not just one cadence per type), and the first repeated-failure
// closure trigger (two consecutive bacterial samples, not one).
// ---------------------------------------------------------------------------
const COLORADO: StateSeed = {
  state: "CO",
  ruleset: {
    stateName: "Colorado",
    healthDepartmentName: "Colorado Department of Public Health and Environment (CDPHE), Water Quality Control Division",
    isSupported: false,
    jurisdictionLevel: "STATE",
    officialCitation: "5 CCR 1003-5 (Swimming Pools and Mineral Baths), Section 4.7 Table 1 (chemistry), Section 4.9 (record-keeping frequency)",
    logSheetSource: "BUILT_FROM_CODE",
  },
  chemistryThresholds: [
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      appliesWhen: "with an approved supplemental oxidizer",
      minValue: 0.25,
      maxValue: 5.0,
      idealMin: 1.0,
      idealMax: 3.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "Table 1's 0.25 ppm minimum is footnoted to apply only with an approved supplemental oxidizer. See the sibling row below for the non-oxidizer case, which the regulation itself doesn't give a separate number for.",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      appliesWhen: "without a supplemental oxidizer",
      minValue: 1.0,
      maxValue: 5.0,
      idealMin: 1.0,
      idealMax: 3.0,
      unit: "ppm",
      sourceConfidence: "assumption",
      notes:
        "Table 1 doesn't state a separate non-oxidizer minimum at all -- only the oxidizer-required 0.25 ppm figure appears. Seeded here as the ideal-range lower bound (1.0 ppm), which is the genuinely-enforced practical floor per local Colorado health departments (Arapahoe, Mesa, and others), not a directly-stated regulatory minimum. Same state-floor/local-enforcement layering pattern as Connecticut's alkalinity range.",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "SPA",
      appliesWhen: "with an approved supplemental oxidizer",
      minValue: 0.25,
      maxValue: 5.0,
      idealMin: 3.0,
      idealMax: 5.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "Same oxidizer-only footnote as the pool row above.",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "SPA",
      appliesWhen: "without a supplemental oxidizer",
      minValue: 3.0,
      maxValue: 5.0,
      idealMin: 3.0,
      idealMax: 5.0,
      unit: "ppm",
      sourceConfidence: "assumption",
      notes: "Same practically-enforced-not-directly-stated shape as the pool row above, using the spa ideal-range lower bound (3.0 ppm).",
    },
    { parameter: "COMBINED_CHLORINE", minValue: 0.0, maxValue: 1.0, idealMin: 0, idealMax: 0, unit: "ppm", sourceConfidence: "confirmed", notes: "Ideal is none at all." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 1.5, maxValue: 5.0, idealMin: 2.0, idealMax: 3.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 2.0, maxValue: 10.0, idealMin: 3.0, idealMax: 5.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "TOTAL_ALKALINITY", minValue: 70, maxValue: 180, unit: "ppm", sourceConfidence: "confirmed", notes: "Ideal range varies by pool finish/disinfectant -- consult manufacturer; not a fixed ideal range." },
    { parameter: "PH", minValue: 7.2, maxValue: 8.0, idealMin: 7.4, idealMax: 7.6, unit: "", sourceConfidence: "confirmed" },
    { parameter: "CALCIUM_HARDNESS", minValue: 150, maxValue: 600, idealMin: 200, idealMax: 400, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "TEMPERATURE", minValue: 77, maxValue: 104, idealMin: 82, idealMax: 84, unit: "°F", sourceConfidence: "confirmed", notes: "Includes spas/therapy pools. 82-84 is a recommended general-use ideal, not a hard requirement." },
    {
      parameter: "ORP",
      minValue: 250,
      maxValue: 900,
      idealMin: 650,
      idealMax: 850,
      unit: "mV",
      isCurveBased: true,
      curveDescription:
        "Ideal/required range stated as 'at a pH of 7.5, and in accordance with Graph #1' -- a chlorine-ppm/pH/ORP three-variable chart plotting pH (7.0-8.0) against an 'ORP METER' 0-10 axis, one curve per chlorine ppm value (0.1-3.0 ppm). Qualitative behavior confirmed: for a fixed chlorine level, higher pH maps to a lower ORP-meter reading, matching the same HOCl-dissociation family as Alaska's Table E.",
      sourceConfidence: "gap",
      notes:
        "Full curve digitization deliberately not attempted -- a low-resolution scan of a decades-old chart carries real transcription risk, more than Alaska's Table E (which had a clean chemistry formula to cross-check against). The flat 250-900 mV range above remains the operative rule, since ORP monitoring is optional in Colorado in the first place (facilities can rely on DPD chlorine testing alone) and the graph is a supplementary cross-check, not the primary threshold. Accepted as a permanent limitation of this source, not an open research item -- see ComplianceNote.",
    },
    { parameter: "HYDROGEN_PEROXIDE", disinfectionMethod: "HYDROGEN_PEROXIDE", minValue: 20, maxValue: 100, idealMin: 30, idealMax: 40, unit: "ppm", sourceConfidence: "confirmed" },
    {
      parameter: "COPPER_ION",
      disinfectionMethod: "COPPER_ION",
      minValue: 0.25,
      maxValue: 0.95,
      idealMin: 0.3,
      idealMax: 0.5,
      unit: "ppm",
      relationalRule: "Only valid in conjunction with a 0.4 ppm chlorine residual -- compliance depends on a second, different disinfectant's reading also being present and in range.",
      sourceConfidence: "confirmed",
    },
    {
      parameter: "SILVER_ION",
      disinfectionMethod: "SILVER_ION",
      minValue: 15,
      maxValue: 50,
      idealMin: 25,
      idealMax: 40,
      unit: "ppm",
      relationalRule: "Only valid in conjunction with a 0.4 ppm chlorine residual -- same cross-method dependency as the copper ion generator row above.",
      sourceConfidence: "confirmed",
    },
    { parameter: "OZONE", disinfectionMethod: "OZONE", maxValue: 0.1, unit: "ppm", sourceConfidence: "confirmed", notes: "Supplemental oxidizer only -- no ideal range applies." },
    { parameter: "SATURATION_INDEX", minValue: -0.5, maxValue: 0.5, idealMin: -0.2, idealMax: 0.2, unit: "", sourceConfidence: "confirmed" },
    { parameter: "CYANURIC_ACID", minValue: 20, maxValue: 100, idealMin: 20, idealMax: 40, unit: "ppm", sourceConfidence: "confirmed" },
  ],
  frequencyRules: [
    // Pools (includes therapeutic and wading pools)
    { parameter: "DISINFECTANT_AND_PH", bodyOfWaterCategory: "POOL", cadence: "3x/day", intervalMinutes: 480 },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "POOL", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "SATURATION_INDEX", bodyOfWaterCategory: "POOL", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "ORP", bodyOfWaterCategory: "POOL", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "CALCIUM_HARDNESS", bodyOfWaterCategory: "POOL", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "TOTAL_ALKALINITY", bodyOfWaterCategory: "POOL", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "FLOWMETER", bodyOfWaterCategory: "POOL", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "CYANURIC_ACID", bodyOfWaterCategory: "POOL", cadence: "weekly", intervalMinutes: 10080 },
    { parameter: "RESPIRATOR_CHECK", bodyOfWaterCategory: "POOL", cadence: "monthly", intervalMinutes: 43200, notes: "SCBA/canister-type respirator check and canister expiration check." },
    // Spa/Hot Tub -- note temperature moves into the tighter 2-hour bundle here, unlike
    // pools where it's only daily: the per-parameter-by-body-type matrix pattern.
    {
      parameter: "DISINFECTANT_PH_TEMPERATURE",
      bodyOfWaterCategory: "SPA",
      cadence: "every 2 hours",
      intervalMinutes: 120,
      notes: "Bundles disinfectant level, pH, AND temperature -- more granular than a single per-body-type cadence.",
    },
    { parameter: "FLOWMETER", bodyOfWaterCategory: "SPA", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "SATURATION_INDEX", bodyOfWaterCategory: "SPA", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "CALCIUM_HARDNESS", bodyOfWaterCategory: "SPA", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "TOTAL_ALKALINITY", bodyOfWaterCategory: "SPA", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "CYANURIC_ACID", bodyOfWaterCategory: "SPA", cadence: "weekly", intervalMinutes: 10080 },
    { parameter: "RESPIRATOR_CHECK", bodyOfWaterCategory: "SPA", cadence: "monthly", intervalMinutes: 43200 },
  ],
  eventProtocols: [
    {
      triggerType: "BACTERIAL_REPEATED_FAILURE",
      triggerLabel: "Fecal coliform >1/100mL or plate count >200 bacteria/mL",
      closureKind: "N_CONSECUTIVE_FAILURES",
      consecutiveFailuresRequired: 2,
      reopeningCondition: "Resolve the bacterial exceedance. Closure only triggers after two consecutive failed samples -- distinct from every single-reading chemistry-threshold closure collected so far.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "CLARITY_FAILURE",
      triggerLabel: "Main drain grate not visible from deck",
      closureKind: "UNTIL_RETEST_PASSES",
      reopeningCondition: "Restore clarity so the grate is clearly visible; no algae or foreign matter permitted.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "FECAL_SOLID",
      triggerLabel: "Solid feces",
      closureKind: "UNTIL_RETEST_PASSES",
      minimumDurationMinutes: 60,
      reopeningCondition:
        "If disinfection was already within required parameters at time of discovery: closed a minimum of 60 minutes, then reopens. If not: restore disinfection first, then reopen 60 minutes after acceptable levels are attained.",
      remediationSteps: "Close pool, remove all bathers, remove solid matter, check water chemistry -> branch on whether disinfection was already compliant at time of discovery.",
      notes: "A decision-tree shape not seen in Arizona's or Arkansas's otherwise-similar solid-feces protocols.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal contamination",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 1440,
      reopeningCondition: "Superchlorinate (or equivalent); remain closed 24 hours; reopen only if disinfection levels are within required parameters at that point.",
      notes: "24-hour hold is longer than Arkansas's 12.75-hour diarrheal hold, despite Colorado's solid-feces hold (60 min) being shorter than Arkansas's (30 min) -- not a consistent multiplier between the two states.",
      sourceConfidence: "confirmed",
    },
  ],
  complianceNotes: [
    {
      kind: "ASSUMPTION",
      summary: "The free-chlorine minimum when NOT using a supplemental oxidizer isn't stated in Table 1 -- seeded as the ideal-range lower bound (1.0 ppm pool / 3.0 ppm spa), the genuinely-enforced practical floor per local Colorado health departments, not a directly-stated regulatory number.",
      detail: "See the sourceConfidence='assumption' FREE_CHLORINE rows scoped appliesWhen='without a supplemental oxidizer'. Some local logs show figures as low as 0.4 ppm; 1.0/3.0 was chosen as the most defensible, commonly-cited practical floor rather than the lowest observed figure.",
    },
    {
      kind: "GAP",
      summary: "Graph #1 (the ORP/pH/chlorine chart) is not digitized -- qualitative behavior is confirmed, but exact curve values are not extracted, and this is a permanent limitation of the source scan rather than something more research would resolve.",
      detail: "A low-resolution scan of a decades-old regulatory document carries real transcription risk. Since ORP monitoring is optional in Colorado (DPD chlorine testing alone satisfies the requirement), the flat 250-900 mV range remains the operative rule and the graph is kept on file as a supplementary cross-check, not digitized further unless a future need (e.g. an automated ORP-controller integration) justifies the transcription risk.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Florida -- an indoor/outdoor exception on the MAXIMUM rather than a minimum or a
// banned substance (contrast Alabama's indoor CYA ban); the first chemical-triggered
// testing/equipment obligations (using CYA/quat-ammonium/ozone/copper/sodium chloride
// requires a dedicated test kit; silver requires a full lab analysis every six months);
// a descend-below-a-ceiling reopening trigger (the mirror case of every other state's
// "restore the minimum"); and an externally-deferred fecal protocol (a real citation
// pointing to a CDC document, not a missing one). Swim-up bars' facility-subtype rules
// (depth/turnover/automation/food-service) are flagged for completeness but not modeled
// -- out of scope per the handoff's explicit non-goals around facility design rules.
// ---------------------------------------------------------------------------
const FLORIDA: StateSeed = {
  state: "FL",
  ruleset: {
    stateName: "Florida",
    healthDepartmentName: "Florida Department of Health, Bureau of Environmental Health",
    isSupported: false,
    jurisdictionLevel: "STATE",
    officialCitation: "Fla. Admin. Code Ann. R. 64E-9.004 (Operational Requirements); log form incorporated by reference at 64E-9.003",
    recordRetentionMonths: 24,
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "DH 921, Monthly Swimming Pool Report (3/98 edition)",
    logSheetSourceNotes:
      "Chlorine residual and pH recorded three times daily (9 AM, 1 PM, 4 PM, dedicated columns each), plus Filter Gauge Reading, Flow GPM, Pool Vacuumed (Y/N), Number of Patrons, and a Remarks column meant for Total Alkalinity, Hardness, Cyanuric Acid, equipment breakdown, water loss, backwash, and clarity -- several readings captured in freeform remarks rather than dedicated columns.",
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.0, maxValue: 7.8, unit: "", sourceConfidence: "confirmed" },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, maxValue: 10.0, unit: "mg/L", sourceConfidence: "confirmed", notes: "Conventional pools." },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "WADING_POOL",
      minValue: 2.0,
      maxValue: 10.0,
      unit: "mg/L",
      sourceConfidence: "confirmed",
      notes: "Also applies to swim-up bars, special-purpose pools, water attraction pools, and interactive fountains (not duplicated as separate rows).",
    },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 2.0, maxValue: 5.0, unit: "mg/L", sourceConfidence: "confirmed" },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      indoorOutdoor: "INDOOR",
      maxValue: 5.0,
      unit: "mg/L",
      sourceConfidence: "confirmed",
      notes: "Indoor conventional pools: lower ceiling than the standard 10.0 max. An indoor/outdoor exception on the MAXIMUM, not a minimum or a banned substance -- contrast Alabama's indoor CYA ban.",
    },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 1.5, maxValue: 6.0, unit: "mg/L", sourceConfidence: "confirmed" },
    {
      parameter: "BROMINE",
      disinfectionMethod: "BROMINE",
      bodyOfWaterCategory: "WADING_POOL",
      minValue: 3.0,
      maxValue: 6.0,
      unit: "mg/L",
      sourceConfidence: "confirmed",
      notes: "Also applies to swim-up bars, special-purpose pools, water attraction pools, and interactive fountains (not duplicated as separate rows).",
    },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", indoorOutdoor: "INDOOR", maxValue: 6.0, unit: "mg/L", sourceConfidence: "confirmed", notes: "Indoor conventional pools." },
    { parameter: "ORP", minValue: 700, maxValue: 850, unit: "mV", sourceConfidence: "confirmed", notes: "When ORP controllers are used, this does not negate the manual daily testing requirement." },
    { parameter: "CYANURIC_ACID", bodyOfWaterCategory: "POOL", maxValue: 100, unit: "mg/L", sourceConfidence: "confirmed", notes: "40 mg/L is a non-binding recommended max." },
    { parameter: "CYANURIC_ACID", bodyOfWaterCategory: "SPA", maxValue: 40, unit: "mg/L", sourceConfidence: "confirmed" },
    { parameter: "QUATERNARY_AMMONIUM", maxValue: 5, unit: "mg/L", sourceConfidence: "confirmed" },
    { parameter: "COPPER", maxValue: 1, unit: "mg/L", sourceConfidence: "confirmed" },
    { parameter: "SILVER", maxValue: 0.1, unit: "mg/L", sourceConfidence: "confirmed" },
    { parameter: "TURBIDITY", maxValue: 0.5, unit: "NTU", sourceConfidence: "confirmed", notes: "AND the main drain grate must be visible from deck -- both conditions apply." },
  ],
  frequencyRules: [
    {
      parameter: "ALL",
      cadence: "minimum once per 24 hours",
      intervalMinutes: 1440,
      notes: "Manual pH/disinfectant testing. The DH 921 form has 3 timestamped columns/day (9/1/4), but the regulatory text only requires once per 24 hours -- see ComplianceNote on the form-vs-regulation cadence mismatch.",
    },
    {
      parameter: "CYANURIC_ACID",
      cadence: "weekly",
      intervalMinutes: 10080,
      notes: "Only when chlorinated isocyanurates are used, at both spas and pools.",
    },
    {
      parameter: "SILVER",
      cadence: "every six months",
      intervalMinutes: 262800,
      notes: "Full lab water analysis, not a field test -- required if silver is used as a supplemental disinfectant, submitted to the department on request.",
    },
  ],
  eventProtocols: [
    {
      triggerType: "CHEMICAL_MANUAL_ADDITION",
      triggerLabel: "Manual chemical addition",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 60,
      reopeningCondition: "Pool must be closed before manually adding chemicals, and remains closed at least 1 hour after (longer if needed for safe distribution).",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "BREAKPOINT_CHLORINATION_REOPENING",
      triggerLabel: "Reopening after breakpoint chlorination or algae treatment",
      closureKind: "DESCEND_BELOW_CEILING",
      reopeningCondition: "Pool may reopen once free chlorine drops to 10.0 mg/L or less -- recovery means the reading coming back down, the mirror case of every other state's 'restore the minimum' reopening logic (Arkansas, Arizona, Colorado all reopen once a minimum is reached or exceeded).",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "CYA_IN_USE",
      triggerLabel: "Using cyanuric acid",
      closureKind: "CHEMICAL_TESTING_OBLIGATION",
      requiresSeparateTestKit: true,
      reopeningCondition: "N/A -- not a closure trigger. Choosing to use this chemical creates a dedicated test-kit requirement, separate from and in addition to its numeric threshold.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "SODIUM_CHLORIDE_IN_USE",
      triggerLabel: "Using sodium chloride (salt chlorination)",
      closureKind: "CHEMICAL_TESTING_OBLIGATION",
      requiresSeparateTestKit: true,
      reopeningCondition: "N/A -- testing-equipment obligation, not a closure trigger.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "QUATERNARY_AMMONIUM_IN_USE",
      triggerLabel: "Using quaternary ammonium",
      closureKind: "CHEMICAL_TESTING_OBLIGATION",
      requiresSeparateTestKit: true,
      reopeningCondition: "N/A -- testing-equipment obligation, not a closure trigger.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "OZONE_IN_USE",
      triggerLabel: "Using ozone",
      closureKind: "CHEMICAL_TESTING_OBLIGATION",
      requiresSeparateTestKit: true,
      reopeningCondition: "N/A -- testing-equipment obligation, not a closure trigger.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "COPPER_IN_USE",
      triggerLabel: "Using copper",
      closureKind: "CHEMICAL_TESTING_OBLIGATION",
      requiresSeparateTestKit: true,
      reopeningCondition: "N/A -- testing-equipment obligation, not a closure trigger.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "SILVER_IN_USE",
      triggerLabel: "Using silver as a supplemental disinfectant",
      closureKind: "CHEMICAL_TESTING_OBLIGATION",
      labAnalysisFrequency: "every six months",
      reopeningCondition: "N/A -- a periodic full lab water analysis obligation (not a field test kit), submitted to the department on request.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Formed stool (or vomit treated as formed)",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 25,
      ctValue: 50,
      ctValueUnit: "ppm·min",
      reopeningCondition: "Free chlorine raised to (or maintained at) 2 ppm, pH <= 7.5, held at least 25-30 minutes (CT ~50-60). Confirm filtration operating throughout. Reopen once residual/pH are back in normal operating range.",
      remediationSteps: "Close pool, clear bathers -> remove solid material with net/scoop (never vacuum into the filter), dispose properly, disinfect tools -> raise/confirm free chlorine >= 2 ppm, pH <= 7.5 -> hold 25-30 min -> document time, type, chlorine/pH readings before/during/after and actions taken.",
      externalReferenceLabel: "CDC — Fecal Incident Response Recommendations for Aquatic Staff (June 2018)",
      sourceConfidence: "confirmed",
      notes: "Florida's own rule still defers by citation to this CDC document rather than writing the numbers into code, but the actual CDC content is now sourced -- matches Arkansas's and New York's numbers for the same incident type almost exactly.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal stool",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 765,
      ctValue: 15300,
      ctValueUnit: "ppm·min",
      reopeningCondition: "Free chlorine raised to 20 ppm, pH <= 7.5, maintained for 12.75 hours (CT ~15,300). Backwash/clean filters after the disinfection period, dispose of wastewater properly. Reopen only once residual and pH are back in normal operating range.",
      remediationSteps: "Close immediately, remove material -> raise free chlorine to 20 ppm, pH <= 7.5 -> maintain 12.75 hours -> backwash/clean filters -> document thoroughly.",
      externalReferenceLabel: "CDC — Fecal Incident Response Recommendations for Aquatic Staff (June 2018)",
      sourceConfidence: "confirmed",
      notes: "Matches the same CDC/MAHC CT=15,300 standard already confirmed across Arkansas, New York, and California.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal stool, cyanuric acid present",
      appliesWhen: "if cyanuric acid present",
      closureKind: "FIXED_DURATION",
      reopeningCondition:
        "CDC guidance offers CYA removal as the FIRST option: lower CYA to <= 15 ppm (via partial drain/refill if needed), then follow the standard no-CYA diarrheal protocol above. If CYA can't be reduced, the fallback is higher chlorine concentration and/or longer contact time per CDC guidance -- exact fallback numbers aren't given in this excerpt.",
      externalReferenceLabel: "CDC — Fecal Incident Response Recommendations for Aquatic Staff (June 2018)",
      sourceConfidence: "confirmed",
      notes:
        "A third distinct mechanism for handling CYA-during-incident, different from both New York (doubles the standard treatment time) and California (defines an entirely separate pH/ppm/hold target) -- Florida's CDC guidance offers removing the CYA itself as the first option. The fallback path's exact concentration/time numbers remain unspecified in this excerpt (a narrower, real citation gap, not a fabricated placeholder).",
    },
    {
      triggerType: "BLOOD",
      triggerLabel: "Blood contamination",
      closureKind: "UNTIL_RETEST_PASSES",
      reopeningCondition:
        "Treated less stringently if free chlorine is already at or above the required minimum at the time of the incident -- no closure needed in that case. If free chlorine is below the required minimum, close until it's restored.",
      sourceConfidence: "confirmed",
      notes: "Matches California's and Maryland's 'check the current level, don't assume elevated risk' approach -- not New York's blanket blood-closure exemption.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "The DH 921 log form has three timestamped columns per day (9 AM/1 PM/4 PM), but the regulatory text only requires manual testing once per 24 hours.",
      detail: "The 3x/day structure appears to be the state's standard practice/form design, not a hard regulatory minimum. Worth deciding whether the in-app default should follow the form's implied cadence or the regulation's stated floor -- not resolved here.",
    },
    {
      kind: "ASSUMPTION",
      summary: "No fixed record-retention period is stated in the rule itself (§64E-9.004(11) just says 'retained at the pool and made available on request'). Seeded recordRetentionMonths=24 as the commonly-cited practical minimum for routine logs, not a stated regulatory number.",
      detail: "Practice varies 1-2 years across county health departments; incident-related records (especially fecal/vomit events) are often kept longer -- commonly 3-5+ years or until the applicable statute of limitations expires, given their liability relevance. Only the routine-log figure is reflected in recordRetentionMonths; incident-record retention is a separate business/legal decision not modeled as a single number here.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "Swim-up bars are a distinct facility subtype (54-inch max depth, 2-hour turnover vs. the standard 6, mandatory automated dosing controller, food-service rules) beyond the standard pool/spa chemistry variants.",
      detail: "Noted for completeness per state-compliance-data.md; out of scope for this pass's reading/log-sheet feature per the handoff's explicit non-goals around non-chemistry facility design/construction requirements.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Maryland -- built from scratch against the correct citation (COMAR 10.17.01, not the
// earlier secondary source's wrong 10.17.04). Facility category (recreational/semipublic/
// limited-public-use) drives testing frequency (2-hour vs. 3x/day bundle), not just
// pool-vs-spa. First state where a secondary disinfection method (copper/silver ions)
// REDUCES the primary chlorine floor rather than adding a companion-reading requirement
// (contrast Colorado's ion generators, which require a 0.4ppm chlorine residual
// alongside). First state where a fecal-incident hold clock starts at VERIFIED EVEN
// DISTRIBUTION (every-15-ft perimeter sampling), not at the moment target concentration
// is reached. CYA restriction is conditional (banned indoors OR with bromine -- either
// condition, not a numeric cap), a different shape than every other state's CYA handling.
// ---------------------------------------------------------------------------
const MARYLAND: StateSeed = {
  state: "MD",
  ruleset: {
    stateName: "Maryland",
    healthDepartmentName: "Maryland Department of Health (MDH)",
    isSupported: false,
    jurisdictionLevel: "COUNTY_DISTRIBUTED_STATE_DERIVED",
    countyName: "Queen Anne's County",
    officialCitation: "COMAR 10.17.01 (Public Swimming Pools and Spas) — §.44 (Disinfection), §.45 (Water Chemistry), §.46 (Operating Records)",
    sourceDocument:
      "COMAR 10.17.01, Maryland Department of Health; Queen Anne's County's rendering of the Secretary-provided standard operating-record form. The 'Fecal, Vomit and Blood Contamination Policy' is a separate statewide MDH policy package, not part of COMAR itself.",
    recordRetentionMonths: 36,
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Secretary-provided standard operating-record form (Queen Anne's County rendering, labeled 'Semi-Public Pool')",
    logSheetSourceNotes:
      "Testing structured around three named operational windows (see FrequencyRule notes below). Each window captures free chlorine/total bromine, combined chlorine, pH, clarity, water temperature (if heated), flow rate, filter influent/effluent pressure, pump vacuum, total bathers. Daily: filter backwash time, chemicals added, equipment issues, injuries/accidents. Weekly: total alkalinity, calcium hardness, cyanuric acid if used -- accurate for pools per the real regulation, though spas require daily per FrequencyRule below; the county form itself is labeled 'Semi-Public Pool' and may not reflect the spa-specific daily cadence. Disinfectant-used checkboxes: gas chlorine, sodium/calcium/lithium hypochlorite, ozone, bromine, other. Facility categories driving frequency: Recreational pool (general public, swim clubs, municipalities, larger apartment complexes), Semipublic pool (hotels/motels, smaller apartment complexes <=10 units, health clubs, condominiums), Limited public-use pool.",
  },
  chemistryThresholds: [
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.5, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Swim/diving and water-recreation pools." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "WADING_POOL", minValue: 3.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Also covers therapy pools." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 4.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed" },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      appliesWhen: "if a copper/silver ion system is in use",
      minValue: 0.5,
      maxValue: 10.0,
      unit: "ppm",
      relationalRule:
        "Using a copper/silver ion secondary disinfection system REDUCES the required free chlorine floor while active -- the opposite direction of Colorado's ion generators, which instead REQUIRE a 0.4 ppm chlorine residual as a companion reading.",
      sourceConfidence: "confirmed",
      notes: "Swim/diving pools.",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "SPA",
      appliesWhen: "if a copper/silver ion system is in use",
      minValue: 3.0,
      maxValue: 8.0,
      unit: "ppm",
      relationalRule: "Same threshold-reducing secondary-disinfection effect as the pool row above.",
      sourceConfidence: "confirmed",
      notes: "Spas/wading/therapy pools.",
    },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 3.0, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "WADING_POOL", minValue: 4.0, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Also covers therapy pools." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 4.0, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "COMBINED_CHLORINE", maxValue: 0.2, unit: "ppm", sourceConfidence: "confirmed", notes: "Same 0.2 ppm max across pools, wading/therapy pools, and spas -- one row, not duplicated per body type." },
    { parameter: "PH", minValue: 7.2, maxValue: 7.8, unit: "", sourceConfidence: "confirmed" },
    { parameter: "TOTAL_ALKALINITY", minValue: 60, maxValue: 180, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "CALCIUM_HARDNESS", minValue: 150, maxValue: 400, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "SATURATION_INDEX", minValue: -0.5, maxValue: 0.5, unit: "", sourceConfidence: "confirmed" },
    { parameter: "TDS", maxValue: 1500, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "TDS", appliesWhen: "salt-water pools", maxValue: 3000, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "IRON", maxValue: 0.3, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "MANGANESE", maxValue: 0.3, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "COPPER", maxValue: 1.3, unit: "ppm", sourceConfidence: "confirmed", notes: "Dissolved copper ceiling for standard chemistry -- distinct from the copper ion generator's own 0.2-1.0 ppm operating range below." },
    { parameter: "CLARITY", unit: "", sourceConfidence: "confirmed", notes: "Main drain or a 6-inch Secchi disc clearly visible from the side." },
    { parameter: "COPPER_ION", disinfectionMethod: "COPPER_ION", minValue: 0.2, maxValue: 1.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "SILVER_ION", disinfectionMethod: "SILVER_ION", maxValue: 0.05, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "OZONE", disinfectionMethod: "OZONE", maxValue: 0.1, unit: "ppm", sourceConfidence: "confirmed", notes: "Measured specifically 2 inches above the water surface -- a specific measurement location, not just a threshold." },
    {
      parameter: "PHMB",
      disinfectionMethod: "NOT_APPLICABLE",
      minValue: 30,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "First PHMB (polyhexamethylene biguanide) disinfectant collected across any state so far. Incompatible with jets/sprays, halogens, or ozone -- an equipment/chemical incompatibility rule, not just a threshold. Stored with disinfectionMethod=NOT_APPLICABLE since the DisinfectionMethod enum doesn't yet have a PHMB value; not worth a schema migration for a single state's single reading -- see COMPLIANCE_RULESET_NOTES.md.",
    },
    {
      parameter: "CYANURIC_ACID",
      unit: "",
      relationalRule:
        "Not allowed indoors, AND not allowed with bromine -- two independent restriction conditions (either one applies), not a numeric cap. A genuinely different rule shape than every other state's CYA handling collected so far (Alabama: no ban, just a numeric range; Alaska: full ban; New York: full ban naming specific products).",
      sourceConfidence: "confirmed",
      notes: "No numeric range exists in COMAR -- the earlier (wrong-citation) entry's 100 ppm max/30-50 ideal range doesn't appear in the real regulation at all.",
    },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_COMBINED_CHLORINE_PH",
      facilityAttribute: "recreational_pool_or_public_spa",
      cadence: "every 2 hours",
      intervalMinutes: 120,
    },
    {
      parameter: "DISINFECTANT_COMBINED_CHLORINE_PH",
      facilityAttribute: "semipublic_or_limited_public_use_pool",
      cadence: "3x/day",
      intervalMinutes: 480,
    },
    {
      parameter: "ALL",
      cadence: "at least 3x/day",
      intervalMinutes: 480,
      notes: "Clarity, temperature (if heated), flow rate, filter pressures, pump vacuum, bather load -- applies to all public pools/spas regardless of facility category.",
    },
    {
      parameter: "ALL",
      appliesWhen: "with an approved automatic controller",
      cadence: "3x/day on a fixed schedule: 1/2 hour before opening, between 12-2 PM, and 2 hours before closing",
      notes: "Exactly matches the Queen Anne's County form's three named operational windows -- cross-validates the county form's accuracy even though the citation originally attached to it (COMAR 10.17.04) was wrong.",
    },
    { parameter: "TOTAL_ALKALINITY", bodyOfWaterCategory: "POOL", cadence: "weekly", intervalMinutes: 10080 },
    { parameter: "TOTAL_ALKALINITY", bodyOfWaterCategory: "SPA", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "CALCIUM_HARDNESS", bodyOfWaterCategory: "POOL", cadence: "weekly", intervalMinutes: 10080 },
    { parameter: "CALCIUM_HARDNESS", bodyOfWaterCategory: "SPA", cadence: "daily", intervalMinutes: 1440 },
    { parameter: "CYANURIC_ACID", bodyOfWaterCategory: "POOL", appliesWhen: "if used", cadence: "weekly", intervalMinutes: 10080 },
    { parameter: "CYANURIC_ACID", bodyOfWaterCategory: "SPA", appliesWhen: "if used", cadence: "daily", intervalMinutes: 1440 },
  ],
  eventProtocols: [
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Solid (formed) stool or vomit",
      closureKind: "HOLD_AFTER_VERIFIED_DISTRIBUTION",
      minimumDurationMinutes: 30,
      reopeningCondition:
        "Free chlorine raised to at least 10 ppm throughout the entire pool, pH 7.2-7.5, held 30 minutes AFTER even distribution is verified (readings taken every 15 feet around the perimeter) -- the hold clock starts at verified distribution, not at the moment chlorine is raised. Backwash filters afterward and disinfect filter media with a 1:20 bleach solution. Reduce free chlorine back to normal operating range before reopening.",
      remediationSteps:
        "Immediately close the pool/spa, clear all bathers, post 'temporarily closed' signs -> remove solid material with a scoop/net (never vacuum into the filter), dispose in sanitary sewer/toilet, clean and disinfect the scoop -> keep filtration running throughout -> raise free chlorine to >= 10 ppm, pH 7.2-7.5 -> verify even distribution via readings every 15 ft around the perimeter -> hold 30 minutes from that verification -> backwash filters, disinfect filter media with 1:20 bleach solution -> reduce FC to normal range -> document the incident, closure times, and all chlorine/pH readings.",
      notes:
        "Notably higher FC target (10 ppm) than every other state's formed-fecal target collected so far (Arkansas/New York/California all use ~2 ppm for a similar-length hold). The hold clock's dependency on verified even distribution rather than just reaching target concentration at one point is a genuinely new mechanic -- see ComplianceNote.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Loose/diarrheal stool",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 960,
      ctValue: 9600,
      ctValueUnit: "ppm·min",
      reopeningCondition: "Policy cites 10 ppm free chlorine for 16 hours as the reference CT value.",
      remediationSteps: "Same general closure/removal/filtration steps as the formed-stool row above, held for the longer diarrheal duration.",
      sourceConfidence: "confirmed",
      notes:
        "This cited figure (10ppm x 16hr x 60 = 9,600 ppm·min) is meaningfully LOWER than the CT=15,300 ppm·min standard Arkansas/New York/California all converge on independently -- seeded as Maryland's actual cited figure, not corrected toward the other states' number. See ComplianceNote.",
    },
    {
      triggerType: "BLOOD",
      triggerLabel: "Blood contamination",
      closureKind: "UNTIL_RETEST_PASSES",
      reopeningCondition:
        "No requirement to remove blood from the water. Check current free chlorine level; if below the facility's required minimum, close until restored. Clean/disinfect deck or surface contamination with a bloodborne pathogen kit.",
      sourceConfidence: "confirmed",
      notes: "Matches California's approach (check current level, don't assume elevated risk), not New York's blanket blood-closure exemption.",
    },
  ],
  complianceNotes: [
    {
      kind: "ASSUMPTION",
      summary: "Cross-state CT-value discrepancy: Maryland's diarrheal-incident policy cites a CT of ~9,600 ppm·min (10 ppm/16hr), meaningfully lower than the 15,300 ppm·min standard Arkansas, New York, and California all converge on independently.",
      detail:
        "This could mean Maryland's policy draws on a different/older reference standard, that this is a simplified summary rather than the precise MDH fact sheet language, or a genuine state-to-state difference in required rigor. Seeded as Maryland's actual cited figure rather than 'corrected' toward the other states' number -- worth verifying against the full MDH fact sheet if exact precision ever matters.",
    },
    {
      kind: "GAP",
      summary: "PHMB doesn't have a DisinfectionMethod enum value -- seeded with disinfectionMethod=NOT_APPLICABLE on the PHMB ChemistryThreshold row instead of adding an enum value for a single state's single reading.",
      detail: "Revisit if PHMB (or another disinfectant type outside CHLORINE/BROMINE/HYDROGEN_PEROXIDE/COPPER_ION/SILVER_ION/OZONE) shows up in another state's data -- at that point a real enum value (or switching the field to free text like ChemistryThreshold.parameter) would be worth the migration.",
    },
    {
      kind: "GAP",
      summary: "Jurisdiction level seeded as COUNTY_DISTRIBUTED_STATE_DERIVED: COMAR 10.17.01 is genuinely state-level, but the sourced log form is Queen Anne's County's rendering of the Secretary-provided standard form.",
      detail: "Same ambiguous-jurisdiction shape as California's Sacramento-County-branded form. Local health departments commonly distribute their own standardized versions covering both recreational and semipublic pools, with only the frequency columns differing.",
    },
  ],
};

const ALL_STATES: StateSeed[] = [
  NEVADA,
  CONNECTICUT,
  ALABAMA,
  ALASKA,
  ARIZONA,
  ARKANSAS,
  CALIFORNIA,
  COLORADO,
  FLORIDA,
  MARYLAND,
];

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
