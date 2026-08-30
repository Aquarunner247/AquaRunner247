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
type EquipmentReadingRequirementInput = Omit<Prisma.EquipmentReadingRequirementCreateManyInput, "complianceRulesetId">;

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
  /** Optional -- omitted (defaults to none) for every state without a sourced gauge/meter
   * log-sheet requirement yet. See EquipmentReadingRequirement's doc comment. */
  equipmentReadingRequirements?: EquipmentReadingRequirementInput[];
};

async function seedState(seed: StateSeed) {
  const ruleset = await prisma.complianceRuleset.upsert({
    where: { state: seed.state },
    create: { state: seed.state, ...seed.ruleset },
    update: seed.ruleset,
    select: { id: true, stateName: true },
  });

  const equipmentReadingRequirements = seed.equipmentReadingRequirements ?? [];

  await prisma.$transaction([
    prisma.chemistryThreshold.deleteMany({ where: { complianceRulesetId: ruleset.id } }),
    prisma.frequencyRule.deleteMany({ where: { complianceRulesetId: ruleset.id } }),
    prisma.eventProtocol.deleteMany({ where: { complianceRulesetId: ruleset.id } }),
    prisma.complianceNote.deleteMany({ where: { complianceRulesetId: ruleset.id } }),
    prisma.equipmentReadingRequirement.deleteMany({ where: { complianceRulesetId: ruleset.id } }),
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
    prisma.equipmentReadingRequirement.createMany({
      data: equipmentReadingRequirements.map((e) => ({ ...e, complianceRulesetId: ruleset.id })),
    }),
  ]);

  console.log(
    `  ${seed.state} (${ruleset.stateName}): ${seed.chemistryThresholds.length} thresholds, ${seed.frequencyRules.length} frequency rules, ${seed.eventProtocols.length} event protocols, ${seed.complianceNotes.length} notes, ${equipmentReadingRequirements.length} equipment reading requirements`,
  );
}

// ---------------------------------------------------------------------------
// Nevada -- migrated from the previous pass's flat ComplianceRuleset fields, which were
// themselves migrated from the hardcoded values in app/dashboard/page.tsx,
// app/p/[publicSlug]/page.tsx, app/components/alerts-bell.tsx, and the visit-completion
// CYA-freshness check. This is the regression-check state: the app's existing behavior
// must be unchanged after reading from these rows instead of flat fields.
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
- **pH:** 7.0 – 7.8
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

### Equipment / gauge readings
Every visit also requires a pump pressure, pump vacuum, filter pressure, and flow meter
reading, matching SNHD's own paper log sheet.

*This page reflects AquaRunner's built-in rule engine, not a substitute for SNHD's own
published code. Verify against the authoritative source for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 2, maxValue: 10, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 3, maxValue: 10, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "PH", idealMin: 7.0, idealMax: 7.8, hazardMin: 6.5, hazardMax: 8.0, unit: "", sourceConfidence: "confirmed" },
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
  // Matches AquaRunner's existing hardcoded equipment fields exactly -- this is the
  // regression-check state, see the file-level comment on NEVADA above.
  equipmentReadingRequirements: [{ parameter: "PUMP_PRESSURE" }, { parameter: "PUMP_VACUUM" }, { parameter: "FILTER_PRESSURE" }, { parameter: "FLOW_METER" }],
};

// ---------------------------------------------------------------------------
// Connecticut -- real code text (§19-13-B33b) is now confirmed, not just the earlier DPH
// guideline summary. The closure-risk gap is resolved: the code frames closure as a
// two-tier discretionary/mandatory health-director authority rather than a flat
// threshold, unlike every other state's closure logic collected so far. Alkalinity and
// CYA cadence are real local-health-district conventions (Newtown, Franklin, Meriden,
// etc.), not business-decision placeholders, though still not *state*-code numbers --
// isSupported stays false since the state code itself still leaves alkalinity range and
// CYA cadence genuinely unstated at the state level.
// ---------------------------------------------------------------------------
const CONNECTICUT: StateSeed = {
  state: "CT",
  ruleset: {
    stateName: "Connecticut",
    healthDepartmentName: "Connecticut Department of Public Health",
    isSupported: true,
    jurisdictionLevel: "STATE",
    officialCitation: "CT Public Health Code § 19-13-B33b",
    sourceDocument:
      "CT Public Health Code § 19-13-B33b (actual code text, portal.ct.gov) and the Connecticut Public Swimming Pool Manual/Design Guide (April 2021), which reprints it",
    logSheetSource: "BUILT_FROM_CODE",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under CT Public Health Code
§ 19-13-B33b.

### Chemistry targets
- **Free chlorine:** 0.8 ppm minimum (pools), 1.5 ppm minimum if chlorinated cyanurates
  are used, 1.0 ppm minimum (spas)
- **pH:** 7.2 – 7.8 (caustic alkalinity must not be present)
- **Total alkalinity:** 80 – 150 ppm — the state code itself specifies no range; this is
  the figure commonly adopted by local health districts (Newtown, Franklin, Meriden, and
  others) that enforce the state code, tested weekly and within 3 hours of adding
  make-up water
- **Cyanuric acid:** max 100 ppm, same weekly/post-make-up-water testing convention

### Testing frequency
Disinfectant residual and pH tested immediately prior to daily opening, then at
sufficient frequency during bather use to keep levels adequate — not a fixed count, an
adequacy standard requiring immediate correction if levels fall short.

### Closure authority
Connecticut's code frames closure as the health director's authority rather than a flat
threshold: **discretionary** for any failure to meet the regulations or any condition
constituting a public health/safety hazard or nuisance, and **mandatory** specifically
for evidence of communicable disease transmission, a significant health nuisance, or an
imminent safety hazard. The numeric minima above function as the practical triggers for
the mandatory tier.

### Equipment / gauge readings
Every visit also requires a flow meter reading and a pressure gauge reading. Connecticut's
own daily-log language names a generic "pressure gauge reading" without distinguishing a
pump gauge from a filter gauge -- AquaRunner logs this as the Filter Pressure field.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the
Connecticut Department of Public Health's own published code. Verify against the
authoritative source for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    // bodyOfWaterCategory: "POOL" is required on both rows below, not left unscoped --
    // lib/compliance.ts's activeChemistryThresholds always looks FREE_CHLORINE up per body
    // type (POOL/SPA), unlike PH/ALKALINITY/CYA which it looks up unconditionally. Leaving
    // these unscoped (as an earlier pass of this seed did) meant the app's pool-chlorine
    // lookup found zero rows despite the real 0.8 ppm minimum sitting in the table.
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 0.8, unit: "ppm", sourceConfidence: "confirmed", notes: "standard minimum residual" },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
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
  equipmentReadingRequirements: [
    { parameter: "FLOW_METER" },
    {
      parameter: "FILTER_PRESSURE",
      notes: "Source states a generic 'pressure gauge reading' without specifying pump vs. filter -- mapped to Filter Pressure as the closest existing field; Connecticut's own form doesn't distinguish two separate gauges the way Nevada's does.",
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
    isSupported: true,
    jurisdictionLevel: "COUNTY",
    countyName: "Baldwin County",
    officialCitation: "Alabama pool rules — General Provisions (Sections 5–6); Appendix A (Public Swimming Pool); Appendix B (Public Spa)",
    sourceDocument: "Baldwin County Health Dept, Environmental Health Section — General Provisions + Appendix A/B, and the 'Operational Report' log form",
    recordRetentionMonths: 12,
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Baldwin County Health Dept 'Operational Report' form (monthly, one row per day)",
    logSheetSourceNotes:
      "Fields: Date, Filter Rate (GPM), Free Chlorine, pH, Alkalinity, Water Temp, Filter Backwash, Pump Strainer Cleaned, Super Chlorination, Cyanuric Acid, Calcium Hardness, Initials, Notes. Pool type captured via checkboxes: Outdoor Pool, Indoor Pool, Wading Pool, Water Attraction Pool, Spa, Therapy Pool, Exercise Pool, Other.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under Baldwin County Health
Department's General Provisions and Appendix A (Pool) / Appendix B (Spa).

### Chemistry targets
- **Free chlorine:** 1.0 – 3.0 ppm (pools), 2.0 – 10.0 ppm minimum-to-max, 3.0 – 5.0 ppm
  ideal (spas)
- **Bromine (if used):** 2.0 – 4.0 ppm (pools), 2.0 – 10.0 ppm minimum-to-max, 4.0 – 6.0
  ppm ideal (spas)
- **pH:** 7.2 – 7.8, ideal 7.4 – 7.6
- **Total alkalinity:** 60 – 180 ppm, ideal 80 – 120 ppm
- **Cyanuric acid (if used):** 10 – 150 ppm, ideal 30 – 50 ppm — no indoor/outdoor
  restriction in the actual county rules, just this numeric range

### Testing frequency
Pool chlorine and pH are tested **twice daily**; spa chlorine and pH are tested
**hourly** — a notably different pool-vs-spa cadence than most states, not just a
different numeric range. Turbidity is checked hourly for both.

### Equipment / gauge readings
Every visit also requires a flow meter reading, sourced from the official log form's
"Filter Rate (GPM)" column.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Alabama
Department of Public Health's own published code. Verify against the authoritative
source for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    // Public Pool -- Appendix A
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, idealMin: 1.0, idealMax: 3.0, maxValue: 3.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", appliesWhen: "if used", minValue: 2.0, idealMin: 2.0, idealMax: 4.0, maxValue: 4.0, unit: "ppm", sourceConfidence: "confirmed" },
    // PH/TOTAL_ALKALINITY/CYANURIC_ACID are unscoped (no bodyOfWaterCategory) rather than
    // duplicated per POOL/SPA -- Alabama's Appendix A and B give the SAME numbers for both,
    // and lib/compliance.ts's activeChemistryThresholds looks these three parameters up
    // unconditionally (bodyOfWaterCategory: null), unlike FREE_CHLORINE which is always
    // looked up per body type. Scoping these to POOL/SPA (as an earlier pass of this seed
    // did) faithfully mirrored Appendix A/B's layout but meant the app's lookup found zero
    // rows for any of the three -- collapsing to one unconditional row per parameter fixes
    // that without changing any actual number.
    { parameter: "PH", minValue: 7.2, idealMin: 7.4, idealMax: 7.6, maxValue: 7.8, unit: "", sourceConfidence: "confirmed" },
    { parameter: "TOTAL_ALKALINITY", minValue: 60, idealMin: 80, idealMax: 120, maxValue: 180, unit: "ppm", sourceConfidence: "confirmed" },
    {
      parameter: "CYANURIC_ACID",
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
    // PH/TOTAL_ALKALINITY/CYANURIC_ACID: same unconditional rows as the pool section above
    // cover spas too (Appendix B gives identical numbers) -- not duplicated here.
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
  equipmentReadingRequirements: [
    { parameter: "FLOW_METER", notes: "Sourced from the official form's 'Filter Rate (GPM)' column." },
  ],
};

// ---------------------------------------------------------------------------
// Alaska -- genuinely state-level (contrast with Nevada/Alabama's county sources).
// First curve-based threshold (pH redefines the FAC minimum via a lookup table, not a
// branch) and first lab-result-triggered closure with an indeterminate reopening window.
// FIXED this pass: (1) Table E's curve values are now in hand (state-compliance-data.md's
// architecture notes resolved the graph against the HOCl dissociation equilibrium,
// pKa ~7.5) -- real curveDataPoints and a computable relationalRule formula replace the
// old placeholder gap, so isSupported flips to true. (2) FREE_CHLORINE/BROMINE previously
// had no bodyOfWaterCategory at all -- the same silent-null scoping bug previously found
// for Connecticut/Hawaii, just never caught because this state was never flipped live
// before. Both now duplicated onto explicit POOL/SPA rows (the
// source gives one undifferentiated figure for both, per state-compliance-data.md).
// ---------------------------------------------------------------------------
const ALASKA: StateSeed = {
  state: "AK",
  ruleset: {
    stateName: "Alaska",
    healthDepartmentName: "Alaska Department of Environmental Conservation (ADEC)",
    isSupported: true,
    jurisdictionLevel: "STATE",
    officialCitation: "18 AAC 30 (18 AAC 30.550)",
    sourceDocument: "Pool Testing Guidelines (ADEC guidance doc, rev. 6/12/2012) + 18 AAC 30.550 regulatory text",
    logSheetSource: "BUILT_FROM_CODE",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under 18 AAC 30.550.

### Chemistry targets
- **Free chlorine:** rises with pH — roughly 0.4 ppm at pH 7.0 up to 1.25–1.5 ppm at pH
  8.0, a curve rather than a flat number (must yield at least 0.3 ppm hypochlorous acid)
- **Total chlorine:** 2.0 – 10.0 ppm
- **Bromine:** 2.0 – 4.0 ppm
- **pH:** 7.0 – 8.0
- **Cyanuric acid:** prohibited entirely — not just indoors
- **Total alkalinity:** 50 – 200 ppm
- **Total hardness:** 100 – 1,000 ppm; calcium hardness must be at least 70% of it

### Closure triggers
A positive pathogen lab result (e.g. pseudomonas) closes the pool until a retest confirms
it's clear — no fixed reopening window, since lab turnaround time isn't specified.

### Equipment / gauge readings
Every visit also requires a flow meter reading and a pressure/vacuum reading. Alaska's
own daily-log language bundles "pressure/vacuum readings" without naming a specific
gauge -- AquaRunner logs this as the Filter Pressure and Pump Vacuum fields.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Alaska
Department of Environmental Conservation's own published rules. Verify against the
authoritative source for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.0, maxValue: 8.0, unit: "", sourceConfidence: "confirmed", notes: "measured to nearest 0.2; must be maintained in this range while bathers are in the water" },
    { parameter: "TOTAL_CHLORINE", disinfectionMethod: "CHLORINE", minValue: 2.0, maxValue: 10.0, unit: "mg/l", sourceConfidence: "confirmed", notes: "Total Available Chlorine (TAC), nearest 0.2mg" },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      minValue: 0.4,
      unit: "mg/l",
      isCurveBased: true,
      curveDescription:
        "18 AAC 30.550 Table E: the minimum free chlorine dosage needed to hit a 0.3 mg/l hypochlorous-acid yield changes with measured pH (lower pH needs less chlorine for the same kill power, higher pH needs more). Read pH -> find corresponding minimum FAC from the curve -> compare against tested FAC. minValue:0.4 is the pH-7.0 floor from the table below, used as the resolvable single-value default since this app's chlorineFamilyThreshold doesn't evaluate curves per-reading -- the real minimum at a given pH may be higher, up to ~1.25-1.5 mg/l at pH 8.0.",
      curveDataPoints: [
        { ph: 7.0, minFacMgL: 0.4 },
        { ph: 7.1, minFacMgL: 0.42 },
        { ph: 7.2, minFacMgL: 0.45 },
        { ph: 7.3, minFacMgL: 0.49 },
        { ph: 7.4, minFacMgL: 0.54 },
        { ph: 7.5, minFacMgL: 0.6 },
        { ph: 7.6, minFacMgL: 0.68 },
        { ph: 7.7, minFacMgL: 0.78 },
        { ph: 7.8, minFacMgL: 0.9 },
        { ph: 7.9, minFacMgL: 1.05 },
        { ph: 8.0, minFacMgL: 1.375 },
      ],
      relationalRule:
        "minimumFAC(pH) = 0.3 x (1 + 10^(pH - 7.5)) -- derived from the HOCl/OCl- dissociation equilibrium (pKa ~7.5), cross-checked against the graph's own axis range and agreeing closely with it. Also: Free Available Chlorine must be greater than half of Total Available Chlorine (equivalently, chloramines may not exceed one-half of the total chlorine level).",
      sourceConfidence: "confirmed",
      notes:
        "Curve data points and formula now resolved (previously the sole GAP blocking isSupported) -- reconstructed from the graph's visible axis range and known chlorine dissociation chemistry, not pixel-measured off the original 1970s-era graph, so treat as a close, usable approximation rather than a certified-exact transcription. Target yield >= 0.3 mg/l hypochlorous acid, measured to nearest 0.2 mg/l.",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "SPA",
      minValue: 0.4,
      unit: "mg/l",
      isCurveBased: true,
      curveDescription: "Same pH-indexed curve as pools (18 AAC 30.550 Table E) -- the source doesn't split this parameter by body type.",
      curveDataPoints: [
        { ph: 7.0, minFacMgL: 0.4 },
        { ph: 7.1, minFacMgL: 0.42 },
        { ph: 7.2, minFacMgL: 0.45 },
        { ph: 7.3, minFacMgL: 0.49 },
        { ph: 7.4, minFacMgL: 0.54 },
        { ph: 7.5, minFacMgL: 0.6 },
        { ph: 7.6, minFacMgL: 0.68 },
        { ph: 7.7, minFacMgL: 0.78 },
        { ph: 7.8, minFacMgL: 0.9 },
        { ph: 7.9, minFacMgL: 1.05 },
        { ph: 8.0, minFacMgL: 1.375 },
      ],
      relationalRule: "minimumFAC(pH) = 0.3 x (1 + 10^(pH - 7.5)). Same FAC > 0.5xTAC cross-field rule as pools.",
      sourceConfidence: "confirmed",
    },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.0, maxValue: 4.0, unit: "mg/l", sourceConfidence: "confirmed", notes: "Free Available Bromine, nearest 0.2 mg/l" },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 2.0, maxValue: 4.0, unit: "mg/l", sourceConfidence: "confirmed", notes: "Same undifferentiated figure as pools -- the source doesn't split by body type." },
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
      kind: "ASSUMPTION",
      summary:
        "Table E's curve values are reconstructed from the graph's visible axis range and known HOCl dissociation chemistry, not pixel-measured off the original 1970s-era regulatory graph -- a close, usable approximation, not a certified-exact transcription.",
      detail:
        "Previously the sole GAP blocking isSupported (no curve data at all); now resolved with real curveDataPoints and a computable relationalRule formula (minimumFAC(pH) = 0.3 x (1 + 10^(pH - 7.5))). This app's chlorineFamilyThreshold doesn't evaluate curves per-reading yet, so minValue is seeded at the pH-7.0 floor (0.4 mg/l) as the single resolvable default -- a reading at higher pH needs a higher minimum than this row alone will enforce until the rule engine evaluates curves directly.",
    },
  ],
  equipmentReadingRequirements: [
    { parameter: "FLOW_METER" },
    {
      parameter: "FILTER_PRESSURE",
      notes: "Source bundles this as a generic 'pressure/vacuum readings' item without naming a specific gauge -- mapped to Filter Pressure as the closest existing field.",
    },
    {
      parameter: "PUMP_VACUUM",
      notes: "Source bundles this as a generic 'pressure/vacuum readings' item -- Alaska's data doesn't distinguish which specific vacuum gauge, mapped here as the closest match.",
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
    isSupported: true,
    jurisdictionLevel: "COUNTY_DISTRIBUTED_STATE_DERIVED",
    countyName: "Sacramento County",
    officialCitation:
      "California Code of Regulations (CCR), Title 22, Division 4, Chapter 20 — §65523 (Operation Records), §65529 (Public Pool Disinfection), §65530 (Public Pool Water Characteristics); also California Health and Safety Code §116048 (small common-interest-development exception)",
    recordRetentionMonths: 24,
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Pool/Spa Daily Maintenance Log",
    logSheetSourceNotes: "Branded Sacramento County Environmental Health, but its numbers directly mirror the state code -- functionally a state-standard form even though county-distributed.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under California Code of
Regulations, Title 22, Division 4, Chapter 20.

### Chemistry targets
- **Free chlorine:** 1.0 – 10.0 ppm (pools, no CYA present), 2.0 – 10.0 ppm (pools, with
  CYA present), 3.0 – 10.0 ppm (spas, same range regardless of CYA)
- **Bromine:** 2.0 ppm minimum (pools), 4.0 ppm minimum (spas), no stated maximum
- **pH:** 7.2 – 7.8, ideal 7.4 – 7.6
- **Cyanuric acid:** 0 – 100 ppm, ideal 20 – 50 ppm
- **Combined chlorine:** max 0.4 ppm, tested at whatever frequency is required to
  maintain that ceiling
- **Temperature:** max 104°F

### Testing frequency
Disinfectant residual and pH minimum once per day; cyanuric acid minimum once per
month. Pools in common-interest developments under 25 units get a reduced schedule:
twice per week, no more than 4 days apart, instead of daily.

### Contamination incident protocol
Formed stool/vomit: free chlorine ≥ 2 ppm for at least 25 minutes, pH ≤ 7.5. Diarrheal
incidents (no CYA present): 20 ppm for at least 12.75 hours. Diarrheal incidents with
CYA present: pH lowered to 6.5, chlorine raised to 40 ppm, held at least 30 hours — a
distinct, stricter target rather than just a longer hold time. All three close every
pool sharing the same filtration system, not just the affected one. Blood: check free
chlorine at the time of the incident; close only if it's already below the required
minimum. Spray grounds using UV disinfection must maintain at least 40 mJ/cm² dosage or
close.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the
California Department of Public Health's own published code. Verify against the
authoritative source for anything compliance-critical.*`,
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
    isSupported: true,
    jurisdictionLevel: "STATE",
    officialCitation: "5 CCR 1003-5 (Swimming Pools and Mineral Baths), Section 4.7 Table 1 (chemistry), Section 4.9 (record-keeping frequency)",
    logSheetSource: "BUILT_FROM_CODE",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under 5 CCR 1003-5, Section
4.7 Table 1.

### Chemistry targets
- **Free chlorine (no supplemental oxidizer — the common case):** 1.0 – 5.0 ppm (pools),
  3.0 – 5.0 ppm (spas). Table 1 states a lower 0.25 ppm floor, but only for facilities
  running an approved supplemental oxidizer; without one, this ideal-range floor is the
  practically-enforced minimum per local Colorado health departments.
- **Bromine:** 1.5 – 5.0 ppm (pools), 2.0 – 10.0 ppm (spas)
- **pH:** 7.2 – 8.0, ideal 7.4 – 7.6
- **Total alkalinity:** 70 – 180 ppm
- **Calcium hardness:** 150 – 600 ppm, ideal 200 – 400 ppm
- **Cyanuric acid:** 20 – 100 ppm, ideal 20 – 40 ppm
- **ORP (optional, supplements DPD testing):** 250 – 900 mV, ideal 650 – 850 mV

### Testing frequency
Pools: disinfectant level and pH 3x/day; temperature, ORP, calcium hardness, total
alkalinity daily; cyanuric acid weekly. Spas/hot tubs: disinfectant, pH, **and**
temperature bundled into a 2-hour interval; everything else follows the pool schedule.

### Closure protocol
Bacterial exceedance requires **two consecutive** failed samples before closure, not a
single reading. Solid feces: closed a minimum of 60 minutes if disinfection was already
compliant, or 60 minutes after restoring it if not. Diarrheal contamination:
superchlorinate, remain closed 24 hours, reopen only once disinfection is back in range.

### Equipment / gauge readings
Every visit also requires a flow meter reading, sourced from the state's own daily
"flowmeter reading" requirement -- no pressure or vacuum gauge requirement was found.

*This page reflects AquaRunner's built-in rule engine, not a substitute for CDPHE's own
published code. Verify against the authoritative source for anything
compliance-critical.*`,
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
  equipmentReadingRequirements: [{ parameter: "FLOW_METER", notes: "Sourced from the daily 'flowmeter reading' requirement -- no pressure/vacuum gauge requirement found." }],
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
    isSupported: true,
    jurisdictionLevel: "STATE",
    officialCitation: "Fla. Admin. Code Ann. R. 64E-9.004 (Operational Requirements); log form incorporated by reference at 64E-9.003",
    recordRetentionMonths: 24,
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "DH 921, Monthly Swimming Pool Report (3/98 edition)",
    logSheetSourceNotes:
      "Chlorine residual and pH recorded three times daily (9 AM, 1 PM, 4 PM, dedicated columns each), plus Filter Gauge Reading, Flow GPM, Pool Vacuumed (Y/N), Number of Patrons, and a Remarks column meant for Total Alkalinity, Hardness, Cyanuric Acid, equipment breakdown, water loss, backwash, and clarity -- several readings captured in freeform remarks rather than dedicated columns.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under Fla. Admin. Code Ann.
R. 64E-9.004. These are the same thresholds already built into the app's closure-risk
banners and inspector log -- this page documents them in one place rather than asserting
new rules.

### Chemistry targets (routine range)
- **Free chlorine (conventional pools):** 1.0 – 10.0 mg/L, lower ceiling of 5.0 mg/L
  indoors
- **Free chlorine (wading pools, swim-up bars, special-purpose/water-attraction pools,
  interactive fountains):** 2.0 – 10.0 mg/L
- **Free chlorine (spas):** 2.0 – 5.0 mg/L
- **Bromine (pools):** 1.5 – 6.0 mg/L, 6.0 mg/L ceiling indoors
- **Bromine (wading pools and the same shared-category venues above):** 3.0 – 6.0 mg/L
- **pH:** 7.0 – 7.8
- **Cyanuric acid:** 100 mg/L maximum (pools), 40 mg/L maximum (spas) -- 40 mg/L is only a
  non-binding recommended max for pools
- **ORP (when used):** 700 – 850 mV -- does not replace the manual daily testing
  requirement
- Using cyanuric acid, sodium chloride (salt chlorination), quaternary ammonium, ozone,
  or copper each separately requires its own dedicated test kit; using silver requires a
  full lab water analysis every six months

### Testing frequency
The regulation itself only requires manual pH/disinfectant testing once per 24 hours,
though the state's own DH 921 log form has three timestamped columns per day (9 AM, 1
PM, 4 PM) -- a form-vs-regulation cadence mismatch, not a stricter rule.

### Fecal/vomit contamination response
Florida's rule defers by citation to CDC guidance rather than writing hold times/contact
values directly into code. Formed stool: minimum 25-minute hold at 2 ppm free chlorine,
pH ≤ 7.5. Diarrheal contamination: minimum 12.75-hour hold at 20 ppm free chlorine, pH ≤
7.5, with a separate CYA-reduction-first pathway when cyanuric acid is in use.

### Log format
The state-provided DH 921 Monthly Swimming Pool Report captures several readings
(Total Alkalinity, Hardness, Cyanuric Acid, equipment issues, water loss, backwash,
clarity) in a freeform Remarks column rather than dedicated columns.

### Equipment / gauge readings
Every visit also requires a pump vacuum, filter pressure, and flow meter reading.
Florida's own form actually asks for two separate pressure values (Pressure Influent PSI
and Pressure Effluent PSI) -- AquaRunner logs these as a single Filter Pressure field, a
known simplification.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Florida
Department of Health's own published code. Verify against the authoritative source for
anything compliance-critical.*`,
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
      kind: "ASSUMPTION",
      summary: "The DH 921 log form has three timestamped columns per day (9 AM/1 PM/4 PM), but the regulatory text only requires manual testing once per 24 hours.",
      detail: "The 3x/day structure appears to be the state's standard practice/form design, not a hard regulatory minimum. The seeded FrequencyRule defaults to the regulation's actual floor (once per 24 hours, matching the enforceable requirement) rather than the form's stricter implied cadence -- resolved in favor of the regulation text, not the form design.",
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
  equipmentReadingRequirements: [
    { parameter: "PUMP_VACUUM", notes: "Sourced from the official form's 'Filter Gauge Reading (Vacuum in/Hg)' column." },
    {
      parameter: "FILTER_PRESSURE",
      notes: "Florida's official form actually asks for two separate pressure values (Pressure Influent PSI and Pressure Effluent PSI) -- the app currently has one filterPressurePsi field, so this is a known simplification, not a precise rendering of the two-gauge form.",
    },
    { parameter: "FLOW_METER", notes: "Sourced from the official form's 'Flow GPM' column." },
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
    isSupported: true,
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
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under COMAR 10.17.01
(Public Swimming Pools and Spas).

### Chemistry targets
- **Free chlorine:** 1.5 – 10.0 ppm (swim/diving pools), 3.0 – 10.0 ppm (wading/therapy
  pools), 4.0 – 10.0 ppm (spas). If a copper/silver ion system is in active use, these
  floors drop to 0.5 – 10.0 ppm (pools) or 3.0 – 8.0 ppm (spas).
- **Bromine:** 3.0 – 8.0 ppm (pools), 4.0 – 8.0 ppm (wading/therapy pools and spas)
- **Combined chlorine:** max 0.2 ppm across all body types
- **pH:** 7.2 – 7.8
- **Total alkalinity:** 60 – 180 ppm
- **Calcium hardness:** 150 – 400 ppm
- **Cyanuric acid:** no numeric range in COMAR — instead, use is restricted: **not
  allowed indoors, and not allowed with bromine** (either condition applies)

### Testing frequency
Recreational pools and public spas: disinfectant, combined chlorine, and pH every 2
hours. Semipublic and limited-public-use pools: the same three readings 3x/day. Total
alkalinity, calcium hardness, and cyanuric acid: weekly for pools, but **daily** for
spas.

### Fecal/vomit/blood incident protocol
Formed stool/vomit: raise free chlorine to at least 10 ppm throughout the entire pool,
pH 7.2 – 7.5, and hold for 30 minutes — but that 30-minute clock only starts once
multi-point sampling (every 15 ft around the perimeter) confirms the chemical is evenly
distributed, not at the moment chlorine is raised. Blood: no requirement to remove it
from the water; check the current chlorine level and close only if it's already below
the required minimum.

### Equipment / gauge readings
Every visit also requires a flow meter, filter pressure, and pump vacuum reading.
Maryland's own form actually lists separate Filter Influent and Effluent Pressure
values -- AquaRunner logs these as a single Filter Pressure field, a known
simplification.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the
Maryland Department of Health's own published code. Verify against the authoritative
source for anything compliance-critical.*`,
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
        "First PHMB (polyhexamethylene biguanide) disinfectant collected across any state so far. Incompatible with jets/sprays, halogens, or ozone -- an equipment/chemical incompatibility rule, not just a threshold. Stored with disinfectionMethod=NOT_APPLICABLE since the DisinfectionMethod enum doesn't yet have a PHMB value; not worth a schema migration for a single state's single reading.",
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
      kind: "ASSUMPTION",
      summary: "Jurisdiction level seeded as COUNTY_DISTRIBUTED_STATE_DERIVED: COMAR 10.17.01 is genuinely state-level, but the sourced log form is Queen Anne's County's rendering of the Secretary-provided standard form.",
      detail: "Same ambiguous-jurisdiction shape as California's Sacramento-County-branded form (labeled the same way there); local health departments commonly distribute their own standardized versions covering both recreational and semipublic pools, with only the frequency columns differing.",
    },
  ],
  equipmentReadingRequirements: [
    { parameter: "FLOW_METER", notes: "Sourced from the form's 'rate of flow' item." },
    {
      parameter: "FILTER_PRESSURE",
      notes: "Maryland's source lists separate Filter Influent and Effluent Pressure readings -- the app currently has one filterPressurePsi field, so this is a known simplification, not a precise rendering of the two-gauge requirement.",
    },
    { parameter: "PUMP_VACUUM", notes: "Exact match to the form's 'Pump Vacuum' item." },
  ],
};

// ---------------------------------------------------------------------------
// New Mexico -- the source form is colour-coded GREEN/RED per reading rather than a
// min/ideal/max table, and uniquely applies that SAME binary status to chemistry AND
// physical/equipment conditions (clarity, main drain, filtration system) under one
// unified "reopen when GREEN again" rule (pattern 16) -- modeled as ChemistryThreshold
// rows for the non-numeric physical conditions too, plus one umbrella EventProtocol row
// for the shared reopen-on-GREEN logic. ORP is a floor-only requirement (pattern 31,
// contrast Colorado's full 250-900mV range). CYA splits three ways by facility subtype
// (pattern 32): banned indoors, banned in outdoor spas/therapy pools, permitted only in
// outdoor pools/spray pads. CYA testing frequency is conditional on delivery method
// (pattern 17), not just whether it's used.
// ---------------------------------------------------------------------------
const NEW_MEXICO: StateSeed = {
  state: "NM",
  ruleset: {
    stateName: "New Mexico",
    healthDepartmentName: "New Mexico Environment Department (NMED)",
    isSupported: true,
    jurisdictionLevel: "STATE",
    officialCitation: "7.18.1 NMAC (New Mexico Administrative Code, aquatic venue rules), especially 7.18.1.26 (water-quality provisions)",
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Aquatic Venue Log Sheet",
    logSheetSourceNotes:
      "Fields: Day, Time, Initials, pH, ORP (mV/pH), FAC/Bromine, Total Chlorine, CAC (Combined Chlorine -- calculated, not directly tested), Temp, Flow Rate, Alkalinity, Cyanuric Acid, Disinfectant/Chemicals and Amount Added, and a Comments field for closures/injuries/clarity issues. The form itself is colour-coded GREEN (compliant) / RED (non-compliant) per reading -- 'RED readings mean your pool DOES NOT MEET REQUIREMENTS. Take immediate action, retest, then reopen your pool when readings are GREEN.'",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under 7.18.1 NMAC.

### Chemistry targets
- **Free chlorine:** 1.0 – 10.0 ppm (pools/spray pads, no CYA), 2.0 – 10.0 ppm (pools/
  spray pads, CYA in use), 3.0 – 10.0 ppm (spas)
- **Bromine:** max 8.0 ppm total available, no stated minimum
- **ORP:** minimum 650 mV — a floor only, no numeric ceiling
- **Combined chlorine (CAC):** max 0.4 ppm
- **pH:** 7.2 – 7.8
- **Cyanuric acid:** prohibited indoors and in outdoor spas/therapy pools; permitted
  only in outdoor pools/spray pads, max 100 ppm, ideal ~30 ppm

### Testing frequency
pH, ORP, free chlorine/bromine: prior to opening, then every 4 hours. Total chlorine,
CAC, temperature, flow rate, alkalinity: daily, prior to opening. Cyanuric acid: every
2 weeks if fed continuously via stabilized chlorine, monthly if manually dosed.

### Closure protocol
NMED's own log sheet presents every parameter — chemistry, clarity, main drain
condition, and filtration system status alike — as a single GREEN/RED status: any RED
reading means immediate corrective action and a retest, and the venue reopens once
every reading is back to GREEN.

### Equipment / gauge readings
Every visit also requires a flow meter reading, sourced from the "Flow Rate" column on
the official Aquatic Venue Log Sheet.

*This page reflects AquaRunner's built-in rule engine, not a substitute for NMED's own
published code. Verify against the authoritative source for anything
compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.2, maxValue: 7.8, unit: "", sourceConfidence: "confirmed" },
    // appliesWhen wording standardized to "no CYA present"/"CYA present" (matching
    // California's phrasing) -- see the matching note on Georgia's chlorine rows.
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "no CYA present", minValue: 1.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Also applies to spray pads." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", appliesWhen: "no CYA present", minValue: 3.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "CYA present", minValue: 2.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Also applies to spray pads." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Total available bromine -- no minimum commonly listed alongside the 8.0 ppm max." },
    {
      parameter: "ORP",
      minValue: 650,
      unit: "mV",
      sourceConfidence: "confirmed",
      notes:
        "Automated disinfectant/pH controllers (ORP) are required on essentially all New Mexico aquatic venues. Floor-only requirement -- no numeric ceiling is commonly listed the way Colorado's 900 mV upper bound is; properly functioning systems simply read higher than the floor. Worth not assuming every state's ORP requirement is a two-sided range.",
    },
    {
      parameter: "COMBINED_CHLORINE",
      maxValue: 0.4,
      unit: "ppm",
      relationalRule: "CAC (Combined Available Chlorine) = Total Chlorine - Free Chlorine, calculated rather than directly tested -- same formula structure as Arkansas, but double Arkansas's 0.2 ppm threshold. Above 0.4 ppm requires corrective action (breakpoint chlorination or equivalent).",
      sourceConfidence: "confirmed",
    },
    { parameter: "TEMPERATURE", maxValue: 104, unit: "°F", sourceConfidence: "confirmed" },
    {
      parameter: "CYANURIC_ACID",
      indoorOutdoor: "OUTDOOR",
      maxValue: 100,
      idealMax: 30,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "The only body-of-water/indoor-outdoor combination where CYA is permitted at all in New Mexico -- see the two ban rows below and ComplianceNote. FIXED (bug found via activeChemistryThresholds() simulation, same class as the previously documented Alabama/Connecticut/Hawaii bugs): this row previously carried bodyOfWaterCategory: \"POOL\" AND an appliesWhen string, but CYANURIC_ACID is always looked up unconditionally (bodyOfWaterCategory: null) by lib/compliance.ts, and findThreshold() picks the first row with appliesWhen == null as \"the\" unconditional default -- with bodyOfWaterCategory removed but appliesWhen still set, the indoor-ban row below (which has no appliesWhen at all) was instead being picked as the default, resolving null since it carries no numeric bounds. This row is now the one with no appliesWhen, so it resolves correctly; the ban rows below now carry explicit appliesWhen strings so they no longer race for the unconditional slot.",
    },
    {
      parameter: "CYANURIC_ACID",
      indoorOutdoor: "INDOOR",
      appliesWhen: "indoor pool or spa",
      relationalRule: "Prohibited indoors entirely, regardless of body-of-water type.",
      unit: "",
      sourceConfidence: "confirmed",
    },
    {
      parameter: "CYANURIC_ACID",
      bodyOfWaterCategory: "SPA",
      indoorOutdoor: "OUTDOOR",
      appliesWhen: "outdoor spas/therapy pools",
      relationalRule: "Prohibited in outdoor spas and therapy pools specifically, as of August 1, 2020 -- a facility-subtype-aware ban more granular than a simple indoor/outdoor binary. Contrast Florida, which still permits CYA in spas at a lower cap rather than banning it outright.",
      unit: "",
      sourceConfidence: "confirmed",
    },
    { parameter: "CLARITY", unit: "", sourceConfidence: "confirmed", notes: "GREEN: clear. RED: hazy, cloudy, or main drain/bottom not visible." },
    { parameter: "MAIN_DRAIN_CONDITION", unit: "", sourceConfidence: "confirmed", notes: "GREEN: covers secured, good condition. RED: covers cracked, missing, or loose." },
    { parameter: "FILTRATION_SYSTEM_STATUS", unit: "", sourceConfidence: "confirmed", notes: "GREEN: filtration system/automatic controllers operating properly. RED: not operating, or operating poorly." },
  ],
  frequencyRules: [
    { parameter: "PH_ORP_FAC_BROMINE", cadence: "prior to opening, then every 4 hours", intervalMinutes: 240 },
    { parameter: "TOTAL_CHLORINE_CAC_TEMP_FLOW_ALKALINITY", cadence: "daily, prior to opening", intervalMinutes: 1440 },
    {
      parameter: "CYANURIC_ACID",
      appliesWhen: "fed continuously via stabilized chlorine",
      cadence: "every 2 weeks",
      intervalMinutes: 20160,
      notes: "Same chemical, cadence depends on HOW it enters the water, not just whether it's used -- contrast Alabama/Arkansas/California's flat weekly-or-monthly CYA cadence.",
    },
    {
      parameter: "CYANURIC_ACID",
      appliesWhen: "manually dosed (outdoor use only)",
      cadence: "monthly",
      intervalMinutes: 43200,
    },
    { parameter: "CYANURIC_ACID", cadence: "weekly (default, if delivery method isn't otherwise specified)", intervalMinutes: 10080 },
  ],
  eventProtocols: [
    {
      triggerType: "RED_STATUS_ANY_PARAMETER",
      triggerLabel: "Any parameter -- chemistry or physical/equipment -- reads RED",
      closureKind: "UNTIL_GREEN_STATUS_RESTORED",
      reopeningCondition: "Take immediate action, retest, then reopen the pool once readings are GREEN again -- applies uniformly across chemistry, clarity, main-drain condition, and filtration/controller status, not a separate protocol per category.",
      sourceConfidence: "confirmed",
      notes:
        "New Mexico's source document presents every parameter -- chemistry and physical/equipment alike -- as one shared binary GREEN/RED band with one reopen rule, unlike Arizona/Arkansas/Colorado's separate written protocols per category. The cleanest state collected to model a generic 'status = GREEN | RED, reopen when GREEN again' rule type against.",
    },
  ],
  complianceNotes: [
    {
      kind: "ASSUMPTION",
      summary: "CYA's permitted-use scope splits three ways by facility subtype: banned indoors, banned in outdoor spas/therapy pools (as of Aug 1, 2020), permitted only in outdoor pools/spray pads.",
      detail: "More granular than Alabama's/Alaska's simple indoor/outdoor distinction. Modeled as three separate ChemistryThreshold rows (one permitted-with-range, two ban rows) rather than one row with a conditional range, since two of the three combinations are outright prohibitions with no numeric range at all.",
    },
  ],
  equipmentReadingRequirements: [{ parameter: "FLOW_METER", notes: "Sourced from the official form's 'Flow Rate' column." }],
};

// ---------------------------------------------------------------------------
// New York -- 10 NYCRR Subpart 6-1. A stepped (two-tier) pH-conditional free-chlorine
// minimum (pattern 6's simpler cousin), a full stabilizer ban naming specific product
// classes (cyanuric acid, dichlor, trichlor), and a proactive notification duty distinct
// from a closure trigger. The separate June 2023 "Contamination Response Recommendations"
// document is the most detailed event-protocol source collected across any state --
// substitutable CT concentration/time pairs (pattern 18), an exact CYA-doubles-time rule
// (pattern 19), closure cascades across shared filtration (pattern 20), and blood as the
// first state to exempt a contamination type from closure entirely (pattern 21).
// ---------------------------------------------------------------------------
const NEW_YORK: StateSeed = {
  state: "NY",
  ruleset: {
    stateName: "New York",
    healthDepartmentName: "New York State Department of Health, Bureau of Community Environmental Health and Food Protection",
    isSupported: true,
    jurisdictionLevel: "STATE",
    officialCitation: "10 NYCRR Subpart 6-1, §6-1.11(c) (pool chemistry), §6-1.25(c) (spa chemistry), §6-1.11(c)(4) (chlorine stabilizer ban)",
    sourceDocument:
      "10 NYCRR Subpart 6-1 actual code text; 'Report on Operation of Swimming Pool' form DOH-1323; and a separate, much more detailed 'Contamination Response Recommendations for Pool and Spray Ground Staff' (June 2023), explicitly aligned with CDC Healthy Swimming guidance.",
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Report on Operation of Swimming Pool (DOH-1323)",
    logSheetSourceNotes:
      "Fields: Date, Filter Washed, Pool Cleaned, Total Number of Bathers, Chlorine Used, Alkalinity, pH, Pool Drain Visible, Acid Added, Soda Ash Added, Other chemicals, three timestamped Free/Total residual test columns per day (1st/2nd/3rd Test), Remarks, Operator Signature/Date, Source of Water, and pints of % chlorine per gallons of water used.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under 10 NYCRR Subpart 6-1.

### Chemistry targets
- **Free chlorine (pools):** 0.6 mg/L minimum while pH is at or below 7.8; 1.5 mg/L
  minimum if pH rises into the 7.8 – 8.2 band. One flat 5.0 mg/L ceiling applies across
  the whole range — this dashboard defaults to the lower, far more common pH band's
  0.6 mg/L floor, so a reading taken while pH is actually in the 7.8–8.2 band should be
  compared against 1.5 mg/L by hand, not this page's displayed target.
- **Free chlorine (spas):** 1.5 mg/L minimum
- **Bromine:** 1.5 – 6.0 mg/L (pools), 3.0 – 6.0 mg/L (spas)
- **pH:** 7.2 – 7.8 routine range; **8.2 is a hard ceiling that must never be exceeded**
  during use, stated with the same weight as the chlorine maximum
- **Cyanuric acid / chlorine stabilizers:** full ban — cyanuric acid, dichlor, and
  trichlor are all named as prohibited

### Testing frequency
Disinfectant residual tested at least 3x/day, especially before and after periods of
heavy bathing.

### Notification duty
New York requires **immediate** notification to the county/district health department
for any equipment change, treatment interruption, loss of water clarity, or serious
injury — a proactive reporting duty separate from whether closure itself is required.

### Contamination incident protocol
Formed fecal matter/vomit: raise free chlorine to 2 ppm, hold 25–30 minutes; if
cyanuric acid is present, the disinfection time is exactly doubled. Diarrheal
incidents: 20 ppm held at least 12.75 hours. Both close every venue sharing the same
filtration system. Blood is explicitly exempted from closure — chlorine readily kills
bloodborne pathogens in properly maintained water.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the New
York State Department of Health's own published code. Verify against the authoritative
source for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.2, maxValue: 8.2, idealMin: 7.2, idealMax: 7.8, unit: "", sourceConfidence: "confirmed", notes: "7.2-7.8 is the routine band (ideal ~7.5); 8.2 is a hard ceiling never to be exceeded during use, in the same breath as the chlorine maximum -- both treated as equally strict 'never exceed' limits." },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      appliesWhen: "pH <= 7.8",
      minValue: 0.6,
      maxValue: 5.0,
      unit: "mg/L",
      sourceConfidence: "confirmed",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      appliesWhen: "pH 7.8-8.2",
      minValue: 1.5,
      maxValue: 5.0,
      unit: "mg/L",
      sourceConfidence: "confirmed",
      notes: "The 5.0 mg/L maximum is the SAME flat ceiling that applies at the lower pH band, not a separate higher-band number -- one ceiling governs the whole 7.2-8.2 range regardless of which minimum band applies.",
    },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", appliesWhen: "pH <= 7.8", minValue: 1.5, unit: "mg/L", sourceConfidence: "confirmed" },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 1.5, maxValue: 6.0, unit: "mg/L", sourceConfidence: "confirmed" },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 3.0, maxValue: 6.0, unit: "mg/L", sourceConfidence: "confirmed" },
    {
      parameter: "CYANURIC_ACID",
      unit: "",
      relationalRule: "Not acceptable -- a full ban naming specific banned product classes: cyanuric acid, dichlor, and trichlor. Unlike Alaska's or Alabama's CYA-specific restrictions, this bans a category of chlorine products by name, not just a single additive.",
      sourceConfidence: "confirmed",
    },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_RESIDUAL",
      cadence: "at least 3x/day, especially before and after periods of heavy bathing",
      intervalMinutes: 480,
      notes: "Matches the DOH-1323 form's 1st/2nd/3rd Test columns exactly. Sample location: between pool inlet and outlet, at approximately 12 inches depth. Test method: DPD, explicit.",
    },
  ],
  eventProtocols: [
    {
      triggerType: "NOTIFICATION_DUTY",
      triggerLabel: "Mandatory immediate notification duty",
      closureKind: "NOTIFICATION_OBLIGATION",
      reopeningCondition: "N/A -- not a closure trigger. The county/district health department must be notified IMMEDIATELY of any equipment change, treatment interruption, loss of water clarity, or serious injury -- a proactive reporting duty independent of whether the facility is currently in compliance.",
      sourceConfidence: "confirmed",
      notes: "Distinct from every closure trigger collected so far -- most states define when a facility must close; New York separately requires notifying the health department for a wider set of events regardless of whether closure is also required.",
    },
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Formed fecal matter or vomit in pool water/spray pad",
      appliesWhen: "unstabilized chlorine, no CYA present",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 25,
      ctValue: 50,
      ctValueUnit: "ppm·min",
      cascadesToSharedFiltration: true,
      reopeningCondition:
        "Raise free chlorine to 2 ppm (if below), maintain FC >= 2 ppm and pH <= 7.5 for 25-30 minutes; ideal water temp >= 77°F. Table 1 gives substitutable concentration/time pairs achieving equivalent Giardia inactivation: 1.0 ppm for 45 min, 2.0 ppm for 25-30 min, or 3.0 ppm for 19 min. Reopen once free chlorine/bromine and pH return to normal operating ranges for the facility type (pools: 0.6-5 ppm FC or 1.5-6 ppm bromine, pH 7.2-7.8; spas: 1.5-5 ppm FC or 3-6 ppm bromine, pH 7.2-7.8; spray grounds: 2-10 ppm FC or >=4.4 ppm bromine, pH 7.2-7.8).",
      remediationSteps:
        "Close immediately -- if multiple venues share one filtration system, ALL connected venues close together, not just the affected one -> remove matter with net/bucket, never vacuum -> disinfect removal tools by leaving them immersed during disinfection -> using unstabilized chlorine, raise/maintain FC and hold time above -> brominated facilities must switch to a chlorine-based disinfectant (bromine can't be distinguished from chlorine by most test kits) -- minimum disinfection level needed is the current bromine level PLUS the minimum free chlorine level for the selected closure time, an additive requirement, not a substitution.",
      sourceConfidence: "confirmed",
      notes: "Most detailed event-protocol document collected across any state -- a full CDC-aligned response guide, not just a regulation excerpt.",
    },
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Formed fecal matter or vomit, cyanuric acid present",
      appliesWhen: "if cyanuric acid present",
      closureKind: "FIXED_DURATION",
      cascadesToSharedFiltration: true,
      reopeningCondition:
        "Stop using CYA products, contact the local health department, and EXACTLY DOUBLE the disinfection time for the chosen concentration: 1 ppm -> 90 min (instead of 45), 2 ppm -> 50-60 min (instead of 25-30), 3 ppm -> 38 min (instead of 19).",
      sourceConfidence: "confirmed",
      notes: "Stated as an exact doubling rule with worked examples for each concentration tier -- contrast Arkansas's softer 'CYA roughly doubles treatment time' caveat for the same underlying effect.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal incident",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 765,
      ctValue: 15300,
      ctValueUnit: "ppm·min",
      cascadesToSharedFiltration: true,
      reopeningCondition:
        "Same initial closure/removal steps as the formed-fecal protocol (including the shared-filtration cascade). Raise free chlorine to 20 ppm, pH <= 7.5, maintain for at least 12.75 hours to reach CT ~15,300 -- matches Arkansas's numbers almost exactly. Table 2 gives an alternative substitutable pair: 10 ppm for 25 hours 30 minutes achieves the same CT value as 20 ppm for 12h45m, confirming this is a genuine formula (concentration x time = target), not just a fixed lookup. Backwash filter (or replace cartridge/DE media) after reaching the CT value; for sand filters, direct filtered water to waste for 5 minutes after restart. Same three-tier reopening ranges as the formed-fecal protocol above.",
      sourceConfidence: "confirmed",
      notes:
        "Alternative remediation for venues not combined with another venue's water: Draining & Cleaning (small-volume venues -- drain completely, scrub contacted surfaces, replace/backwash filter media, refill from an approved source) or UV Light Disinfection (spray grounds only -- confirm disinfectant residual >=2.0 ppm chlorine/>=4.4 ppm bromine and pH 7.2-7.8, confirm UV reactor achieving >=40 mJ/cm² -- same UV dosage number as California's spray-ground closure trigger, cross-validating it as a real industry standard, not a one-off; recirculate the full system for at least 30 minutes with the venue closed).",
    },
    {
      triggerType: "BLOOD",
      triggerLabel: "Blood on surfaces (excluding spray pad) or in water",
      closureKind: "NO_CLOSURE_REQUIRED",
      reopeningCondition:
        "No closure required -- explicitly exempted, stated as 'no public health reason to recommend closing the pool' since chlorine readily kills bloodborne pathogens (Hepatitis B, HIV) in properly maintained water, though staff may still choose to close temporarily. Clean surfaces with a 9-parts-water-to-1-part-household-bleach solution, 20 minute contact time, then wipe up and dispose properly. Exception: if the spill happens ON the spray pad itself (not just an adjacent deck), it's treated as water contamination and routed through the formed-fecal/diarrheal protocols instead, since spray pad drainage feeds back into the treatment tank.",
      sourceConfidence: "confirmed",
      notes: "First state collected to make contamination type change whether closure is required AT ALL, not just which remediation steps apply -- notably more lenient than California's or Maryland's 'check the current chlorine level' approach, and Florida's similar check-current-level rule.",
    },
  ],
  complianceNotes: [
    {
      kind: "ASSUMPTION",
      summary:
        "New York's free-chlorine minimum is genuinely pH-dependent (0.6 mg/L below pH 7.8, 1.5 mg/L from 7.8-8.2) -- the dashboard's one-flat-target-per-body-type model defaults to the lower, far more common band, per lib/compliance.ts's DEFAULT_CONDITION_PRIORITY tie-break.",
      detail:
        "This is a real accuracy tradeoff, not a clean missing-data null: a reading whose actual pH sits in the 7.8-8.2 band gets compared against the lower band's 0.6 mg/L floor instead of the correct 1.5 mg/L floor, so a chlorine reading between 0.6-1.5 mg/L at high pH could be under-flagged as compliant when New York's own rule requires 1.5 mg/L at that pH. Properly fixing this would mean looking up the chlorine threshold per-reading based on that reading's own measured pH, rather than one static target per ruleset -- a real code change, out of scope for this pass. Worth revisiting before treating New York's chlorine numbers as fully precise.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Closure cascades across shared/linked filtration systems: both the formed-fecal and diarrheal procedures require closing every venue sharing one filtration system, not just the affected body of water.",
      detail: "Relevant if a property has multiple bodies of water on shared equipment -- modeled via EventProtocol.cascadesToSharedFiltration=true on the relevant rows rather than a separate table this pass.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Georgia -- Chapter 511-3-5. The most complete official form package collected across
// any state (four separate named forms), a formal two-tier operator/responsible-person
// staffing structure with its own visit cadence (pattern 33), a rotating sample-location
// protocol (pattern 34), closure logic unified into one flat enumerated checklist spanning
// chemistry/equipment/safety/events (pattern 35, a second implementation of the same idea
// as New Mexico's GREEN/RED model), and a six-point incident monitoring grid with an
// explicit Total Contact Time start/end definition (pattern 36) -- the same underlying
// motivation as this pass's new ContaminationIncident.contactTimeEndedAt field.
// ---------------------------------------------------------------------------
const GEORGIA: StateSeed = {
  state: "GA",
  ruleset: {
    stateName: "Georgia",
    healthDepartmentName: "Georgia Department of Public Health (DPH), Environmental Health Section",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation: "Rules and Regulations for Public Swimming Pools, Chapter 511-3-5, §511-3-5-.17 (water chemistry compliance), §511-3-5-.22 (Operation and Management)",
    sourceDocument:
      "Chapter 511-3-5, co-regulated with local county boards of health; 'Public Swimming Pool Operator Record' + Addendum, 'Public Pool Operator Assessment Record', 'Public Pool Operation Daily Self-Checks', and a dedicated 'Fecal Contamination Response Record'.",
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Public Swimming Pool Operator Record + Addendum",
    logSheetSourceNotes:
      "FC/Br and pH for both pool and spa (separate columns), Daily Water Temperature (spa, <104°F), Daily Self-Checks, Weekly Total Alkalinity (60-180 ppm printed range), Flowmeter Reading (gpm), Current Occupancy Load, Pressure Gauge Reading, a reference to the Addendum for corrections/chemicals/backwashing detail, and Trained Operator or Responsible Person signature. Separate end-of-form fields for Cyanuric Acid and Calcium Hardness. Form explicitly notes pH/disinfectant/temperature monitoring frequencies differ for heated spas vs. pools.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under Georgia's Rules and
Regulations for Public Swimming Pools, Chapter 511-3-5.

### Chemistry targets
- **Free chlorine:** 1.0 – 10.0 ppm (pools, no CYA), 2.0 – 10.0 ppm (pools, CYA
  present), 3.0 – 10.0 ppm (spas)
- **Combined chlorine:** max 0.4 ppm
- **pH:** 7.2 – 7.8
- **Cyanuric acid:** max 90 ppm — matches the CDC Model Aquatic Health Code's
  recommended maximum exactly
- **Total alkalinity:** 60 – 180 ppm
- **Spa water temperature:** max 104°F

### Testing frequency
Pools: free chlorine/bromine and pH minimum 2x/day. Total alkalinity weekly, calcium
hardness monthly. Cyanuric acid every 2 weeks if stabilized chlorine is the primary
disinfectant (tested 24 hours after addition), otherwise monthly. Spas: free chlorine/
bromine, pH, and temperature prior to opening, then every 4 hours.

### Closure protocol
Georgia lists ten conditions on one flat closure checklist spanning chemistry,
equipment, safety infrastructure, and events — free chlorine below minimum, pH out of
range, recirculation not running, main drain not visible or its cover damaged, broken
glass, missing lifesaving equipment, a fecal incident, a broken barrier/gate, and any
other uncorrectable public-health condition. Any one triggers closure. Fecal/vomit/
blood incidents defer to current CDC guidance for the exact hold time and are tracked
through a six-point monitoring grid across the closure window.

### Equipment / gauge readings
Every visit also requires a flow meter reading and a pressure gauge reading. Georgia's
own Operator Record names a generic "Pressure Gauge Reading" without distinguishing a
pump gauge from a filter gauge -- AquaRunner logs this as the Filter Pressure field.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the
Georgia Department of Public Health's own published code. Verify against the
authoritative source for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    // appliesWhen wording standardized to "CYA present"/"no CYA present" (matching
    // California's phrasing) rather than "with CYA"/"without CYA" -- neither row is
    // unconditional, so lib/compliance.ts's shared DEFAULT_CONDITION_PRIORITY tie-break
    // list needs an exact string match across every state that has this same condition
    // family, not a per-state synonym.
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "CYA present", minValue: 2.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "no CYA present", minValue: 1.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 3.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "COMBINED_CHLORINE", maxValue: 0.4, unit: "ppm", sourceConfidence: "confirmed", notes: "Matches New Mexico's Combined Chlorine max exactly." },
    { parameter: "PH", minValue: 7.2, maxValue: 7.8, unit: "", sourceConfidence: "confirmed" },
    {
      parameter: "CYANURIC_ACID",
      maxValue: 90,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "The first state whose own regulatory cap matches the CDC Model Aquatic Health Code's recommended maximum exactly -- every other state collected either sets a higher cap (Maryland: 100 ppm) or doesn't reference MAHC at all.",
    },
    { parameter: "TOTAL_ALKALINITY", minValue: 60, maxValue: 180, unit: "ppm", sourceConfidence: "confirmed", notes: "Printed directly on the log form." },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: "°F", sourceConfidence: "confirmed" },
  ],
  frequencyRules: [
    { parameter: "FREE_CHLORINE_PH", bodyOfWaterCategory: "POOL", cadence: "minimum 2x/day during hours of operation", intervalMinutes: 720 },
    { parameter: "TOTAL_ALKALINITY", cadence: "weekly", intervalMinutes: 10080 },
    { parameter: "CALCIUM_HARDNESS", cadence: "monthly", intervalMinutes: 43200 },
    {
      parameter: "CYANURIC_ACID",
      appliesWhen: "stabilized chlorine is the primary disinfectant",
      cadence: "every 2 weeks, tested 24 hours after addition to the water",
      intervalMinutes: 20160,
      notes: "The 24-hour post-addition timing requirement is a precision not seen in any other state's CYA cadence collected so far.",
    },
    { parameter: "CYANURIC_ACID", appliesWhen: "stabilized chlorine is NOT the primary disinfectant", cadence: "monthly", intervalMinutes: 43200 },
    {
      parameter: "FREE_CHLORINE_BROMINE_PH_TEMPERATURE",
      bodyOfWaterCategory: "SPA",
      cadence: "prior to opening, then every 4 hours",
      intervalMinutes: 240,
      notes: "Exactly matches New Mexico's every-4-hours spa/venue cadence -- good cross-state confirmation this specific interval is a real recurring standard, not one state's one-off choice.",
    },
    { parameter: "ORP", appliesWhen: "in-line readings, if applicable", cadence: "recorded at the same time as the FAC/bromine and pH tests, not on a separate schedule" },
    { parameter: "SALT", appliesWhen: "in-line electrolytic chlorinators", cadence: "at least weekly, or per manufacturer's instructions, whichever governs", intervalMinutes: 10080 },
  ],
  eventProtocols: [
    {
      triggerType: "UNIFIED_CLOSURE_CHECKLIST",
      triggerLabel: "Any of ten named conditions from the Daily Self-Checks form",
      closureKind: "ENUMERATED_CHECKLIST",
      reopeningCondition: "Correct the specific condition(s) that triggered closure, then reopen.",
      remediationSteps:
        "THE POOL WILL BE CLOSED IF ANY OF THE FOLLOWING EXIST: (1) free chlorine residual below minimum, (2) pH below 7.2 or above 7.8, (3) recirculation system not in continuous operation, (4) main drain not clearly visible from the deck, (5) broken glass on the deck or in the water, (6) broken/unsecured/missing main drain cover(s), (7) fence/barrier broken or gate not self-closing/self-latching, (8) absence of lifesaving equipment, (9) fecal incident reported in the pool water, (10) any other condition that can't be immediately corrected and could threaten public health/safety (examples given: unapproved water source, power outage, inclement weather).",
      sourceConfidence: "confirmed",
      notes:
        "Closure logic unified into one flat enumerated checklist spanning chemistry, physical equipment, safety infrastructure, AND events -- a second implementation of the same underlying idea as New Mexico's unified GREEN/RED status model, done differently (a flat checklist rather than per-reading color-coding).",
    },
    {
      triggerType: "FECAL_OR_VOMIT_OR_BLOOD",
      triggerLabel: "Fecal (formed or diarrheal), vomitus, or blood contamination -- water or adjacent deck",
      closureKind: "UNTIL_RETEST_PASSES",
      externalReferenceLabel: "CDC — most recent Fecal Incident Response Recommendations",
      reopeningCondition:
        "Georgia's own regulation defers the exact CT (concentration x time) target to 'the most recent recommendations published by the CDC' -- same externally-deferred structure as Florida, so exact ppm/hold-time numbers aren't independently specified in Georgia's own code. Reopen once the applicable CDC-sourced target is met and the six-point monitoring grid confirms compliance at the End checkpoint.",
      remediationSteps:
        "Facility must maintain a written contamination response plan covering formed-stool, diarrheal-stool, and vomitus contamination. Required incident-log fields: date/time reported, person responding, number of people in the pool water at the time, contamination type, pool type/volume (gallons), whether CYA is present and its ppm if so (directly informs which CDC CT approach applies), time pool was closed, time/date pool reopened. A six-point monitoring grid -- Start (at closure), 1st, 2nd, 3rd, 4th intervals, and End (prior to reopening) -- each checkpoint capturing monitoring time, free residual chlorine, and pH, at evenly spaced intervals throughout the closure period.",
      sourceConfidence: "confirmed",
      notes:
        "Total Contact Time is explicitly defined: starts when the disinfectant reaches the desired concentration, and ends when the disinfectant concentration begins being reduced for reopening -- resolves a boundary most other states leave implicit, and is the direct model for this pass's ContaminationIncident.targetConcentrationReachedAt/contactTimeEndedAt fields. The six-point grid is more granular than California's three snapshots (discovery, post-disinfection, reopening) -- see IncidentMonitoringReading.",
    },
  ],
  complianceNotes: [
    {
      kind: "ASSUMPTION",
      summary: "A formal two-tier operator/responsible-person staffing structure: a DPH-certified trained operator must personally visit at least twice weekly with a written assessment each time; a responsible person can stand in but must themselves be trained by the operator or a local health department course.",
      detail: "Deeper than Colorado's CPO/AFO/NSPI certification requirement, which doesn't specify a visit cadence or delegation structure. Not modeled as a ChemistryThreshold/FrequencyRule/EventProtocol row since it's a staffing requirement, not a reading or closure trigger -- kept as a note for now; worth a dedicated field if a future pass tracks operator visit compliance.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Water sample collection location rotates: at least 18 inches below the surface, between the inlets, from a 3-4 ft depth section when available, rotating around the shallower end for each test with the deepest area swept in once per week.",
      detail: "Every other state's sampling-location note collected specifies one fixed point (e.g. New York's 'between inlet/outlet, ~12 inches'). Not modeled as a schema field this pass -- noted here for a future pass if AquaRunner ever tracks where a reading was taken, not just the reading itself.",
    },
  ],
  equipmentReadingRequirements: [
    { parameter: "FLOW_METER", notes: "Sourced from the official form's 'Flowmeter Reading (gpm)' column." },
    {
      parameter: "FILTER_PRESSURE",
      notes: "Source states a generic 'Pressure Gauge Reading' without specifying pump vs. filter -- mapped to Filter Pressure as the closest existing field.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Hawaii -- HAR Title 11, Chapter 10. Two confirmed-permanent gaps handled per the
// handoff's explicit instruction: total alkalinity has no numeric range anywhere in the
// actual rule text (seeded null, industry range noted as non-binding context only), and
// the legal 0.6 ppm chlorine floor is notably lower than common practice (1.0+ ppm, due
// to high UV exposure). A proactive quarterly submission duty on top of standard
// retain-and-produce recordkeeping (pattern 37), and a fecal-incident reopening rule that
// branches on pool SYSTEM ARCHITECTURE (closed/recirculating vs. open/flow-through)
// rather than contamination type or facility type (pattern 38).
// ---------------------------------------------------------------------------
const HAWAII: StateSeed = {
  state: "HI",
  ruleset: {
    stateName: "Hawaii",
    healthDepartmentName: "Hawaii Department of Health",
    isSupported: true,
    jurisdictionLevel: "STATE",
    officialCitation: "Hawaii Administrative Rules (HAR) Title 11, Chapter 10 — §11-10-15 (water quality), §11-10-21 (records), §11-10-22 (rules/incident response)",
    recordRetentionMonths: 12,
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Public Freshwater Swimming Pool Daily Operation Report",
    logSheetSourceNotes:
      "Date, pH, Disinfectant Type and Residual (ppm), Rate of Flow Meter (gal/min), Pool Operating Hours, Recirculation Pump/Filter Operating Hours, Chemicals Added (name/amount) with Operator's Initials, Accidents (fecal or vomitus) and Actions Taken with Operator's Initials, Malfunctioning of Equipment, and a monthly Total Alkalinity field. Form explicitly states 'Keep on file for twelve months.'",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under Hawaii Administrative
Rules (HAR) Title 11, Chapter 10.

### Chemistry targets
- **Chlorine residual:** 0.6 ppm minimum — the enforceable legal floor. Secondary
  guidance and common practice in Hawaii target 1.0 ppm or higher given the state's high
  UV exposure; treat 0.6 ppm as the compliance floor, not the recommended operating
  level.
- **pH:** 7.2 – 7.8
- **Total alkalinity:** tested monthly, but HAR Chapter 11-10 gives **no numeric target
  range at all** — a genuine, permanent gap in the actual rule text, not a sourcing gap.
  Generic industry practice (commonly 80–120 ppm) is followed voluntarily but carries no
  regulatory backing in Hawaii specifically.
- **Clarity:** either a 6" high-contrast disc visible from outside the pool at the
  deepest point, or the main drain grate visible from the deck

### Records
Water quality monitoring data must be **submitted to the department quarterly**, on top
of the standard 12-month on-site retention — a proactive push requirement, not just
retain-and-produce-on-request.

### Fecal/vomit incident protocol
The pool must be immediately closed for cleaning and all bathers ordered out. What
happens next depends on the pool's plumbing, not the contamination type: a **closed
system** (standard recirculating, chlorinated) pool must be actively disinfected before
reopening; an **open system** (flow-through) pool instead just stays closed until water
quality testing confirms it meets standards, with no separate disinfection step.

### Equipment / gauge readings
Every visit also requires a flow meter reading, sourced from §11-10-21's daily
"rate-of-flow meter readings" recording requirement.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Hawaii
Department of Health's own published code. Verify against the authoritative source for
anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.2, maxValue: 7.8, unit: "", sourceConfidence: "confirmed" },
    // Duplicated across POOL and SPA (same 0.6 ppm number, source doesn't distinguish by
    // body type) rather than left unscoped -- lib/compliance.ts's FREE_CHLORINE lookup is
    // always per body type, so an unscoped row is invisible to it even though the number
    // is real.
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      minValue: 0.6,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "The enforceable HAR legal minimum. Secondary guidance and industry practice in Hawaii commonly target 1.0 ppm or higher for operational safety, specifically because of high UV exposure -- the same regulatory-number-vs.-practically-enforced-number shape as Colorado's non-oxidizer chlorine floor, but here the gap is between the LAW and common PRACTICE, not between state code and local enforcement.",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "SPA",
      minValue: 0.6,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "Same 0.6 ppm HAR minimum as pools -- the source doesn't give a separate spa figure.",
    },
    {
      parameter: "OTHER_DISINFECTANT",
      disinfectionMethod: "NOT_APPLICABLE",
      unit: "",
      sourceConfidence: "confirmed",
      notes: "EPA-registered alternatives permitted if they provide an easily measured residual that's equally effective -- a director-approved, performance-based standard rather than a per-chemical table (same shape as Colorado's 'other disinfecting equipment' clause).",
    },
    {
      parameter: "TOTAL_ALKALINITY",
      unit: "ppm",
      sourceConfidence: "gap",
      notes:
        "Confirmed genuine regulatory gap, not an oversight in sourcing -- total alkalinity has a stated testing frequency (monthly) but NO numeric target range anywhere in HAR Chapter 11-10. Unlike Connecticut's alkalinity gap (filled by a real local-district convention), no equivalent Hawaii-specific local/practice range has any regulatory or quasi-regulatory status. Generic industry practice (commonly 80-120 ppm, or the broader 60-180 ppm norm used elsewhere) is followed voluntarily but has no enforceable standing under HAR -- seeded here as range:null (no min/max/ideal set) rather than treating the generic industry figures as Hawaii's actual rule. If DOH ever amends Chapter 11-10 to add a numeric standard, this needs revisiting, but as of the current text this is a permanent gap, not unfinished research.",
    },
    {
      parameter: "CLARITY",
      unit: "",
      sourceConfidence: "confirmed",
      notes: "Either a 6-inch high-contrast disc clearly visible from outside the pool at the deepest point, OR the main drain grate clearly visible from the deck -- two alternative verification methods, either one satisfies the requirement.",
    },
  ],
  frequencyRules: [
    { parameter: "TOTAL_ALKALINITY", cadence: "monthly", intervalMinutes: 43200, notes: "Frequency is stated even though the numeric range is not -- see the TOTAL_ALKALINITY ChemistryThreshold's gap note." },
    {
      parameter: "WATER_QUALITY_MONITORING_DATA",
      cadence: "quarterly submission to the department",
      intervalMinutes: 129600,
      notes: "A proactive push obligation, not just retain-on-site-and-produce-on-request like every other state's records requirement collected so far -- on top of the standard 12-month on-site retention.",
    },
  ],
  eventProtocols: [
    {
      triggerType: "FECAL_OR_VOMIT",
      triggerLabel: "Accidental fecal or vomitus discharge -- closed-system pool",
      appliesWhen: "closed system (standard recirculating, chlorinated)",
      closureKind: "UNTIL_RETEST_PASSES",
      reopeningCondition: "The pool shall be immediately closed for cleaning; all bathers ordered to leave until the substance is removed. A closed-system pool must be actively disinfected before reopening.",
      externalReferenceLabel: "CDC — Fecal Incident Response Recommendations",
      sourceConfidence: "confirmed",
      notes: "§11-10-22. Also references the CDC's Fecal Incident Response Recommendations for detailed disinfection guidance -- same externally-deferred structure already seen in Florida and Georgia.",
    },
    {
      triggerType: "FECAL_OR_VOMIT",
      triggerLabel: "Accidental fecal or vomitus discharge -- open-system pool",
      appliesWhen: "open system (flow-through/once-through water)",
      closureKind: "UNTIL_RETEST_PASSES",
      reopeningCondition: "The pool shall be immediately closed for cleaning; all bathers ordered to leave until the substance is removed. An open-system pool instead just stays closed until water quality testing confirms it meets HAR Chapter 11-10 standards -- no separate disinfection step is specified.",
      sourceConfidence: "confirmed",
      notes:
        "Reopening logic bifurcated by pool SYSTEM ARCHITECTURE (closed vs. open), not by contamination type (Arkansas/Florida/California/Georgia) or facility type (Alabama/Maryland) -- a genuinely different axis of variation. Worth confirming whether AquaRunner's customer base includes any open-system facilities at all; may be low-relevance in practice but is architecturally distinct if it comes up.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "Total alkalinity has no numeric target range anywhere in HAR Chapter 11-10 -- a confirmed, permanent gap, not something more sourcing would resolve.",
      detail: "Seeded as range:null on the ChemistryThreshold row with the generic industry-practice figures (80-120 or 60-180 ppm) noted as non-binding context only, per the explicit instruction not to treat this as unfinished research.",
    },
  ],
  equipmentReadingRequirements: [{ parameter: "FLOW_METER", notes: "Sourced from §11-10-21's 'rate-of-flow meter readings' daily recording requirement." }],
};


// ---------------------------------------------------------------------------
// Delaware -- 16 DE Admin. Code 4464, Public Swimming Pools (eff. 10/11/2015). One of
// the more complete event-protocol states collected: explicit formed-stool/diarrheal-
// stool/vomit CT values with a CYA-doubling rule, a third CYA-specific diarrheal path
// (drain/dilute/secondary-treat), and a blood exemption (NO_CLOSURE_REQUIRED) matching
// New York's pattern. Total alkalinity and calcium hardness have no flat ppm range in
// the code -- the actual mechanism is a computed Langelier Saturation Index (-0.3 to
// +0.3), seeded as its own SATURATION_INDEX row rather than inventing a ppm range.
// ---------------------------------------------------------------------------
const DELAWARE: StateSeed = {
  state: "DE",
  ruleset: {
    stateName: "Delaware",
    healthDepartmentName: "Delaware Department of Health and Social Services (DHSS), Division of Public Health",
    isSupported: true,
    jurisdictionLevel: "STATE",
    officialCitation:
      "16 Delaware Administrative Code, 4400 Health Systems Protection, 4464 Public Swimming Pools -- §7.1-7.2 (filter effluent turbidity), §8.3-8.6 (chemistry/disinfection), §9.22 (spa temperature), §9.28 (fecal/vomit/blood response), §14.2 (permit suspension/closure)",
    sourceDocument: "16 DE Admin. Code 4464, Public Swimming Pools, adopted 10/1/2015, effective 10/11/2015",
    recordRetentionMonths: 12,
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "No official fill-in form found in the regulation text itself. §8.6.13 requires results recorded with date/time/sample location and kept on-site for at least 1 year, but doesn't prescribe a specific form.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under 16 DE Admin. Code 4464.

### Chemistry targets
- **Free chlorine:** 1.0 ppm minimum without cyanuric acid, 2.0 ppm minimum with cyanuric
  acid (pools), 3.0 ppm minimum (spas), 10.0 ppm maximum for all
- **pH:** 7.2 – 7.8
- **Cyanuric acid:** should not exceed 100 ppm — also the closure-risk trigger
- **Total alkalinity / calcium hardness:** no flat ppm range in the code — governed by the
  Langelier Saturation Index instead (must stay within ±0.3)

### Closure triggers
Any of the following forces immediate closure without a hearing: pH outside 7.2–7.8,
non-compliant clarity or bacteriological quality, disinfection system down, disinfectant
below minimum, cyanuric acid above 100 ppm, filtration equipment down, spa water above
104°F, missing lifeguard/attendant where required, or a fecal accident.

### Fecal/vomit/blood response
Formed stool or vomit: 2.0 ppm free chlorine for at least 25 minutes (doubled if cyanuric
acid is present). Diarrheal stool: 20.0 ppm for at least 12.75 hours. Blood alone does not
require closure — Delaware's code states it doesn't pose a public health risk to properly
maintained water.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Delaware
Division of Public Health's own published code. Verify against the authoritative source
for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.2, maxValue: 7.8, unit: "", sourceConfidence: "confirmed", notes: "§8.5.1.1. Also the pH band named in §14.2.4.3's permit-suspension checklist -- same number, not a separate hazard tier." },

    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "no CYA present", minValue: 1.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§8.6.8.1.1/.1.4." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "CYA present", minValue: 2.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§8.6.8.1.2/.1.4. Use of stabilized chlorine/CYA is prohibited entirely in indoor pools (§8.6.6) -- this row is scoped to outdoor use via indoorOutdoor." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 3.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§8.6.8.1.3/.1.4. Source gives one spa figure, not split by CYA presence the way pools are." },

    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 3.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§8.6.8.2.1. Alternative disinfectant; no maximum stated in the source." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 4.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§8.6.8.2.2. No maximum stated in the source." },

    {
      parameter: "CYANURIC_ACID",
      maxValue: 100,
      unit: "ppm",
      indoorOutdoor: "outdoor",
      sourceConfidence: "confirmed",
      notes:
        "§8.6.8.2.3 (should not exceed 100 ppm) and §14.2.4.7 (same 100 ppm figure is also the permit-suspension closure trigger -- one tier, not a separate hazard band). Use of stabilized chlorine/CYA in indoor pools is prohibited outright (§8.6.6); gas chlorine is also prohibited statewide (§8.6.5, not otherwise modeled here since there's no per-account field for disinfectant delivery method).",
    },

    {
      parameter: "TOTAL_ALKALINITY",
      unit: "ppm",
      sourceConfidence: "gap",
      notes:
        "Confirmed genuine regulatory gap: no numeric target range anywhere in §8.0. The actual codified mechanism is a computed Langelier Saturation Index (see the SATURATION_INDEX row below), not a flat min/max pair -- seeded as range:null rather than inventing a ppm range. Tested after each addition of makeup water and at least weekly (§8.6.11.6.2) -- see the matching FrequencyRule below, seeded even though the threshold itself has no number, same shape as Hawaii's alkalinity gap.",
    },
    {
      parameter: "CALCIUM_HARDNESS",
      unit: "ppm",
      sourceConfidence: "gap",
      notes: "Same shape as TOTAL_ALKALINITY above -- no flat ppm range in §8.0; governed by the Langelier Index instead. Tested after each addition of makeup water and at least weekly (§8.6.11.6.2).",
    },
    {
      parameter: "SATURATION_INDEX",
      minValue: -0.3,
      maxValue: 0.3,
      unit: "",
      sourceConfidence: "confirmed",
      notes:
        "Langelier Saturation Index -- Appendix A/B's actual regulatory mechanism for alkalinity/calcium-hardness balance (computed from pH, alkalinity, hardness, and temperature factors), in place of a flat range for either parameter individually. Same shape as Alaska's SATURATION_INDEX row.",
    },

    { parameter: "TURBIDITY", appliesWhen: "measured in the pool", maxValue: 0.5, unit: "NTU", sourceConfidence: "confirmed", notes: "§8.3.2." },
    { parameter: "TURBIDITY", appliesWhen: "measured at filter effluent", maxValue: 1, unit: "NTU", sourceConfidence: "confirmed", notes: "§7.1.2." },

    { parameter: "BACTERIA", appliesWhen: "heterotrophic plate count", maxValue: 200, unit: "colonies/mL", sourceConfidence: "confirmed", notes: "§8.4.1, if sampled." },
    { parameter: "BACTERIA", appliesWhen: "total coliform", maxValue: 1, unit: "colony/100mL (MF method) or absent", sourceConfidence: "confirmed", notes: "§8.4.2-8.4.3, if sampled." },

    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "§9.22.1." },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "daily prior to opening, and as often as necessary while open (recommended every 1-2 hours)",
      intervalMinutes: 1440,
      isPerformanceBased: true,
      notes: "§8.6.11.6.1. The 1-2 hour figure is a recommendation, not a hard-coded count -- same adequacy-based shape as Connecticut's standard.",
    },
    { parameter: "TOTAL_ALKALINITY", cadence: "after each addition of makeup water and at least weekly", intervalMinutes: 10080, notes: "§8.6.11.6.2. Frequency is stated even though the numeric range is not -- see the TOTAL_ALKALINITY ChemistryThreshold's gap note." },
    { parameter: "CALCIUM_HARDNESS", cadence: "after each addition of makeup water and at least weekly", intervalMinutes: 10080, notes: "§8.6.11.6.2." },
    { parameter: "CYANURIC_ACID", cadence: "after each addition of makeup water and at least weekly, if applicable", intervalMinutes: 10080, notes: "§8.6.11.6.2." },
  ],
  eventProtocols: [
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Formed-stool fecal accident (also covers vomit, §9.28.5)",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 25,
      ctValue: 50,
      ctValueUnit: "ppm*min",
      cascadesToSharedFiltration: true,
      reopeningCondition:
        "Raise/maintain free chlorine at 2.0 mg/L for at least 25 minutes minimum contact time. Pre-treatment conditions before the clock is meaningful: pH <= 7.5, water temperature >= 77F, filtration running.",
      remediationSteps: "Same protocol applies to vomit discharge per §9.28.5 -- identical 2.0 ppm/25 min figures, not modeled as a separate row.",
      sourceConfidence: "confirmed",
      notes: "§9.28.3.2 (shared-filtration cascade), §9.28.3.6 (pre-treatment conditions), §9.28.4.1 (formed-stool), §9.28.5 (vomit -- same as formed-stool). Brominated pools: temporarily add chlorine to reach these same free-chlorine CT targets rather than raising bromine itself, then readjust the bromine residual before reopening (§9.28.7).",
    },
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Formed-stool fecal accident (or vomit) -- CYA/stabilized chlorine present",
      appliesWhen: "CYA present",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 50,
      ctValue: 100,
      ctValueUnit: "ppm*min",
      cascadesToSharedFiltration: true,
      reopeningCondition: "Same as the baseline formed-stool/vomit protocol, but the inactivation time is doubled to at least 50 minutes at 2.0 mg/L because cyanuric acid/stabilized chlorine is present.",
      sourceConfidence: "confirmed",
      notes: "§9.28.4.1, §9.28.5.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal-stool fecal accident",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 765,
      ctValue: 15300,
      ctValueUnit: "ppm*min",
      cascadesToSharedFiltration: true,
      reopeningCondition:
        "Raise/maintain free chlorine at 20.0 mg/L for at least 12.75 hours (or equivalent CT), OR circulate through a secondary disinfection system to reduce Cryptosporidium oocysts below 1/100mL. Same pre-treatment conditions as the formed-stool protocol (pH <= 7.5, water temp >= 77F, filtration running).",
      sourceConfidence: "confirmed",
      notes: "§9.28.4.2. The 15,300 ppm*min CT figure matches the same CDC/MAHC-derived standard Arkansas, New York, and California independently converge on.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal-stool fecal accident -- any venue containing CYA/stabilized chlorine",
      appliesWhen: "CYA present",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 1800,
      ctValue: 72000,
      ctValueUnit: "ppm*min",
      cascadesToSharedFiltration: true,
      reopeningCondition:
        "Broader than just the diarrheal case: lower pH to 6.5 and raise free chlorine to 40 mg/L for at least 30 hours (or equivalent CT), OR secondary disinfection to the same oocyst target, OR drain the venue completely -- three alternative remediation paths, not one fixed number.",
      sourceConfidence: "confirmed",
      notes: "§9.28.4.3.",
    },
    {
      triggerType: "BLOOD",
      triggerLabel: "Blood contamination of pool water",
      closureKind: "NO_CLOSURE_REQUIRED",
      reopeningCondition:
        "No closure required. Delaware's code states blood contamination of a properly maintained pool's water does not pose a public health risk to swimmers. Operators MAY choose to treat it as a formed-stool event, purely to satisfy patron concerns, not because the code requires it.",
      sourceConfidence: "confirmed",
      notes: "§9.28.6.1. Matches New York's blood exemption pattern (NO_CLOSURE_REQUIRED), independently confirmed in a second state.",
    },
    {
      triggerType: "UNIFIED_CLOSURE_CHECKLIST",
      triggerLabel: "Permit suspension -- enumerated conditions",
      closureKind: "ENUMERATED_CHECKLIST",
      reopeningCondition:
        "The Director suspends the operating permit and orders immediate closure without a hearing if any of these exist: pH outside 7.2-7.8; non-compliant clarity/turbidity; non-compliant bacteriological quality; disinfection system not functioning or absent; free chlorine/bromine below the §8.6 minimum; cyanuric acid greater than 100 ppm; recirculation pump or filter not operating/absent; spa water hotter than 104F; no qualified lifeguard/attendant; bare electrical hazard; required lighting/main-drain visibility not met; Division representative denied immediate access; fecal material discharged into the pool; no qualified operator; or any other condition endangering bather health, safety, or welfare.",
      sourceConfidence: "confirmed",
      notes: "§14.2.4.1-18. Flat enumerated-checklist closure model, same shape as Georgia's ten-item list, not a two-tier discretionary/mandatory authority structure like Connecticut's.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "Total alkalinity and calcium hardness have no numeric target range in the operative code (§8.0) -- the regulatory mechanism is a computed Langelier Saturation Index (-0.3 to +0.3) instead of a flat min/max pair.",
      detail:
        "Seeded TOTAL_ALKALINITY and CALCIUM_HARDNESS as range:null with sourceConfidence:gap; SATURATION_INDEX is seeded instead with the real -0.3/+0.3 band from Appendix A/B, since that's the actual codified mechanism, not a substitute number. Same shape as Hawaii's confirmed-permanent alkalinity gap.",
    },
  ],
};

// ---------------------------------------------------------------------------
// District of Columbia -- Title 25-C DCMR. Notable: indoor conventional pools get a
// *tighter* disinfectant ceiling (5 ppm chlorine / 6 ppm bromine) than the general 10/8
// ppm range -- a facility-attribute exception the app's flat per-body-type threshold
// model can't fully represent (see the ASSUMPTION note below; same class of limitation
// as New York's pH-banded chlorine floor). DC's fecal/vomit/blood protocol is
// incorporated by reference to MAHC 2nd Edition Sec 6.5 (plus several adjacent sections)
// by section number, not restated with DC's own ppm/time figures -- seeded as an
// external reference rather than silently copying Delaware/Oregon's transcribed MAHC
// numbers in as if DC's own code stated them.
// ---------------------------------------------------------------------------
const DISTRICT_OF_COLUMBIA: StateSeed = {
  state: "DC",
  ruleset: {
    stateName: "District of Columbia",
    healthDepartmentName: "District of Columbia Department of Health (DC Health)",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "Title 25-C DCMR, \"Swimming Pool and Spa Regulations\" -- chemistry at §404, contamination/closure at §406, testing frequency and logs at §412, imminent-hazard closures at §715",
    sourceDocument:
      "DC Health Notice of Final Rulemaking, District of Columbia Register Vol. 64, No. 23 (June 9, 2017)",
    recordRetentionMonths: 36,
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "No numbered state form found. §412.1-412.6 prescribe required fields (pH, free chlorine, bromine, CYA, chemicals added, injuries/accidents, equipment malfunctions) and retention (on-site, readable, dated and signed, 3 years), but the rule doesn't name or attach a specific fill-in form.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under Title 25-C DCMR.

### Chemistry targets
- **Free chlorine:** 1.0 – 10.0 ppm (conventional pools), 3.0 – 10.0 ppm minimum (spas)
- **pH:** 7.2 – 7.8 (hard floor/ceiling for closure: 6.5 – 8.0)
- **Cyanuric acid:** 30 – 50 ppm target, 100 ppm hard ceiling
- **Combined chlorine:** must not exceed 0.4 ppm

### Testing frequency
Disinfectant residual and pH tested at minimum every 3 hours, on a fixed schedule: before
opening, midday, and 2 hours before closing.

### Closure triggers
Any Imminent Health Hazard condition forces summary suspension, including pH below 6.5 or
above 8.0 and disinfectant below minimum or above maximum.

### Fecal/vomit/blood response
DC's code requires operators to follow the CDC's Model Aquatic Health Code procedures for
any bodily-fluid accident, but does not restate the CT values in its own text — the
current MAHC document itself is the operative standard.

*This page reflects AquaRunner's built-in rule engine, not a substitute for DC Health's
own published code. Verify against the authoritative source for anything
compliance-critical.*`,
    codeReferenceLabel: "Title 25-C DCMR, Swimming Pool and Spa Regulations (DC Health, official PDF)",
    codeReferenceUrl:
      "https://dchealth.dc.gov/sites/default/files/dc/sites/doh/publication/attachments/2017-%2025C%20DCMR-DC%20Swimming%20Pool,%20Spa%20and%20Saunas_0.pdf",
  },
  chemistryThresholds: [
    // Conventional pools' general range -- resolves as POOL's unconditional default.
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§404.2(b)(1), conventional pools, general range." },
    // Indoor conventional pools get a tighter 5 ppm ceiling (§404.2(b)(4)) -- a genuinely
    // conditional row on indoor/outdoor, an axis this app's findThreshold() doesn't
    // currently match on (only parameter + bodyOfWaterCategory + the fixed
    // DEFAULT_CONDITION_PRIORITY appliesWhen list). Seeded faithfully for completeness/
    // future use, but the app's automatic lookup will resolve to the looser 1-10 ppm row
    // above for ALL DC pools today, indoor or outdoor -- flagged in complianceNotes below,
    // do not treat this row as currently "live" in the UI.
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "indoor conventional pool", maxValue: 5.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§404.2(b)(4). Not reachable by the app's current lookup logic -- see ComplianceNote." },
    // "Spa-type & other non-conventional pools" floor is 2 ppm, but true spas specifically
    // have a higher 3 ppm floor per the same subsection -- modeled here as the SPA row
    // using the more specific 3 ppm figure (the number that actually governs hot
    // tubs/spas, the body type AquaRunner's SPA category represents), with the general
    // 2 ppm "spa-type & other non-conventional" figure kept as context in the notes
    // rather than a separate row, since this app doesn't model a third
    // "non-conventional pool" body-of-water category. See ASSUMPTION note below.
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 3.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "assumption", notes: "§404.2(b)(2). Source text: 'spa-type & other non-conventional pools 2-10 mg/L, spas minimum 3 mg/L' -- used the more specific 3 ppm spa floor rather than the general 2 ppm figure; see ComplianceNote." },
    // No indoor-conventional chlorine/SPA row: §404.2(b)(4) states this indoor cap for
    // bromine, not chlorine (see the BROMINE indoor row below). That chlorine/SPA/indoor
    // combination isn't separately stated in the source, so intentionally no row here
    // rather than guessing a number.

    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 1.5, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§404.2(b)(3), conventional pools." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", appliesWhen: "indoor conventional pool", maxValue: 6.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§404.2(b)(4). Same not-currently-reachable limitation as the chlorine indoor row above." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 4.0, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§404.2(b)(3), spa-type pools." },

    { parameter: "COMBINED_CHLORINE", maxValue: 0.4, unit: "ppm", sourceConfidence: "confirmed", notes: "§404.2(c). Must not exceed 0.4 ppm; remediate via super-chlorination or water exchange. Matches Georgia's and New Mexico's Combined Chlorine max exactly." },
    { parameter: "ORP", appliesWhen: "if used as controller", minValue: 600, maxValue: 900, unit: "mV", sourceConfidence: "confirmed", notes: "§404.2(d). Does not waive the manual testing required under §412." },

    // pH and CYA are naturally unconditional in DC's own source (no pool/spa split
    // stated), satisfying the mandatory unconditional-lookup rule without any collapsing.
    { parameter: "PH", idealMin: 7.2, idealMax: 7.8, hazardMin: 6.5, hazardMax: 8.0, unit: "", sourceConfidence: "confirmed", notes: "§404.2(a). Target 7.2-7.8; hard floor/ceiling 6.5-8.0 doubles as the §715.1(f)-(g) Imminent Health Hazard closure trigger." },
    { parameter: "CYANURIC_ACID", idealMin: 30, idealMax: 50, maxValue: 100, unit: "ppm", sourceConfidence: "confirmed", notes: "§404.2(e). 30-50 ppm target, 100 ppm hard ceiling." },
    // Incident-specific CYA ceiling during diarrheal/Crypto decontamination -- deliberately
    // scoped with an appliesWhen outside DEFAULT_CONDITION_PRIORITY so it is never picked
    // up as a routine default; it's incident context, not an everyday operating target.
    { parameter: "CYANURIC_ACID", appliesWhen: "during diarrheal/Cryptosporidium decontamination", maxValue: 15, unit: "ppm", sourceConfidence: "confirmed", notes: "§406.1(d). Must be lowered to <=15 ppm specifically during a diarrheal-incident response, distinct from the routine 100 ppm ceiling above." },

    { parameter: "QUATERNARY_AMMONIUM", appliesWhen: "if used", maxValue: 5, unit: "ppm", sourceConfidence: "confirmed", notes: "§404.2(f)." },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "Max spa/heated-pool water temperature, water-temp section adjacent to §402.6." },
    // Total Alkalinity and Calcium Hardness: confirmed absent, not seeded -- see
    // ComplianceNote (GAP) below, same pattern as Hawaii/Pennsylvania/Rhode Island.
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "minimum every 3 hours",
      intervalMinutes: 180,
      notes: "§412.1-412.3. pH, free chlorine, and bromine tested at minimum every 3 hours, recorded on a fixed 3x/day schedule: before opening, between 12pm-2pm, and 2 hours before closing.",
    },
    {
      parameter: "CYANURIC_ACID",
      cadence: "prior to opening only",
      intervalMinutes: 1440,
      notes: "§412.1(if used). Once-daily, pre-opening check -- not an intra-day repeating cadence the way disinfectant/pH is.",
    },
  ],
  eventProtocols: [
    {
      triggerType: "UNIFIED_CLOSURE_CHECKLIST",
      triggerLabel: "Any Imminent Health Hazard condition, §715.1(a)-(z)",
      closureKind: "ENUMERATED_CHECKLIST",
      reopeningCondition: "Correct the specific condition(s) that triggered summary suspension, then reopen once the Department (or licensee, for self-correctable items) confirms compliance.",
      remediationSteps:
        "The Department shall summarily suspend operations (or the licensee must immediately discontinue and notify) for: pH below 6.5 or above 8.0 (§715.1(f)-(g), cross-referencing §404.2(a)); disinfectant below minimum or above maximum (§715.1(h)); contaminated water not properly treated (§715.1(i)); plus roughly 24 other enumerated physical/structural conditions (missing depth markings, filtration not running, entrapment-prevention equipment absent, no PPE for chemical handling, etc.).",
      sourceConfidence: "confirmed",
      notes: "Same enumerated-list closure shape as Georgia/Delaware, not Connecticut's two-tier discretionary/mandatory authority model.",
    },
    {
      triggerType: "FECAL_OR_VOMIT_OR_BLOOD",
      triggerLabel: "Bodily fluid accident -- incorporated by reference to MAHC, not DC's own numbers",
      closureKind: "UNTIL_RETEST_PASSES",
      externalReferenceLabel:
        "Model Aquatic Health Code, 2nd Edition (July 2016) §6.5, plus §§6.0.1.8, 6.0.1.9, 6.1.2.1.4.1, 6.1.2.1.4.5, 6.1.2.1.4.14, 6.1.2.1.4.15, 6.4.1.1.2(4), 6.4.1.3.1(15), 6.4.1.8, cited by §412.7",
      reopeningCondition:
        "§412.7 requires compliance with 'Standard Operating Procedures for accidents involving bodily fluid' as specified in the cited MAHC 2nd Edition sections -- DC's own code text does NOT restate a ppm/time table. The actual CT numbers legally in force are whatever MAHC 2nd Ed. §6.5 currently states, not independently confirmed against DC's own regulation text in this pass. Do not treat Delaware's or Oregon's transcribed MAHC figures as confirmed for DC without checking the current MAHC 2nd Edition text directly.",
      sourceConfidence: "gap",
      notes:
        "A new pattern for this dataset: incorporation by reference to an external code BY SECTION NUMBER, distinct from Georgia/Florida's softer 'defer to current CDC guidance' language and from Texas/Utah/Wisconsin's similar-but-separate MAHC-by-reference pattern. §406(a)-(c) defines 'contaminated' purely via bacteriological (coliform) sample counts -- narrower than a bodily-fluid incident definition. Bloodborne pathogen handling is addressed only via lifeguard PPE/training requirements (§302.1(d), OSHA cross-reference); no DC-specific 'blood does not require closure' statement exists in the DCMR text itself -- that determination, if any, lives in the referenced MAHC §6.5, same as the CT values.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "Total Alkalinity and Calcium Hardness have no numeric target range anywhere in §404 or the test-kit sections reviewed.",
      detail: "§405.1 requires kits capable of testing alkalinity and hardness, implying they're monitored, but no target range is stated in the chapter text reviewed. Treated as confirmed absent from the codified rule, not a research gap, pending a fuller read of any appendix.",
    },
    {
      kind: "GAP",
      summary: "Water clarity/turbidity has a numeric standard referenced in DC's definitions section, but the operative NTU requirement in §402/410 wasn't captured in the source research pass.",
    },
    {
      kind: "GAP",
      summary: "The fecal/vomit/blood CT table is incorporated by reference to MAHC 2nd Edition §6.5 (and several adjacent sections) rather than restated in DC's own code -- see the EventProtocol row above. No DC-specific numbers exist to seed as confirmed.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Indoor conventional pools/spas get a tighter disinfectant ceiling (5 ppm chlorine, 6 ppm bromine) than the general range (§404.2(b)(4)), seeded as separate rows scoped by appliesWhen: \"indoor conventional pool\" -- but the app's current findThreshold() lookup only matches on parameter + bodyOfWaterCategory + the fixed DEFAULT_CONDITION_PRIORITY appliesWhen list, which doesn't include an indoor/outdoor axis.",
      detail: "Practical effect: every DC pool/spa (indoor or outdoor) currently resolves to the looser general ceiling (10 ppm chlorine / 8 ppm bromine) in the app's dashboard/QR-log/visit-form logic, not the stricter 5/6 ppm indoor figure. Same class of limitation as New York's pH-banded chlorine floor (see NEW_YORK's seed comment) -- a real accuracy tradeoff for indoor DC facilities specifically, not a missing-data null. Properly fixing this means tracking indoor/outdoor per body of water and matching on it in findThreshold(), a real code change out of scope for a data-seeding pass.",
    },
    {
      kind: "ASSUMPTION",
      summary: "DC's source text splits the spa-type chlorine floor into a general '2-10 mg/L, spa-type & other non-conventional pools' figure and a more specific '3 mg/L minimum' for true spas -- the SPA row above uses the more specific 3 ppm floor, treating the 2 ppm figure as covering a third 'non-conventional pool' category this app doesn't model.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "Bloodborne pathogen PPE/training requirements for lifeguards (§302.1(d), OSHA cross-reference) are a staffing/training requirement, not a chemistry threshold or closure trigger -- not modeled as a schema row.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "§412.3 lets the Department require more frequent testing given high bather load, high temperature, bright sunlight, or inadequate water quality -- a discretionary escalation clause, not a fixed override number, so not modeled as its own FrequencyRule row.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Idaho -- not a sourcing gap, a confirmed regulatory vacuum. House Bill 202 (2025
// session, Session Law Chapter 47) deleted the health-district-oversight language from
// Idaho Code §56-1003(3c) effective 2025-07-01, making IDAPA 16.02.14 ("Construction and
// Operation of Public Swimming Pools") obsolete with no replacement. No state-level
// chemistry standard, closure trigger, or fecal/vomit/blood protocol exists as of this
// pass. isSupported stays false: there is no chemistry data to show live, and showing
// stale pre-repeal IDAPA 16.02.14 numbers would be actively misleading, not just
// incomplete. Revisit only if a specific local health district's own rule is sourced.
// ---------------------------------------------------------------------------
const IDAHO: StateSeed = {
  state: "ID",
  ruleset: {
    stateName: "Idaho",
    healthDepartmentName: "None at the state level as of 2025-07-01 -- Idaho Department of Health and Welfare no longer has statutory authority over public pools",
    isSupported: false,
    hasNoLegalRequirement: true,
    officialCitation: "N/A (repealed). Historical reference only: the repealed rule was IDAPA 16.02.14; the repealing act is 2025 Idaho Session Laws, Chapter 47 (House Bill 202), amending Idaho Code §56-1003.",
    sourceDocument: "House Bill 202 (2025 session, Session Law Chapter 47); confirmed via Idaho State Legislature bill text and Central District Health's own public statement that the pool inspection program ends 2025-07-01.",
  },
  // Idaho has no state-level pool code at all (see the GAP note below) -- these are NOT
  // Idaho's law. They're the CDC's Model Aquatic Health Code (MAHC), the national
  // reference standard most state codes derive from, sourced directly from the Council
  // for the MAHC's own published code text (cmahc.org) rather than the old repealed
  // IDAPA 16.02.14 numbers the GAP note explicitly says not to use. isSupported stays
  // false -- lib/compliance.ts's activeReadingFields() renders these as optional
  // reference values (never required, never gating closure risk or the public inspector
  // log) precisely because isSupported is false, not despite it.
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.2, maxValue: 7.8, unit: "", sourceConfidence: "confirmed", notes: "CDC MAHC §5.7.3.4. Advisory reference only -- not an Idaho legal requirement." },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      appliesWhen: "no CYA present",
      minValue: 1.0,
      maxValue: 10.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "CDC MAHC §5.7.3.1.1.5. Advisory reference only.",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      appliesWhen: "CYA present",
      minValue: 2.0,
      maxValue: 10.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "CDC MAHC §5.7.3.1.3.1 (\"minimum chlorine levels should be increased by a factor of at least two when using CYA\"). Advisory reference only.",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "SPA",
      minValue: 3.0,
      maxValue: 10.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "CDC MAHC §5.7.3.1.1.5. Advisory reference only.",
    },
    {
      parameter: "BROMINE",
      disinfectionMethod: "BROMINE",
      bodyOfWaterCategory: "POOL",
      minValue: 3.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "CDC MAHC §5.7.3.1.2.2. No MAHC-cited maximum located this pass -- left null rather than guessed. Advisory reference only.",
    },
    {
      parameter: "BROMINE",
      disinfectionMethod: "BROMINE",
      bodyOfWaterCategory: "SPA",
      minValue: 4.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "CDC MAHC §5.7.3.1.2.2. Advisory reference only.",
    },
    {
      parameter: "CYANURIC_ACID",
      maxValue: 100,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "CDC MAHC §5.7.3.1.3.1. MAHC prohibits CYA entirely in spas/therapy pools, but this app doesn't yet track that distinction per body of water (same limitation as other states' body-subtype CYA notes), so this cap also shows for spas. Advisory reference only.",
    },
    { parameter: "TOTAL_ALKALINITY", minValue: 60, maxValue: 180, unit: "ppm", sourceConfidence: "confirmed", notes: "CDC MAHC §5.7.4.4.1. Advisory reference only." },
  ],
  frequencyRules: [],
  eventProtocols: [],
  complianceNotes: [
    {
      kind: "GAP",
      summary:
        "Idaho repealed all state-level public pool/spa regulation effective 2025-07-01 (HB 202) -- no chemistry standard, closure trigger, or fecal/vomit/blood protocol exists at the state level. Confirmed repeal, not unresearched.",
      detail:
        "Do not seed a ChemistryThreshold row using the old IDAPA 16.02.14 numbers (pH 7.2-7.8 target / closure outside 6.8-8.2, CYA max 100 ppm, alkalinity 80-200 ppm) as if they're current -- they carry no regulatory force today. Idaho now has ~7 independent local health districts (e.g. Southwest District Health, Central District Health), each free to write or decline to write its own pool rule. A real value for an Idaho customer has to come from whichever local health district or municipality covers that specific property -- a county/city-level lookup, not a single Idaho state row, and out of scope for this pass. Revisit if any Idaho local health district publishes its own numeric standard AquaRunner customers in that district would be bound by.",
    },
    {
      kind: "ASSUMPTION",
      summary:
        "The chemistry thresholds on this ruleset are CDC Model Aquatic Health Code (MAHC) reference values, not Idaho law -- Idaho has none. Shown to technicians as optional logging fields only.",
      detail:
        "Sourced directly from the Council for the MAHC's own published code text (cmahc.org): pH §5.7.3.4, free chlorine/CYA §5.7.3.1.1.5 and §5.7.3.1.3.1, bromine §5.7.3.1.2.2, total alkalinity §5.7.4.4.1. isSupported stays false so closure-risk banners and the public inspector log stay off (there's nothing to enforce), but activeReadingFields() still renders these as non-required fields so a technician can optionally log against a real, commonly-referenced standard instead of nothing.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Illinois -- 77 Ill. Admin. Code Part 820. New pattern: no pool-vs-spa chemistry
// split at all -- one flat range covers every "swimming facility" (the Code's own
// term, already inclusive of pools/spas/wading pools), with the only de facto spa
// lever being a temperature-triggered chlorine floor bump (>=2.0 ppm once water
// exceeds 85°F). CYA's 100 ppm ceiling is a routine standard but NOT confirmed as
// its own mandatory-closure trigger -- Illinois's own enumerated closure list
// (Section 820.330) never names cyanuric acid. Fecal/vomit incident rule gives no
// CT value, no formed-vs-diarrheal split, and no blood-specific provision -- just
// "superchlorinate, stay closed >=30 min until residual returns to normal."
// ---------------------------------------------------------------------------
const ILLINOIS: StateSeed = {
  state: "IL",
  ruleset: {
    stateName: "Illinois",
    healthDepartmentName: "Illinois Department of Public Health (IDPH)",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation: "77 Ill. Admin. Code Part 820, \"Swimming Facility Code\" -- §820.320 (Water Quality), §820.330 (Swimming Pool Closing), §820.350 (Operation Reports and Routine Sampling)",
    sourceDocument: "Illinois Swimming Facility Code, 77 Ill. Admin. Code Part 820 (ilga.gov / JCAR full text).",
    recordRetentionMonths: 36,
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Swimming Facility Daily Operational Report",
    logSheetSourceNotes:
      "Referenced in §820.350 and published by IDPH; the form's own printed copy is a scanned/binary PDF that couldn't be read as text, so the numeric ranges below come from the regulation text itself, not a transcription of the form.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under 77 Ill. Admin. Code
Part 820.

### Chemistry targets
- **Free chlorine:** 1.0 – 4.0 ppm (2.0 – 4.0 ppm once water exceeds 85°F, the de facto
  spa floor)
- **pH:** 7.2 – 7.6 (closure band: below 6.8 or above 8.0)
- **Cyanuric acid:** should not exceed 100 ppm
- **Total alkalinity:** 50 – 200 ppm

### Closure triggers
Immediate closure for: free chlorine below 0.5 ppm or bromine below 1.0 ppm; total
chlorine above 5.0 ppm or total bromine above 10.0 ppm; pH below 6.8 or above 8.0;
coliform/E. coli/Pseudomonas presence; recirculation or filtration equipment down; a
missing/damaged suction outlet cover; hazardous turbidity; or a Department closure notice.

### Fecal/vomit response
Immediate closure the moment a patron defecates or vomits in the pool; superchlorinate
and remain closed a minimum of 30 minutes, or longer until the disinfectant residual
returns to its normal range. Illinois's code doesn't state a specific ppm target or CT
value for this step.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Illinois
Department of Public Health's own published code. Verify against the authoritative source
for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    // No CYA-present/absent branch in Illinois's own text -- one flat range, written
    // as explicit POOL and SPA rows per the mandatory FREE_CHLORINE/BROMINE scoping
    // rule (the app always looks these two up per body type).
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, maxValue: 4.0, hazardMin: 0.5, unit: "ppm", sourceConfidence: "confirmed", notes: "§820.320 routine range; §820.330 mandatory-closure floor is looser (0.5 ppm) than the routine floor -- same two-tier target-vs-closure shape as other states, Illinois's own numbers." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 1.0, maxValue: 4.0, hazardMin: 0.5, unit: "ppm", sourceConfidence: "confirmed", notes: "Illinois doesn't name spas separately -- same flat range as pools applies. See the temperature-conditional row below for the de facto spa floor." },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      appliesWhen: "water temperature exceeds 85°F",
      minValue: 2.0,
      maxValue: 4.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "Functions as a de facto higher spa minimum (spa water commonly exceeds 85°F) without the Code ever naming spas separately -- the only spa-specific lever in Illinois's chemistry rule.",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "SPA",
      appliesWhen: "water temperature exceeds 85°F",
      minValue: 2.0,
      maxValue: 4.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
    },
    { parameter: "TOTAL_CHLORINE", bodyOfWaterCategory: "POOL", hazardMax: 5.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§820.330 mandatory-closure ceiling; no routine target range stated for total chlorine, only this closure-trigger maximum." },
    { parameter: "TOTAL_CHLORINE", bodyOfWaterCategory: "SPA", hazardMax: 5.0, unit: "ppm", sourceConfidence: "confirmed" },
    {
      parameter: "COMBINED_CHLORINE",
      unit: "ppm",
      relationalRule: "If combined chlorine exceeds 0.5 ppm, breakpoint/superchlorinate to 10x the combined chlorine reading (§820.320) -- a routine correction trigger, distinct from and not explicitly tied to the fecal/vomit incident procedure below.",
      sourceConfidence: "confirmed",
    },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.0, maxValue: 8.0, hazardMin: 1.0, hazardMax: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "hazardMax reflects §820.330's 'total bromine above 10.0 ppm' closure trigger -- a total-vs-free distinction Illinois's own text draws but this row doesn't separately model." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 2.0, maxValue: 8.0, hazardMin: 1.0, hazardMax: 10.0, unit: "ppm", sourceConfidence: "confirmed" },
    {
      parameter: "CYANURIC_ACID",
      maxValue: 100,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "§820.320's routine ceiling. NOT confirmed as an independent §820.330 mandatory-closure trigger -- unlike Delaware/Georgia, Illinois's own enumerated closure list never names cyanuric acid. Treat as a standing routine violation, not a confirmed closure event.",
    },
    { parameter: "TOTAL_ALKALINITY", minValue: 50, maxValue: 200, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "PH", minValue: 7.2, maxValue: 7.6, hazardMin: 6.8, hazardMax: 8.0, unit: "", sourceConfidence: "confirmed", notes: "hazardMin/Max is §820.330's mandatory-closure band, wider than and distinct from the §820.320 routine 7.2-7.6 target." },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "POOL", indoorOutdoor: "indoor", minValue: 76, maxValue: 92, unit: "°F", sourceConfidence: "confirmed" },
    { parameter: "CLARITY", unit: "", sourceConfidence: "confirmed", notes: "Qualitative standard, not an NTU number: the entire pool basin must be clearly visible from the pool deck." },
  ],
  frequencyRules: [
    { parameter: "DISINFECTANT_AND_PH", cadence: "at least twice daily, from shallow and deep areas of each pool and all other aquatic features", intervalMinutes: 720 },
    { parameter: "COMBINED_CHLORINE", appliesWhen: "chlorine is the disinfectant", cadence: "at least weekly", intervalMinutes: 10080 },
    { parameter: "CYANURIC_ACID", appliesWhen: "if chlorinated cyanurates used", cadence: "at least weekly", intervalMinutes: 10080 },
    { parameter: "OZONE", appliesWhen: "if used", cadence: "monthly", intervalMinutes: 43200, notes: "Tested immediately above the pool water surface." },
    // No TOTAL_ALKALINITY row -- §820.350 never states a cadence for it even though
    // §820.320 gives a numeric range; see the matching ComplianceNote (GAP) below.
  ],
  eventProtocols: [
    {
      triggerType: "UNIFIED_CLOSURE_CHECKLIST",
      triggerLabel: "Any of §820.330's named mandatory-closure conditions",
      closureKind: "ENUMERATED_CHECKLIST",
      reopeningCondition: "Correct the specific condition(s) that triggered closure, then reopen.",
      remediationSteps:
        "Mandatory immediate closure if: free chlorine <0.5 ppm or bromine <1.0 ppm; total chlorine >5.0 ppm or total bromine >10.0 ppm; pH <6.8 or >8.0; coliform concentration of 10/100mL in two consecutive samples, or any presence of fecal coliform, E. coli, or Pseudomonas; recirculation pumps/filters inoperable; a suction outlet cover loose, improperly installed, damaged, or missing; hazardous turbidity; any condition posing immediate health/safety danger; a Department closure notice; or (outdoor facilities) lightning/thunder within 15 minutes.",
      sourceConfidence: "confirmed",
      notes: "Same flat enumerated-checklist shape as Georgia/Delaware, spanning chemistry, equipment, and safety conditions in one list.",
    },
    {
      triggerType: "FECAL_OR_VOMIT",
      triggerLabel: "A patron has defecated or vomited in the pool",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 30,
      reopeningCondition:
        "Immediate closure the moment a patron has defecated or vomited in the pool. Facility must remain closed for a minimum of 30 minutes following superchlorination, or longer if necessary, for the disinfectant residual to return to prescribed levels.",
      sourceConfidence: "confirmed",
      notes:
        "Genuine gap, not a missed excerpt: unlike Delaware/Georgia/Arkansas/California/Florida, Illinois's own code gives no specific free-chlorine target, no formed-vs-diarrheal distinction, and no explicit CT value for this step -- just 'superchlorinate, then stay closed >=30 min until residual returns to normal.' No blood-specific provision and no CDC cross-reference found in §820.330. IDPH's own operator-training course materials may define a more precise protocol not accessible as readable text this pass.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "Total alkalinity has no stated test cadence anywhere in §820.350, even though §820.320 gives a 50-200 ppm numeric range.",
      detail: "§820.350 lists a cadence for every other routinely-tested parameter (disinfectant/pH, combined chlorine, CYA, ozone) but never states one for alkalinity -- reads as a genuine gap in the code itself, not a missed excerpt.",
    },
    {
      kind: "GAP",
      summary: "CYA's status as an independent mandatory-closure trigger is ambiguous.",
      detail: "§820.320 states the 100 ppm ceiling as a routine standard, but §820.330's enumerated closure list does not separately name cyanuric acid, and no remediation procedure (e.g. partial draining) is specified anywhere in the sections reviewed. Don't assume CYA >100 ppm closes the pool in Illinois the way it does in other states.",
    },
    {
      kind: "GAP",
      summary: "No numeric CT value, formed-vs-diarrheal distinction, or blood-specific provision exists for the fecal/vomit incident procedure in the regulation text itself.",
      detail: "IDPH's own 'Illinois Swimming Pool Operator' training course materials may define a more precise protocol in an attachment not accessible as readable text this pass -- worth a follow-up fetch before assuming the code's silence is the whole story.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Indiana -- 410 IAC 6-2.1. Notable: a CYA closure instruction (>60 ppm) lives inside
// §30's chemistry section itself rather than §43's enumerated closure list -- don't
// assume CYA is absent from Indiana's closure logic just because §43 doesn't name it.
// Vomit is folded into the solid-stool procedure (no lighter-touch track like most
// states), and Indiana's unstabilized-diarrheal CT=15,300 independently matches New
// York's identical figure -- cross-state confirmation of a likely CDC/MAHC-derived
// standard. No blood-specific provision exists anywhere in §44 (neither an exemption
// nor a numeric protocol).
// ---------------------------------------------------------------------------
const INDIANA: StateSeed = {
  state: "IN",
  ruleset: {
    stateName: "Indiana",
    healthDepartmentName: "Indiana State Department of Health (ISDH)",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "410 IAC 6-2.1, \"Public and Semi-Public Swimming Pools\" -- §30 (Pool water chemistry), §43 (Reasons for closure), §44 (Fecal accidents), §38 (records)",
    sourceDocument: "410 IAC 6-2.1 full text (in.gov); Swimming Pool Record of Operation, State Form 12279 (forms.in.gov)",
    recordRetentionMonths: 12,
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Swimming Pool Record of Operation, State Form 12279",
    logSheetSourceNotes: "Logged daily, retained 1 year per §38.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under 410 IAC 6-2.1.

### Chemistry targets
- **Free chlorine:** 1.0 – 7.0 ppm (pools), 2.0 – 7.0 ppm (spas)
- **Bromine:** 2.0 – 10.0 ppm (pools), 4.0 – 10.0 ppm (spas)
- **pH:** 7.2 – 7.8 (closure band: below 6.8 or ≥8.0)
- **Cyanuric acid:** must not exceed 60 ppm — this is also the closure trigger,
  indoor pools and all spas are prohibited from using it at all
- **Total alkalinity:** 80 – 120 ppm

### Closure triggers
Immediate closure for: pH outside 6.8–8.0; bacteriological or clarity failure; main drain
or equipment issues; missing lifeguards where required; a fecal accident; or CYA above
60 ppm. Breakpoint chlorination periods also require closure until chlorine descends back
to the 7.0 ppm maximum.

### Fecal/vomit/blood response
Formed stool or full-stomach vomit: 2 ppm (4 ppm if a stabilizer is present) for at least
25 minutes, closing every body of water on the shared filtration system. Diarrheal stool:
20 ppm for 12h45m (unstabilized) — with stabilizer present, drain CYA to ≤15 ppm and
hyperchlorinate to one of three CT-equivalent options. No blood-specific provision exists.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Indiana
State Department of Health's own published code. Verify against the authoritative source
for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.2, maxValue: 7.8, hazardMin: 6.8, hazardMax: 8.0, unit: "", sourceConfidence: "confirmed", notes: "§30 routine range 7.2-7.8; §43 closure trigger is the wider <6.8 or >=8.0 band -- same two-tier shape as Illinois." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, maxValue: 7.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Not split by CYA presence/absence in Indiana's own table -- one flat range for pools." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 2.0, maxValue: 7.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 4.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed" },
    {
      parameter: "CYANURIC_ACID",
      maxValue: 60,
      hazardMax: 60,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "Lower than every other state collected so far (Delaware/Illinois both cap at 100 ppm). Prohibited entirely in indoor pools and in spas of any kind -- usable only in chlorine-disinfected outdoor pools. §30 states the pool must close the moment CYA exceeds 60 ppm, so the routine ceiling and the closure trigger are the same number here (see the CYA EventProtocol row below for the closure instruction itself).",
    },
    { parameter: "TOTAL_ALKALINITY", minValue: 80, maxValue: 120, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: "°F", sourceConfidence: "confirmed" },
  ],
  frequencyRules: [
    { parameter: "DISINFECTANT_AND_PH", cadence: "daily before the pool opens, and at least one additional time during hours of use", intervalMinutes: 720 },
    { parameter: "COMBINED_CHLORINE", appliesWhen: "chlorine is the disinfectant", cadence: "at least twice a week", intervalMinutes: 5040 },
    { parameter: "TOTAL_ALKALINITY", cadence: "at least once a week", intervalMinutes: 10080 },
    { parameter: "CYANURIC_ACID", appliesWhen: "if used", cadence: "at least once a week", intervalMinutes: 10080 },
  ],
  eventProtocols: [
    {
      triggerType: "CHEMISTRY_HAZARD_THRESHOLD",
      triggerLabel: "Cyanuric acid exceeds 60 ppm",
      closureKind: "CHEMISTRY_HAZARD_THRESHOLD",
      reopeningCondition: "Pool must close immediately per §30; reopen once cyanuric acid is brought back to 60 ppm or below.",
      sourceConfidence: "confirmed",
      notes: "This closure instruction lives in §30 (the chemistry section) rather than §43's enumerated closure list -- structurally placed elsewhere in the code, same ambiguity Illinois has, but Indiana's version states it explicitly rather than leaving it silent.",
    },
    {
      triggerType: "BREAKPOINT_CHLORINATION_REOPENING",
      triggerLabel: "Breakpoint chlorination in progress",
      closureKind: "DESCEND_BELOW_CEILING",
      reopeningCondition: "Pool must remain closed during breakpoint chlorination until free chlorine descends back to the §30 maximum of 7.0 ppm -- reopening is a reading coming back down, not up, same mirror-case shape as Florida's breakpoint reopening rule.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "CHEMICAL_MANUAL_ADDITION",
      triggerLabel: "Any direct chemical addition to the water",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 60,
      reopeningCondition: "Pool must stay closed a minimum of 1 hour after any direct chemical addition.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "UNIFIED_CLOSURE_CHECKLIST",
      triggerLabel: "Any of the §43 enumerated closure conditions",
      closureKind: "ENUMERATED_CHECKLIST",
      reopeningCondition: "Correct the specific condition(s) that triggered closure, then reopen.",
      remediationSteps:
        "§43 closure conditions: pH <6.8 or >=8.0; failure to meet bacteriological requirements (§31(f), §42.1(b)(15)/(16)); water clarity requirements not met (§31(a) or §42.1(b)(13)); main drain grate missing/broken or §32(e) not met; pump, filter, or disinfectant feeder not operational; lifeguard requirements not met where applicable (§35); a fecal accident; spa water temperature exceeds 104°F; and a catch-all for any condition ISDH determines may cause/result in a health or safety hazard or disease transmission.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "FECAL_SOLID",
      triggerLabel: "Solid/formed stool or full-stomach vomit, no chlorine stabilizer present",
      appliesWhen: "no CYA present",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 25,
      ctValue: 45,
      ctValueUnit: "ppm*min",
      cascadesToSharedFiltration: true,
      reopeningCondition: "Maintain 2 ppm free disinfectant for a minimum of 25 minutes at poolside (or equivalent time/concentration reaching CT=45), with pH <=7.5 and water temperature >=77°F throughout.",
      remediationSteps: "Clear all patrons; close the affected pool/spa and every other body of water sharing the same filtration system. Remove material with a net or scoop only -- vacuums are prohibited. Sanitize removal equipment with a fresh 20 ppm chlorine solution, or leave it immersed in the pool during disinfection. Reopening: reduce free chlorine back to the §30 maximum, rebalance pH, recharge the filter, verify circulation is operating.",
      sourceConfidence: "confirmed",
      notes: "Indiana folds vomit into the solid-stool procedure rather than giving it its own lighter-touch track the way most states collected do.",
    },
    {
      triggerType: "FECAL_SOLID",
      triggerLabel: "Solid/formed stool or full-stomach vomit, chlorine stabilizer present",
      appliesWhen: "CYA present",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 25,
      ctValue: 100,
      ctValueUnit: "ppm*min",
      cascadesToSharedFiltration: true,
      reopeningCondition: "Maintain 4 ppm free disinfectant for a minimum of 25 minutes (or equivalent to CT=100), with pH <=7.5 and water temperature >=77°F throughout.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal (nonsolid) stool, no chlorine stabilizer present",
      appliesWhen: "no CYA present",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 765,
      ctValue: 15300,
      ctValueUnit: "ppm*min",
      cascadesToSharedFiltration: true,
      reopeningCondition: "Raise and maintain free chlorine at 20 ppm for 765 minutes (12h45m) -- or equivalent to CT=15,300 -- or completely drain the pool. pH <=7.5 and water temperature >=77°F throughout.",
      sourceConfidence: "confirmed",
      notes: "CT=15,300 for the unstabilized diarrheal-stool case independently matches New York's identical figure -- cross-state confirmation this specific value is a real recurring CDC/MAHC-derived standard, not a one-state idiosyncrasy.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal (nonsolid) stool, chlorine stabilizer present",
      appliesWhen: "CYA present",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 1800,
      cascadesToSharedFiltration: true,
      reopeningCondition: "Lower pH to 6.5, raise and maintain free chlorine at 40 ppm for 30 hours.",
      sourceConfidence: "confirmed",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "No blood-specific provision exists anywhere in §44 -- neither an exemption (New York's/Delaware's \"does not pose a public health risk\") nor a numeric protocol.",
      detail: "Don't assume Indiana grants the same blood exemption found in New York/Delaware/Oregon just because it's silent -- confirmed absent from the fecal-accident section, not researched-but-unfound.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Iowa -- 641 IAC Chapter 15, current version effective 9/24/25 (a significant rewrite
// of the prior 2020 text; sourced from the current version only, per state-compliance-
// data.md's explicit warning not to carry forward the superseded tiered-ORP structure).
// pH's mandatory-vs-discretionary closure split mirrors Nevada's own hazard-band shape
// (discretionary per 15.4(2)b, pool section only -- spa section has no equivalent
// clause). CYA has an asymmetric close-at-80/reopen-at-40 pair, the same
// descend-below-ceiling shape as Florida's breakpoint chlorination reopening rule.
// No fecal/vomit/blood protocol exists anywhere in the chapter -- confirmed absent via
// full-text search of both the 2020 and 2025 versions, not a rewrite-related loss.
// ---------------------------------------------------------------------------
const IOWA: StateSeed = {
  state: "IA",
  ruleset: {
    stateName: "Iowa",
    healthDepartmentName:
      "Iowa Department of Public Health (per 641 IAC's own header; Iowa DIAL -- Dept. of Inspections, Appeals & Licensing -- administers pool/spa registration specifically since Iowa's 2023 HHS consolidation, per DIAL's own site).",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation: "641 Iowa Administrative Code, Chapter 15, Rules 15.4 (pool operations) and 15.51 (spa operations) -- version effective 9/24/25 (IAB 8/20/25, ARC 9498C)",
    sourceDocument: "641 IAC Chapter 15, 'Swimming Pools, Spas, and Spray Pads' -- current rewrite, not the superseded 2020 text",
    logSheetSource: "BUILT_FROM_CODE",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under 641 Iowa Administrative
Code, Chapter 15.

### Chemistry targets
- **Free chlorine:** 1.0 – 8.0 ppm (pools), 2.0 – 8.0 ppm (spas) — closure floors are
  looser (0.6 / 1.0 ppm) and function as a mandatory minimum
- **Bromine:** 2.0 – 18.0 ppm (pools), 4.0 – 18.0 ppm (spas)
- **pH:** 7.2 – 7.8 — an inspection agency *may* order closure below 6.8 or above 8.2
  (discretionary, pools only)
- **Cyanuric acid:** closes at 80 ppm, may reopen once back to 40 ppm or below; banned
  entirely in indoor pools and spas

### Testing frequency
Disinfectant/pH tested within 30 minutes of opening then every 4 hours (pools) or every 2
hours (spas); combined chlorine and cyanuric acid weekly (pools) or daily (spas).

### Fecal/vomit/blood response
No protocol exists in Iowa's current rule — confirmed absent, not a gap in this research.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Iowa
Department of Public Health's own published code. Verify against the authoritative source
for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    {
      parameter: "PH",
      minValue: 7.2,
      maxValue: 7.8,
      hazardMin: 6.8,
      hazardMax: 8.2,
      unit: "",
      sourceConfidence: "confirmed",
      notes:
        "Same numbers for pools and spas (15.4(2)/15.51(2)), collapsed to one unconditional row. The 6.8/8.2 hazard band is DISCRETIONARY, not automatic -- '15.4(2)b: an inspection agency MAY require closure', pool section only. The spa section (15.51(2)b) states the 7.2-7.8 target with no equivalent closure clause at all -- don't assume the pool's hazard band silently carries over to spas.",
    },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, maxValue: 8.0, hazardMin: 0.6, hazardMax: 8.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Closure is mandatory (not discretionary) below 0.6 or above 8.0 -- 15.4(2)a(2)." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 2.0, maxValue: 8.0, hazardMin: 1.0, hazardMax: 8.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Mandatory closure below 1.0 or above 8.0 -- 15.51(2)a(2)." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.0, maxValue: 18.0, hazardMin: 1.0, hazardMax: 18.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Mandatory closure below 1.0 or above 18.0 -- 15.4(2)a(2)." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 4.0, maxValue: 18.0, hazardMin: 2.0, hazardMax: 18.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Mandatory closure below 2.0 or above 18.0 -- 15.51(2)a(3)." },
    {
      parameter: "ORP",
      disinfectionMethod: "NOT_APPLICABLE",
      appliesWhen: "if an ORP controller is installed",
      minValue: 700,
      maxValue: 880,
      hazardMin: 650,
      hazardMax: 880,
      unit: "mV",
      sourceConfidence: "confirmed",
      notes:
        "The 9/24/25 rewrite replaced a prior tiered ORP-escalation system (its own 'Table 1' pairing ORP bands with looser chlorine/bromine ranges, plus an escalating self-report/drain-and-clean mechanism at 5-of-14 and 3-consecutive-of-7 low-ORP days) with this flat requirement. Do not seed the old tiered structure -- it no longer applies.",
    },
    {
      parameter: "CYANURIC_ACID",
      hazardMax: 80,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "No stated routine target range exists -- only the closure trigger (see EventProtocol below for the full close-at-80/reopen-at-40 pair) and an outright indoor ban with no grandfather exceptions (the 2020 version's pre-2008-feed-system exception was removed in this rewrite). Same numbers for pools and spas, collapsed to one unconditional row.",
    },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      bodyOfWaterCategory: "POOL",
      cadence: "daily within 30 minutes of opening, then at least every 4 hours until closing",
      intervalMinutes: 240,
      notes: "Covers free chlorine/bromine, pH, and ORP (if a controller is installed) together on the same cadence.",
    },
    {
      parameter: "DISINFECTANT_AND_PH",
      bodyOfWaterCategory: "POOL",
      facilityAttribute: "common_interest_development_under_25_units",
      cadence: "twice daily minimum",
      intervalMinutes: 720,
      notes: "Same reduced-frequency exception shape as California's small-HOA rule.",
    },
    {
      parameter: "DISINFECTANT_AND_PH",
      bodyOfWaterCategory: "SPA",
      cadence: "daily before opening, then at least every 2 hours until closing",
      intervalMinutes: 120,
      notes: "Tighter cadence than pools -- same spa-gets-shorter-intervals pattern seen in other states.",
    },
    { parameter: "COMBINED_CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "if used", cadence: "weekly", intervalMinutes: 10080 },
    { parameter: "COMBINED_CHLORINE", bodyOfWaterCategory: "SPA", appliesWhen: "if used", cadence: "daily", intervalMinutes: 1440, notes: "15.51(2)e(4) -- notably more frequent than the pool requirement." },
    { parameter: "CYANURIC_ACID", bodyOfWaterCategory: "POOL", appliesWhen: "if used", cadence: "weekly", intervalMinutes: 10080 },
    { parameter: "CYANURIC_ACID", bodyOfWaterCategory: "SPA", appliesWhen: "if used", cadence: "daily", intervalMinutes: 1440, notes: "15.51(2)e(5) -- same tighter-cadence pattern as combined chlorine." },
    { parameter: "BACTERIAL_SAMPLE", cadence: "monthly", intervalMinutes: 43200, notes: "Total coliform lab sample, both pools and spas." },
  ],
  eventProtocols: [
    {
      triggerType: "CHEMISTRY_HAZARD_THRESHOLD",
      triggerLabel: "Cyanuric acid exceeds 80 ppm",
      closureKind: "DESCEND_BELOW_CEILING",
      reopeningCondition: "Closed if CYA exceeds 80 ppm; may reopen once CYA is 40 ppm or less -- a close/reopen pair using two different numbers, not a single ceiling. Same descend-below-ceiling shape as Florida's breakpoint chlorination reopening rule (15.4(2)a(4), 15.51(2)a(5)).",
      sourceConfidence: "confirmed",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "No fecal/vomit/blood contamination protocol of any kind exists in 641 IAC Chapter 15.",
      detail:
        "Confirmed via full-text search of the entire current chapter (~2,570 lines) for 'fecal', 'stool', 'vomit', 'diarrhea', and 'blood' -- zero matches. Independently verified against both the 2020 and 2025 versions, so this is a long-standing gap, not a rewrite-related loss. Do not infer a protocol from Iowa's general superchlorination/closure language (15.4(4)a), which covers direct chemical additions only, unrelated to bodily-fluid incidents.",
    },
    {
      kind: "GAP",
      summary: "Total alkalinity and calcium hardness have no stated numeric target range OR test cadence anywhere in the current (9/24/25) rewrite.",
      detail:
        "Neither parameter appears in 15.4(2)/15.51(2)'s water-quality table at all -- no min/max is stated, confirmed via full-text search of the current chapter, so no ChemistryThreshold row is seeded for either (a genuine absence, not a placeholder omission). The prior (2020) version also required test cadences (alkalinity weekly, hardness monthly) that the current Test Frequency subsection (15.4(2)e / 15.51(2)e) no longer states either -- so this rewrite dropped both the range and the cadence, not just the cadence. Both parameters remain required test-kit equipment (15.4(2)f) and required record fields (15.4(6)), so they're clearly still meant to be tracked -- Iowa's own rule just doesn't say against what number. No FrequencyRule rows seeded for either parameter rather than inventing a cadence.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "Water clarity closure is depth-conditional, not a flat rule: pools under 8 ft closed if main-drain grate openings aren't visible from the deck; pools 8 ft or deeper closed if the main drain itself isn't visible; spas closed if drain-fitting grates aren't visible with agitation off.",
      detail: "Not modeled as its own EventProtocol row this pass -- no existing closureKind cleanly represents a depth-conditional visual-inspection rule. Noted here for a future pass if AquaRunner starts tracking pool depth against clarity-closure logic.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Administering-agency name is ambiguous between the code's own 'Public Health[641]' header and DIAL's stated current registration role.",
      detail: "Seeded healthDepartmentName to reflect both; if AquaRunner customers need a single point of contact, DIAL is the practical answer for registration specifically, per DIAL's own site.",
    },
  ],
};


// ---------------------------------------------------------------------------
// Kansas -- K.A.R. 4-27-16, within Article 27 "Lodging Establishments" of the Kansas
// Administrative Regulations. Genuinely different agency-type pattern: this rule is
// administered by the Kansas Department of Agriculture (Agency 4), not a health
// department -- Kansas regulates general public/hotel pools as a hospitality-licensing
// function. A separate KDHE rule (K.A.R. 28-4-129) may govern youth-camp/child-care pools
// under a different agency entirely; not researched this pass.
//
// ★ Source-confidence flag, unlike every other state seeded so far: every direct fetch of
// the primary regulation text returned HTTP 403 or an unreachable archive.org route. Every
// figure below comes from two independent secondary extractions that agree with each other
// (a Cornell LII summary + an independently-phrased web search landing on the same
// figures), not a direct primary-text read. sourceConfidence is set to "assumption"
// throughout (not "confirmed") per state-compliance-data.md's own explicit recommendation
// -- a primary-source read of K.A.R. 4-27-16 is still owed before treating this as fully
// verified, same shape as Maryland's source-confidence flag.
// ---------------------------------------------------------------------------
const KANSAS: StateSeed = {
  state: "KS",
  ruleset: {
    stateName: "Kansas",
    healthDepartmentName: "Kansas Department of Agriculture (Agency 4) -- not KDHE. Regulated under Article 27, \"Lodging Establishments,\" a hospitality-licensing function rather than a health-department one.",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation: "K.A.R. 4-27-16, \"Swimming pools, recreational water facilities, and hot tubs,\" Article 27 (Lodging Establishments), Kansas Administrative Regulations",
    sourceDocument: "Corroborated via two independent secondary extractions (Cornell LII summary + independent web search cross-check) -- direct primary-text fetch was blocked (HTTP 403) every attempt this pass.",
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes: "No state-provided form surfaced in any source reviewed.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under K.A.R. 4-27-16.

*Sourcing note: every direct fetch of the primary regulation text was blocked this pass —
these figures are corroborated from two independent secondary sources, not a direct
primary-text read.*

### Chemistry targets
- **Disinfectant residual (chlorine or bromine):** 1.0 – 5.0 ppm (pools), 2.0 – 5.0 ppm
  (hot tubs) — Kansas doesn't split chlorine and bromine into separate figures
- **pH:** 7.0 – 8.0

### Fecal/vomit response
Formed stool or vomiting: close 30–60 minutes, raise disinfectant to 2.0 ppm, restore pH
to 7.2–7.8. Diarrheal stool: drain and close, raise disinfectant to 20.0 ppm for at least
8 hours. Hot tubs specifically: complete drain and manufacturer-spec disinfection for any
contamination type, no partial-treatment option.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Kansas
Department of Agriculture's own published code. Verify against the authoritative source
for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, maxValue: 5.0, unit: "ppm", sourceConfidence: "assumption", notes: "Source states 'disinfectant residual (chlorine or bromine)' as one combined figure for pools/recreational water facilities, not split by chemical -- same range written here and on the BROMINE/POOL row below." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 2.0, maxValue: 5.0, unit: "ppm", sourceConfidence: "assumption", notes: "Source's 'hot tubs' figure." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 1.0, maxValue: 5.0, unit: "ppm", sourceConfidence: "assumption", notes: "Same combined 'disinfectant residual' figure as FREE_CHLORINE/POOL above -- Kansas's source doesn't give bromine its own separate number." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 2.0, maxValue: 5.0, unit: "ppm", sourceConfidence: "assumption" },
    { parameter: "PH", minValue: 7.0, maxValue: 8.0, unit: "", sourceConfidence: "assumption", notes: "Applies to all body types per both sources; no separate pool/spa split found." },
    // No CYANURIC_ACID or TOTAL_ALKALINITY row -- confirmed absent from both sources
    // reviewed (not mentioned anywhere), see the matching GAP ComplianceNote below.
  ],
  frequencyRules: [],
  eventProtocols: [
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Formed stool or vomiting (vomiting follows the same protocol, no separate track)",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 30,
      reopeningCondition: "Close the pool for 30-60 minutes; raise disinfectant to 2.0 ppm; maintain pH 7.2-7.8; return to normal operating range before reopening.",
      remediationSteps: "Remove material with a scoop and dispose of it sanitarily -- vacuuming is explicitly prohibited.",
      sourceConfidence: "assumption",
      notes: "Vomiting is explicitly routed to this same formed-stool procedure, not given its own lighter track.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal (loose stool) fecal accident",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 480,
      reopeningCondition: "Drain and close the pool; raise disinfectant to 20.0 ppm and maintain pH 7.2-7.8 for a minimum of 8 hours (stated purpose: Cryptosporidium inactivation).",
      remediationSteps: "Backwash the filter, replacing it if needed.",
      sourceConfidence: "assumption",
      notes: "The 8-hour hold is notably shorter than Delaware's (~12.75 hr) and Indiana's (~12.75-30 hr) diarrheal protocols for a comparable 20 ppm target -- worth flagging as a real outlier once primary-verified, not assumed to be a transcription error given it's independently corroborated by two sources.",
    },
    {
      triggerType: "FECAL_OR_VOMIT_OR_BLOOD",
      triggerLabel: "Any contamination incident in a hot tub specifically",
      appliesWhen: "hot tub",
      closureKind: "UNTIL_RETEST_PASSES",
      reopeningCondition: "No partial-treatment option: all guests must leave and the water must be completely drained, followed by disinfection per manufacturer specification and filter replacement/disinfection, before reopening.",
      sourceConfidence: "assumption",
      notes: "Kansas is the only state collected so far whose hot-tub-specific incident rule skips the 'raise disinfectant and hold' option entirely and goes straight to full drain-and-refill, regardless of contamination type (formed stool, diarrhea, or vomit all get this same drain requirement in a hot tub).",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "The entire Kansas ruleset needs a primary-source read of K.A.R. 4-27-16 before its sourceConfidence can move from \"assumption\" to \"confirmed\" -- every direct fetch attempt this pass returned HTTP 403 or an unreachable archive route.",
      detail: "All figures come from two independent secondary extractions that agree with each other, not a verbatim primary-text read. Corroborated, not primary-verified -- same distinction as Maryland's source-confidence flag elsewhere in this dataset.",
    },
    {
      kind: "GAP",
      summary: "Cyanuric acid and total alkalinity are confirmed absent from both sources reviewed -- not mentioned anywhere in the regulation as extracted.",
      detail: "Consistent absence across two independent extractions, not a missed excerpt from either. No ChemistryThreshold row seeded for either parameter.",
    },
    {
      kind: "GAP",
      summary: "No pH closure trigger distinct from the routine 7.0-8.0 operating range was found in either source, and no blood-specific provision was found for contamination response.",
      detail: "Unlike Delaware/Illinois/Indiana/Iowa, which each give a wider closure band distinct from the routine pH target, Kansas's sources give only the operating range with no separate closure number -- don't assume 7.0/8.0 doubles as the closure trigger. Blood contamination is simply not addressed in either source (no exemption language the way New York/Delaware/Oregon have, and no inclusion in the fecal/vomit protocol either).",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "A separate KDHE-administered rule (K.A.R. 28-4-129, \"Swimming and wading activities\") appears to govern pools at youth camps/child care facilities specifically -- a parallel track under a different agency (Agency 28) for a different property type.",
      detail: "Not researched this pass. Flagging so AquaRunner doesn't assume K.A.R. 4-27-16 (Article 27, Dept. of Agriculture) is the only Kansas pool rule that could apply to a given customer -- a youth-camp or child-care property may fall under the KDHE rule instead.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Kentucky -- 902 KAR 10:120. Sourcing note: the Legislative Research Commission's own
// PDF endpoint returned a server error this session, so every figure below is
// corroborated across two independent extractions of the regulation (not a single
// direct primary-text read) plus the official DFS-352 log-sheet form for agency/
// citation confirmation -- one notch below states read directly from primary text.
// A 10 ppm spa-chlorine figure from one search result was explicitly rejected as
// uncorroborated; both independent extractions agree on 5 ppm. Kentucky's pH closure
// trigger is the SAME range as the routine target (no separate wider hazard band, per
// §17(1)(f)) -- so PH's hazardMin/Max are intentionally left unset rather than
// duplicating min/max. The fecal-accident closure trigger (§17(1)(i)) has no numeric
// CT/reopening standard at all -- purely a closure trigger, gated on general
// reinspection (§17(7)), not a chemistry threshold -- and no separate vomit or blood
// provision was found in either source.
// ---------------------------------------------------------------------------
const KENTUCKY: StateSeed = {
  state: "KY",
  ruleset: {
    stateName: "Kentucky",
    healthDepartmentName: "Kentucky Cabinet for Health and Family Services (CHFS)",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "902 KAR 10:120, \"Kentucky public swimming and bathing facility operations\" -- water quality at Section 8, closure conditions at Section 17, testing/record-keeping cadence at Section 8 and Section 11",
    sourceDocument:
      "902 KAR 10:120, corroborated across two independent extractions (LRC's own PDF-generation endpoint returned a server error on direct download this session); CHFS Swimming Pool Log Sheet DFS-352 (7/2022) read directly for agency/citation confirmation",
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Swimming Pool Log Sheet, DFS-352 (7/2022)",
    logSheetSourceNotes:
      "Blank weekly grid (free/combined chlorine, pH, turbidity, water temp, alkalinity, cyanuric acid per day) with a chemical-added log on the reverse. The form prints no target ranges itself, unlike Georgia's or Hawaii's forms -- all numbers below come from the regulation text.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under 902 KAR 10:120.

*Sourcing note: figures are corroborated across two independent secondary extractions of
the regulation text, not a direct primary-source read (Kentucky's own PDF-generation
endpoint errored out this pass).*

### Chemistry targets
- **Free chlorine:** 1.0 – 5.0 ppm (pools), 2.0 – 5.0 ppm (spas)
- **pH:** 7.2 – 7.8 — this exact range is also Kentucky's mandatory closure trigger, with
  no separate wider band
- **Cyanuric acid:** should not exceed 50 ppm

### Testing frequency
Disinfectant residual and pH tested at least 3 times daily, more often if bather load or
weather conditions warrant. Alkalinity and cyanuric acid tested weekly.

### Fecal/vomit/blood response
Kentucky's rule requires immediate closure for a fecal accident but states no specific
chlorine target, CT value, or hold time — reopening follows the general reinspection
process instead of a chemistry-based test.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Kentucky
Cabinet for Health and Family Services' own published code. Verify against the
authoritative source for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    {
      parameter: "PH",
      minValue: 7.2,
      maxValue: 7.8,
      unit: "",
      sourceConfidence: "assumption",
      notes:
        "§8(3). §17(1)(f) makes pH outside this SAME 7.2-7.8 range a mandatory closure trigger -- unlike Delaware/Illinois/Indiana/Iowa, Kentucky doesn't define a separate, wider closure band, so hazardMin/Max are intentionally left unset rather than duplicating min/max as a fake second tier.",
    },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, maxValue: 5.0, unit: "ppm", sourceConfidence: "assumption", notes: "§8(1)(a). Pools and diving pools." },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "SPA",
      minValue: 2.0,
      maxValue: 5.0,
      unit: "ppm",
      sourceConfidence: "assumption",
      notes: "§8(2)(a). NOT 10 ppm -- a single search result claimed that figure but it isn't corroborated by either independent extraction of the regulation itself; both agree on 5 ppm.",
    },
    {
      parameter: "CYANURIC_ACID",
      appliesWhen: "if used as stabilizer",
      maxValue: 50,
      unit: "ppm",
      sourceConfidence: "assumption",
      notes:
        "§8(1)(c)(3). Notably lower than Delaware/Illinois's 100 ppm, closer to Indiana's 60 ppm. Not confirmed as its own independent §17 closure trigger -- neither extraction found a subsection tying CYA specifically to §17's closure list; see the matching ComplianceNote (GAP) below.",
    },
    { parameter: "TOTAL_ALKALINITY", minValue: 50, maxValue: 180, unit: "ppm", sourceConfidence: "assumption", notes: "§8(5)." },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "at least three times daily, with greater frequency required if bather load or weather conditions warrant",
      intervalMinutes: 480,
      notes: "A stated baseline (3x/day) with a situational escalation clause on top -- not purely performance-based the way California's combined-chlorine cadence is, so isPerformanceBased is left false.",
    },
    { parameter: "TOTAL_ALKALINITY", cadence: "checked weekly, or more often as needed", intervalMinutes: 10080, notes: "§8(8)(c)(1)." },
    { parameter: "CYANURIC_ACID", appliesWhen: "if used", cadence: "checked weekly, or more often as needed", intervalMinutes: 10080, notes: "§8(8)(c)(2)." },
  ],
  eventProtocols: [
    {
      triggerType: "FECAL_ACCIDENT",
      triggerLabel: "A fecal accident has occurred in the pool",
      closureKind: "UNTIL_RETEST_PASSES",
      reopeningCondition:
        "§17(1)(i) requires the Cabinet to immediately order closure the moment a fecal accident occurs -- purely a closure trigger, with NO specific chlorine ppm, CT value, or hold-time requirement tied to the incident response itself in either source reviewed. Reopening follows the general §17(7) process instead: the owner requests reinspection after correcting the condition, and the Cabinet must reinspect within 10 days of written notice -- no fecal-specific chemistry threshold gates reopening the way it does in most other states collected.",
      sourceConfidence: "assumption",
      notes:
        "New triggerType (no existing FECAL_* value fit -- Kentucky's rule doesn't distinguish formed vs. diarrheal stool or attach any CT figure the way FECAL_FORMED/FECAL_DIARRHEAL do elsewhere). No separate vomit or blood provision found in either source -- 'fecal accident' appears to be the only named contamination trigger in this regulation. Don't borrow another state's CT value for Kentucky.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary:
        "Primary regulation text (902 KAR 10:120) couldn't be loaded directly this session -- LRC's own PDF-generation endpoint returned a server error. Every figure above is corroborated across two independent secondary extractions that agree with each other, plus the official DFS-352 form for agency/citation confirmation, rather than a direct primary-text read.",
      detail:
        "One notch below Delaware/Illinois/Indiana/Iowa, where the actual regulation text was read directly. Recommend a follow-up direct read to move sourceConfidence from corroborated-secondary to fully confirmed, especially for the pH-closure-equals-routine-range reading and the CYA-closure-trigger question.",
    },
    {
      kind: "GAP",
      summary: "Cyanuric acid is not confirmed as its own independent §17 mandatory-closure trigger.",
      detail:
        "§8(1)(c)(3) sets the 50 ppm ceiling as a routine standard, but neither independent extraction surfaced a subsection tying CYA specifically to §17's enumerated closure list the way pH and fecal accidents are tied to it. Treat CYA >50 ppm as a standing §8 violation rather than a confirmed §17 closure event until primary-verified.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Louisiana -- LAC Title 51, Part XXIV, Chapter 9. Genuine outlier: 0.4-0.6 ppm free
// chlorine (chlorine alone, no ammonia), the lowest floor collected in this dataset --
// read directly from the primary text, cross-checked against two independent web
// searches, not a transcription error. Otherwise the sparsest code collected: no
// enumerated closure trigger (only a general discretionary "menace to health" authority
// in §101.C), no numeric CYA or alkalinity standard, no stated testing frequency, and no
// fecal/vomit/blood protocol at all -- confirmed absent via full-text search, and
// independently re-verified that Part XXIV structurally has no further chapters (Chapter
// 1-9 only) where a missed enforcement section could be hiding, the exact failure mode
// that broke West Virginia's original pass.
// ---------------------------------------------------------------------------
const LOUISIANA: StateSeed = {
  state: "LA",
  ruleset: {
    stateName: "Louisiana",
    healthDepartmentName: "Louisiana Department of Health (LDH)",
    isSupported: true,
    jurisdictionLevel: "STATE",
    officialCitation:
      "Louisiana Administrative Code, Title 51, \"Public Health -- Sanitary Code,\" Part XXIV, \"Swimming Pools and Natural or Semi-Artificial Swimming or Bathing Places\" -- Chapter 9 (\"Disinfection and Bacteriological Quality\"), §901-§909; general closure authority at §101.C",
    sourceDocument:
      "Louisiana Administrative Code, Title 51, Part XXIV (January 2010 codification, historical notes tracing to 2002 promulgation). Re-verified via Cornell LII's chapter-range index that Part XXIV spans Chapter 1-9 only -- no higher-numbered chapter exists to have missed.",
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "No official state-issued form found, and unlike most other states' BUILT_FROM_CODE entries, Chapter 9 doesn't even state a required record-keeping field list to derive one from -- this is the weakest-possible BUILT_FROM_CODE case, not a real form substitute.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under Louisiana Administrative
Code, Title 51, Part XXIV.

### Chemistry targets
- **Free chlorine:** 0.4 – 0.6 ppm (chlorine alone), 0.7 – 1.0 ppm (with ammonia) — a real,
  primary-source-confirmed figure, the lowest in AquaRunner's dataset alongside
  Pennsylvania's
- **pH:** 7.2 – 7.8

### What Louisiana's code doesn't specify
No numeric cyanuric acid or total alkalinity standard, no stated testing frequency, and no
enumerated chemistry-based closure trigger exist anywhere in the codified chapter — all
confirmed absent, not gaps in this research. The only closure mechanism is a general
"menace to health" determination by the state health officer.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Louisiana
Department of Health's own published code. Verify against the authoritative source for
anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.2, maxValue: 7.8, unit: "", sourceConfidence: "confirmed", notes: "§905.B(1), applies uniformly to pools and spas -- Part XXIV's definitions fold hot tubs/spas/whirlpools/water parks into the one term the whole chapter regulates, same no-split pattern as Illinois." },

    // Duplicated across POOL and SPA per the mandatory FREE_CHLORINE scoping rule -- the
    // source gives one undifferentiated standard, not a body-type split.
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 0.4, maxValue: 0.6, unit: "ppm", sourceConfidence: "confirmed", notes: "§905.A, chlorine alone (no ammonia) -- the lowest free-chlorine floor collected anywhere in this dataset. Read directly from the primary regulation PDF via text extraction, independently cross-checked against two separate web searches landing on the same figure. Flag for a manual currency check: the source document is stamped January 2010 with no confirmed post-2010 amendment to Chapter 9 found." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 0.4, maxValue: 0.6, unit: "ppm", sourceConfidence: "confirmed", notes: "Same undifferentiated §905.A standard as pools -- see the POOL row's notes." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "chlorine used with ammonia (chloramine disinfection)", minValue: 0.7, maxValue: 1.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§905.A alternative method. Not a CYA-presence branch, so this doesn't need a DEFAULT_CONDITION_PRIORITY string -- the chlorine-alone row above is already the unconditional default." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", appliesWhen: "chlorine used with ammonia (chloramine disinfection)", minValue: 0.7, maxValue: 1.0, unit: "ppm", sourceConfidence: "confirmed" },

    {
      parameter: "CYANURIC_ACID",
      unit: "ppm",
      sourceConfidence: "gap",
      notes: "NOT FOUND -- no numeric ceiling stated anywhere in Chapter 9. §901.C only requires owning a test kit capable of measuring CYA 'if used'; no ceiling, no required range. Seeded as range:null (no min/max) rather than a fabricated number.",
    },
    {
      parameter: "TOTAL_ALKALINITY",
      unit: "ppm",
      sourceConfidence: "gap",
      notes: "NOT FOUND -- same shape as cyanuric acid: §901.C requires owning a test kit, but no numeric range is given anywhere in the chapter. Seeded as range:null.",
    },

    { parameter: "TEMPERATURE", maxValue: 93, unit: "°F", sourceConfidence: "confirmed", notes: "§905.D, heated pools -- the source doesn't distinguish pool vs. spa for this parameter, so left unscoped by body type (only FREE_CHLORINE/BROMINE are mandatorily body-scoped)." },
    { parameter: "CLARITY", unit: "", sourceConfidence: "confirmed", notes: "§905.C -- a black 6-inch disk on the bottom at the deepest point must be visible from the deck up to 10 yards away. Qualitative visibility standard, not an NTU number." },
  ],
  frequencyRules: [],
  eventProtocols: [
    {
      triggerType: "SAFETY_HAZARD",
      triggerLabel: "General \"menace to health\" determination by the state health officer",
      closureKind: "AUTHORITY_DISCRETIONARY",
      reopeningCondition:
        "§101.C: \"No natural or semi-artificial swimming pool or bathing place shall be operated when the water...is determined by the state health officer to be so polluted as to constitute a menace to health if used for swimming or bathing.\" A health-officer judgment call, not a bright-line chemistry number -- this is the ONLY closure mechanism found anywhere in Part XXIV. Reopens once the state health officer is satisfied the condition no longer constitutes a menace to health; no enumerated checklist or fixed retest count is stated.",
      sourceConfidence: "confirmed",
      notes:
        "Unlike Connecticut's two-tier discretionary/mandatory authority structure (architecture item 26), Louisiana has only the discretionary tier -- no separate mandatory-closure trigger exists for any specific chemistry reading, confirmed via full-text search of the entire Part XXIV document for \"shall close\"/\"shall be closed\" language (zero matches).",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "No numeric cyanuric acid ceiling exists anywhere in Chapter 9 -- confirmed absent, not a sourcing gap.",
      detail: "§901.C requires owning a CYA test kit \"if used\" but states no ceiling or target range at all.",
    },
    {
      kind: "GAP",
      summary: "No numeric total alkalinity range exists anywhere in Chapter 9 -- confirmed absent, same shape as cyanuric acid.",
    },
    {
      kind: "GAP",
      summary: "No pH/chlorine/CYA-specific mandatory closure trigger exists -- the only closure mechanism in all of Part XXIV is §101.C's general discretionary \"menace to health\" authority (modeled as the SAFETY_HAZARD EventProtocol above), confirmed via a full-text search that found zero \"shall close\"/\"shall be closed\" instances anywhere in the document.",
    },
    {
      kind: "GAP",
      summary: "No testing frequency (daily, weekly, or otherwise) is stated anywhere in Chapter 9 -- confirmed via full-text search. §901.C only requires owning a test kit, never states how often it must be used.",
      detail: "This is a more complete gap than any other state collected in this dataset -- every other state at minimum specifies some routine test cadence even when other numeric fields (CYA, alkalinity) are missing. No FrequencyRule rows seeded rather than inventing a cadence.",
    },
    {
      kind: "GAP",
      summary: "No fecal/vomit/blood contamination protocol exists anywhere in Part XXIV -- the most complete absence of an incident protocol found in this dataset.",
      detail: "A full-text search for \"fecal,\" \"vomit,\" \"stool,\" \"diarrhea,\" and \"blood\" returns exactly one match, and it's routine fecal-coliform bacteriological sampling for bathing beaches (§909.B), not an incident-response protocol. No closure trigger tied to a contamination event, no CT value, no CDC cross-reference.",
    },
    {
      kind: "ASSUMPTION",
      summary: "The 0.4-0.6 ppm free-chlorine floor is treated as Louisiana's current, still-in-force figure, even though the source document is stamped January 2010.",
      detail: "Independently corroborated by two separate web searches landing on the same 0.4 ppm figure, and Part XXIV's Cornell LII chapter-range index shows no structural gap where a newer chapter could be hiding -- but no post-2010 amendment specifically to Chapter 9 was directly confirmed either. Flag for a manual currency check before relying on this number for anything compliance-critical; don't \"correct\" it toward another state's more typical 1.0 ppm floor in the meantime.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Maine -- 10-144 CMR Chapter 202, effective 9/1/2010, no later amendment found. Fully
// sourced, no open items: closure is a discretionary Department-opinion authority (same
// shape as Connecticut), not a bright-line band, and Maine is the first state collected
// to flatly ban PHMB outright (alongside gas chlorine) rather than leave it unmapped.
// Blood is folded into the same 2.0 ppm/30 min track as formed stool and vomiting -- a
// third distinct blood-handling pattern (not exempted like NY/DE, not given its own
// heavier protocol either).
// ---------------------------------------------------------------------------
const MAINE: StateSeed = {
  state: "ME",
  ruleset: {
    stateName: "Maine",
    healthDepartmentName: "Maine Department of Health and Human Services (DHHS), Maine Center for Disease Control and Prevention (Maine CDC)",
    isSupported: true,
    jurisdictionLevel: "STATE",
    officialCitation: "10-144 CMR Chapter 202, \"Rules Relating to Public Pools and Spas\" -- Section 4(C) (Chemical Operational Parameters) and Appendix A (chemistry table), Section 4(G) (testing frequency), Section 7(B) (fecal/vomit/blood response), Section 10(B) (closure authority)",
    sourceDocument: "10-144 CMR Chapter 202, effective September 1, 2010 (Maine DHHS/Maine CDC)",
    recordRetentionMonths: 12,
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Pool Log",
    logSheetSourceNotes: "Published as a separate PDF alongside the rule on Maine CDC's own site, not embedded in the regulation text itself.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under 10-144 CMR Chapter 202.

### Chemistry targets
- **Free chlorine:** 1.0 – 3.0 ppm (pools), 4.0 – 5.0 ppm (spas)
- **Bromine:** 3.0 – 5.0 ppm (pools), 6.0 – 8.0 ppm (spas)
- **pH:** 7.2 – 7.8
- **Cyanuric acid:** 10 – 150 ppm, target 30 – 50 ppm — banned entirely indoors
- **Total alkalinity:** 60 – 180 ppm
- **PHMB:** prohibited entirely, alongside elemental chlorine gas

### Testing frequency
Disinfectant/pH tested at least 3 times per day (at least one manual reading required);
alkalinity, hardness, and cyanuric acid weekly.

### Fecal/vomit/blood response
Formed stool, vomiting, or bleeding all share one track: close, raise free chlorine to
2.0 ppm, restore pH to 7.2–7.5, hold 30 minutes. Diarrheal stool: 20 ppm for at least 8
hours. Maine does not exempt blood from closure the way some states do.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Maine CDC's
own published code. Verify against the authoritative source for anything
compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.2, maxValue: 7.8, unit: "", sourceConfidence: "confirmed", notes: "Section 4(C). Same range for pools and spas -- one unconditional row." },

    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, idealMin: 1.0, idealMax: 3.0, maxValue: 4.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Section 4(C)/Appendix A: 1.0-3.0 ppm target, 4.0 ppm hard ceiling." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 4.0, idealMin: 4.0, idealMax: 5.0, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Section 4(C)/Appendix A: 4.0-5.0 ppm target, 8.0 ppm hard ceiling. Stabilized chlorine/CYA prohibited in indoor pools (Section 4(C)(1)) -- same prohibition pattern as Delaware/Indiana/Iowa; not separately modeled as a row since the app doesn't track indoor/outdoor for this lookup." },

    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 3.0, idealMin: 3.0, idealMax: 5.0, maxValue: 7.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Section 4(C)/Appendix A: 3.0-5.0 ppm target, 7.0 ppm hard ceiling." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 6.0, idealMin: 6.0, idealMax: 8.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Section 4(C)/Appendix A: 6.0-8.0 ppm target, 10.0 ppm hard ceiling." },

    { parameter: "CYANURIC_ACID", minValue: 10, idealMin: 30, idealMax: 50, maxValue: 150, unit: "ppm", sourceConfidence: "confirmed", notes: "Appendix A (NSPI standard table). Same range for pools and spas -- one unconditional row. Prohibited entirely in indoor pools (Section 4(C)(1))." },

    // Appendix A gives a genuinely disinfectant-chemical-conditional ideal sub-range
    // (80-100 ppm for calcium/lithium/sodium hypochlorite vs. 100-120 ppm for
    // dichlor/trichlor/gas/bromine), but the outer 60-180 ppm bound is the SAME across
    // both branches -- not a CYA-present/absent split, and the app doesn't track
    // disinfectant chemical sub-type (only CHLORINE/BROMINE), so this collapses cleanly
    // to one unconditional row on the shared outer bound with no idealMin/idealMax set,
    // per the mandatory-rule guidance not to invent an appliesWhen condition the app
    // can't actually resolve. See the matching ASSUMPTION note below.
    { parameter: "TOTAL_ALKALINITY", minValue: 60, maxValue: 180, unit: "ppm", sourceConfidence: "assumption", notes: "Appendix A. Outer 60-180 ppm bound is chemical-agnostic; the ideal sub-range (80-100 vs. 100-120 ppm) depends on which chlorine compound is used, which this app doesn't track per body of water -- see ComplianceNote." },

    { parameter: "CALCIUM_HARDNESS", minValue: 150, idealMin: 200, idealMax: 400, maxValue: 1000, unit: "ppm", sourceConfidence: "confirmed", notes: "Appendix A." },

    {
      parameter: "TDS",
      unit: "ppm",
      relationalRule: "Must not exceed 1,500 ppm above the pool's start-up TDS reading -- a delta from a per-pool baseline, not a fixed absolute ceiling.",
      sourceConfidence: "confirmed",
      notes: "Not seeded as a flat maxValue since the actual limit is relative to each pool's own start-up reading, which this app doesn't track as a baseline field.",
    },

    {
      parameter: "PHMB",
      maxValue: 0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "Section 4(D). PHMB is flatly prohibited in every commercial public pool/spa in Maine -- the first state collected in this file to ban it outright rather than leave it an unmapped disinfectant type. Elemental chlorine gas is also flatly prohibited (Section 4(E)) -- a disinfection-delivery-method restriction, not a testable reading, so not modeled as its own ChemistryThreshold row; see ComplianceNote.",
    },
  ],
  frequencyRules: [
    { parameter: "DISINFECTANT_AND_PH", cadence: "at least 3 times per day, at least one of which must be a manual reading", intervalMinutes: 480, notes: "Section 4(G). Automated-controller readouts alone don't satisfy this -- at least one manual test is required daily." },
    { parameter: "COMBINED_CHLORINE", appliesWhen: "if chlorine used", cadence: "once per day", intervalMinutes: 1440 },
    { parameter: "TOTAL_ALKALINITY", cadence: "once per week", intervalMinutes: 10080 },
    { parameter: "CALCIUM_HARDNESS", cadence: "once per week", intervalMinutes: 10080 },
    { parameter: "CYANURIC_ACID", appliesWhen: "if used", cadence: "once per week", intervalMinutes: 10080 },
  ],
  eventProtocols: [
    {
      triggerType: "CHEMISTRY_HAZARD_THRESHOLD",
      triggerLabel: "Discretionary closure authority",
      closureKind: "AUTHORITY_DISCRETIONARY",
      reopeningCondition: "Section 10(B)(1): if, in the opinion of the Department, a public pool/spa is maintained or operated in a manner creating an unhealthful, unsafe, or unsanitary condition, it may be closed. Section 10(B)(2) names failure to meet clarity, sanitization, pH, safety, or bacteriological standards as qualifying conditions -- so falling outside the routine chemistry ranges is A trigger, but there's no separate, wider numeric closure band the way Delaware/Illinois/Indiana define.",
      sourceConfidence: "confirmed",
      notes: "Same discretionary-authority shape as Connecticut's CHEMISTRY_HAZARD_THRESHOLD/AUTHORITY_DISCRETIONARY row -- not a flat threshold trigger.",
    },
    {
      triggerType: "FECAL_OR_VOMIT_OR_BLOOD",
      triggerLabel: "Formed stool, vomiting, or bleeding accident",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 30,
      ctValue: 60,
      ctValueUnit: "ppm*min",
      reopeningCondition: "Close the pool/spa, remove fecal material if present, raise free chlorine to a minimum of 2.0 ppm if necessary, maintain pH 7.2-7.5, for a minimum of 30 minutes, with continuous filtration throughout (Section 7(B)(2)).",
      sourceConfidence: "confirmed",
      notes:
        "Formed stool, vomiting, and bleeding all share this ONE track -- no separate vomit-only or blood-only rule. Blood is not exempted (unlike New York/Delaware's 'does not pose a public health risk' language) and not given its own heavier protocol either -- a third distinct blood-handling pattern in this dataset. No shared-filtration cascading-closure language found anywhere in the text (confirmed via full-text review, not assumed) -- cascadesToSharedFiltration intentionally left false/unset, unlike Delaware/New York/California/Georgia/Indiana.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal fecal accident",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 480,
      ctValue: 9600,
      ctValueUnit: "ppm*min",
      reopeningCondition: "Close the pool/spa, remove fecal material, raise free chlorine to 20 ppm, maintain pH 7.2-7.5, for a minimum of 8 hours, filtration running continuously and backwashed to waste at the end of the 8 hours. Reopen once the 8 hours have elapsed AND chlorine is back within the Appendix A range (Section 7(B)(3)).",
      sourceConfidence: "confirmed",
      notes: "No CYA-present doubling clause stated in the source, unlike Delaware/New York/Oregon -- not fabricated here.",
    },
  ],
  complianceNotes: [
    {
      kind: "ASSUMPTION",
      summary: "Total alkalinity's ideal sub-range depends on which chlorine compound is used (80-100 ppm for calcium/lithium/sodium hypochlorite vs. 100-120 ppm for dichlor/trichlor/gas/bromine) -- collapsed to one unconditional row on the shared 60-180 ppm outer bound, with no idealMin/idealMax set.",
      detail: "This isn't a CYA-present/absent split, and the app doesn't track disinfectant chemical sub-type (only CHLORINE/BROMINE via disinfectionMethod), so there's no clean way to represent the conditional ideal band without inventing a lookup the app can't actually resolve. The outer 60-180 ppm bound is real and chemical-agnostic either way.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "Elemental chlorine gas is flatly prohibited as a disinfection method (Section 4(E)) -- a delivery-method restriction, not a testable chemistry reading, so not modeled as a ChemistryThreshold row.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "Section 7(C)(1) bars anyone actively ill with vomiting or diarrhea from using any public pool/spa -- a bather-exclusion policy rule, distinct from the incident-response EventProtocol rows above, not modeled as its own schema row.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Massachusetts -- 105 CMR 435.000, State Sanitary Code Chapter V. Notable: no separate
// spa chemistry track at all -- the §435.29 table applies identically to "swimming,
// wading and special purpose pools" (special purpose pool = the code's term for spas),
// the same one-flat-range shape seen in Illinois/Louisiana. Also: §435.34(2) makes the
// ROUTINE §435.29 range itself the mandatory-closure trigger (any deviation from
// §435.28-435.31 closes the pool immediately) -- the same shape independently found in
// Kentucky, not a separate wider hazard band, so hazardMin/Max stay null on the
// ChemistryThreshold rows and the mechanism is instead captured as its own
// EventProtocol. Fecal/vomit/blood: confirmed absent via full-text search of all 47
// sections plus Appendix A -- the only "blood" hit is an unrelated blood-pressure health
// warning for spa users. Currency flag: the source PDF's footer reads "3/20/98
// (Effective 2/20/98) - corrected" throughout, though a secondary reference describes
// the chapter as current through a September 2024 register entry -- the substantive
// text itself may simply not have changed since 1998, and the numbers read here are
// mainstream/unremarkable (unlike Louisiana's confirmed 0.4 ppm outlier), but this is
// flagged rather than silently assumed current.
// ---------------------------------------------------------------------------
const MASSACHUSETTS: StateSeed = {
  state: "MA",
  ruleset: {
    stateName: "Massachusetts",
    healthDepartmentName: "Massachusetts Department of Public Health (DPH) -- enforced locally by each municipality's Board of Health",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation: "105 CMR 435.000, \"Minimum Sanitation for Swimming Pools (State Sanitary Code, Chapter V)\" -- chemistry at §435.29, closure at §435.34, turnover/temperature at §435.32-435.33",
    sourceDocument: "105 CMR 435.000 (mass.gov, official PDF); footer dated 3/20/98 (Effective 2/20/98) -- corrected, secondary reference describes the chapter as current through Register 1531, September 27, 2024",
    recordRetentionMonths: 12,
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Appendix A, \"Swimming Pool Testing Records\"",
    logSheetSourceNotes:
      "Printed directly inside the regulation itself (not a separate document), with the acceptable ranges pre-printed on the form: \"FREE CHLORINE RESIDUAL (1.0-3.0)\", \"pH (7.2-7.8)\", \"TOTAL ALKALINITY (80-150 PPM)\" -- independently corroborating the §435.29 table, the same official-form-prints-the-standard pattern seen in Georgia/Hawaii. Note the form's alkalinity floor (80) reads tighter than §435.29's own stated floor (50) -- both are seeded faithfully below (the ChemistryThreshold row uses §435.29's 50-150, the discrepancy is flagged in a ComplianceNote rather than silently reconciled.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under 105 CMR 435.000.

### Chemistry targets
- **Free chlorine:** 1.0 – 3.0 ppm (applies to both pools and special-purpose/spa pools)
- **Bromine:** 2.0 – 6.0 ppm
- **pH:** 7.2 – 7.8 — this exact range doubles as Massachusetts's mandatory closure
  trigger, with no separate wider band
- **Cyanuric acid:** 30 – 100 ppm, only where a chlorinated isocyanurate is used
- **Total alkalinity:** 50 – 150 ppm
- **Combined chlorine:** must not exceed 0.2 ppm

### Testing frequency
Disinfectant/pH tested at least 4 times daily, one of which must fall during peak bather
load; alkalinity and calcium hardness weekly.

### Fecal/vomit/blood response
No protocol exists anywhere in Massachusetts's code — confirmed absent via a full-text
search, not a research gap.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the
Massachusetts Department of Public Health's own published code. Verify against the
authoritative source for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.2, maxValue: 7.8, unit: "", sourceConfidence: "confirmed", notes: "§435.29(1), applies to chlorine or bromine disinfection alike. No separate hazard tier -- see the AUTHORITY_MANDATORY EventProtocol below; §435.34(2) makes this same range the closure trigger." },
    { parameter: "TOTAL_ALKALINITY", minValue: 50, maxValue: 150, unit: "ppm", sourceConfidence: "confirmed", notes: "§435.29(1). Appendix A's printed form shows 80-150 instead of 50-150 -- see ComplianceNote (a minor form/code discrepancy, not reconciled here)." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, maxValue: 3.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§435.29(1). Not split by CYA presence/absence, and applies identically to special-purpose (spa) pools -- duplicated onto an explicit SPA row per the mandatory scoping rule, not a separate number." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 1.0, maxValue: 3.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Same flat range as pools -- §435.29(1) doesn't distinguish special-purpose pools on this parameter." },
    { parameter: "COMBINED_CHLORINE", minValue: 0.0, maxValue: 0.2, unit: "ppm", sourceConfidence: "confirmed", notes: "§435.29(1)." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.0, maxValue: 6.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§435.29(1), alternative disinfectant." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 2.0, maxValue: 6.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Same flat range as pools." },
    {
      parameter: "CYANURIC_ACID",
      minValue: 30,
      maxValue: 100,
      unit: "mg/L",
      sourceConfidence: "confirmed",
      notes: "§435.29(1). Only applies \"if used as stabilizer, or if a chlorinated isocyanurate is the disinfecting chemical\" -- unlike most states, Massachusetts states a floor (30) as well as a ceiling (100) when CYA is in use at all.",
    },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "§435.33. Special-purpose pools also get a much faster 30-minute turnover requirement (§435.32(1)(c)) vs. 8 hours for standard pools -- not modeled as a ChemistryThreshold row, no parameter for turnover rate exists in this schema yet." },
  ],
  frequencyRules: [
    { parameter: "DISINFECTANT_AND_PH", cadence: "at least 4 times daily, one of which must occur during peak bather load; pH tested simultaneously with each disinfectant residual test", intervalMinutes: 360, notes: "§435.29(2)-(3)." },
    { parameter: "TOTAL_ALKALINITY", cadence: "weekly", intervalMinutes: 10080, notes: "§435.29(4)." },
    { parameter: "CALCIUM_HARDNESS", cadence: "weekly", intervalMinutes: 10080, notes: "§435.29(4). No numeric target range exists in §435.29's table for this parameter even though a cadence is stated -- see ComplianceNote." },
    {
      parameter: "DISINFECTANT_AND_PH",
      appliesWhen: "electronic/automatic monitoring equipment in use",
      cadence: "manual verification at least once every 24 hours",
      intervalMinutes: 1440,
      notes: "§435.29(6)/§435.30 -- automation doesn't waive manual testing, only reduces its frequency; automatic equipment explicitly does not supersede the §435.29 testing requirements.",
    },
  ],
  eventProtocols: [
    {
      triggerType: "CHEMISTRY_HAZARD_THRESHOLD",
      triggerLabel: "Any reading outside the §435.28-435.31 range (chemistry, clarity, turnover, etc.)",
      closureKind: "AUTHORITY_MANDATORY",
      reopeningCondition:
        "§435.34(2): \"If at any time the pool water does not conform with the requirements set forth in 105 CMR 435.28 through 435.31, the operator shall immediately close the pool until the pool water conforms with those standards.\" Reopen once the specific out-of-range reading is corrected back within its §435.29 routine range.",
      sourceConfidence: "confirmed",
      notes:
        "The routine operating range IS the closure trigger here -- no separate, wider hazard band exists the way Nevada's does. Same shape independently found in Kentucky. Covers pH, alkalinity, CYA, and every other §435.29 reading identically -- one mechanism, not a per-parameter rule.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "No fecal/vomit/blood contamination protocol exists anywhere in 105 CMR 435.",
      detail:
        "Confirmed via full-text search of the entire regulation (all 47 numbered sections plus Appendix A) for \"fecal\", \"stool\", \"vomit\", \"diarrhea\", and \"blood\" -- zero substantive matches. The only \"blood\" hit is an unrelated blood-pressure health warning for special-purpose (spa) pool users. Fourth state confirmed via full-text search to lack this protocol in its base pool code (after Iowa, Kentucky, Louisiana).",
    },
    {
      kind: "ASSUMPTION",
      summary: "Source document's footer reads \"3/20/98 (Effective 2/20/98) - corrected\" throughout, though a secondary reference describes the chapter as current through a September 2024 register entry.",
      detail: "Assuming the substantive text hasn't been amended since 1998 even though the register index shows recent activity -- the numbers read here (1.0-3.0 ppm chlorine, 7.2-7.8 pH) are mainstream and unremarkable, giving no independent reason to suspect staleness, but this hasn't been cross-checked against a later amendment referenced only in the register index and not the document text itself.",
    },
    {
      kind: "GAP",
      summary: "Calcium hardness has a stated weekly test cadence (§435.29(4)) but no numeric target range anywhere in §435.29's chemistry table.",
      detail: "Seeded the FrequencyRule (cadence exists) without a matching ChemistryThreshold row (no range exists) -- don't infer a range from the cadence being present.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Appendix A's printed log form shows a total alkalinity floor of 80 ppm, tighter than §435.29's own stated 50 ppm floor.",
      detail: "Seeded the ChemistryThreshold row from §435.29's codified 50-150 ppm range (the actual regulation text) rather than the form's 80-150 -- the form may reflect a stricter operational practice or a transcription variance, not independently resolved this pass.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Michigan -- Mich. Admin. Code R 325.2194 ("Rule 94"). Regulated by EGLE (an
// environmental agency, not a health department -- joins Kansas as a non-health-dept
// regulator). Two new patterns: (1) a CYA-graduated MINIMUM chlorine formula -- every
// other state treats CYA purely as a ceiling, but Michigan's footnote makes the
// chlorine floor itself increase by 0.5 mg/L per 20 ppm of CYA above 40, with CYA >=80
// requiring dilution/draining rather than a chlorine number at all (isCurveBased, same
// shape as Alaska's Table E but a linear formula instead of a graph); (2) the
// fecal/vomit/blood protocol delegates its numeric CT value to each facility's own
// written Rule 94a Contingency and Emergency Response Plan, rather than the state
// stating a number itself -- a third distinct shape for this pattern in the dataset,
// alongside "state states its own CT value" and "no protocol exists." Total alkalinity
// has no numeric standard anywhere in the rules (confirmed absent, not seeded).
// ---------------------------------------------------------------------------
const MICHIGAN: StateSeed = {
  state: "MI",
  ruleset: {
    stateName: "Michigan",
    healthDepartmentName: "Michigan Department of Environment, Great Lakes, and Energy (EGLE) -- not MDHHS",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "Michigan Public Act 368 (Public Health Code), Part 125, implemented via Mich. Admin. Code R 325.2101-R 325.2197 -- chemistry at R 325.2194 (\"Rule 94\"), contamination response at R 325.2194a (\"Rule 94a\"), test equipment at R 325.2159 (\"Rule 59\")",
    sourceDocument: "EGLE's compiled Public Act and Rules Governing Public Swimming Pools, plus EGLE's December 2025 'Maximum Disinfectant Residuals and Operational Ranges' guidance document",
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "EQP1719 Public Swimming Pool Monthly Operation Report + EQP1735 Public Swimming Pool Inspection Report",
    logSheetSourceNotes: "Both current as of the December 2025/January-April 2026 revision dates on the source PDFs.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under Michigan Rule 94
(R 325.2194).

### Chemistry targets
- **Free chlorine:** 1.0 ppm (pH 7.2–7.5) or 2.0 ppm (pH 7.7–7.8) minimum without
  cyanuric acid; rises further if cyanuric acid is present
- **Bromine:** 2.0 ppm minimum, same at every pH band
- **pH:** 7.2 – 8.0 — this exact range is also Michigan's mandatory closure trigger
- **Cyanuric acid:** must not exceed 80 ppm — also the closure trigger

### Testing frequency
Disinfectant/pH tested before and during each period of use, at least once per day;
cyanuric acid weekly.

### Fecal/vomit/blood response
Michigan requires every facility to maintain its own written Contingency and Emergency
Response Plan (Rule 94a) — the state doesn't codify a single CT value or hold time itself,
delegating the specific numbers to each facility's approved plan.

*This page reflects AquaRunner's built-in rule engine, not a substitute for Michigan
EGLE's own published rules. Verify against the authoritative source for anything
compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.2, maxValue: 8.0, hazardMin: 7.2, hazardMax: 8.0, unit: "", sourceConfidence: "confirmed", notes: "Rule 94 table. EGLE's own guidance is explicit that the routine range IS the closure trigger (closure ordered when pH <7.2 or >8.0) -- same shape independently found in Kentucky and Massachusetts, not a separate wider hazard band." },

    // Free chlorine is genuinely pH-banded even in the no-CYA case (1.0 ppm for pH
    // 7.2-7.5, 2.0 ppm for pH >7.5-8.0) -- the same class of per-reading-pH-dependent
    // minimum as New York's chlorine floor, which this app's one-flat-target model
    // can't represent natively. Using "no CYA present" verbatim (matching
    // DEFAULT_CONDITION_PRIORITY) on the lower/first band as the practical default,
    // same resolution choice New York's seed makes for its own pH bands.
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "no CYA present", minValue: 1.0, unit: "ppm", sourceConfidence: "confirmed", notes: "pH 7.2-7.5 band. Chosen as the DEFAULT_CONDITION_PRIORITY default row -- see ComplianceNote on the pH-banding limitation." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "no CYA present, pH above 7.5", minValue: 2.0, unit: "ppm", sourceConfidence: "confirmed", notes: "pH >7.5-8.0 band. NOT reachable by the app's current findThreshold() lookup (not on the DEFAULT_CONDITION_PRIORITY list) -- see ComplianceNote." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", appliesWhen: "no CYA present", minValue: 1.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Table 3 applies uniformly to pools and spas -- same pH 7.2-7.5 band figure duplicated onto the SPA row per the mandatory body-scoping rule." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", appliesWhen: "no CYA present, pH above 7.5", minValue: 2.0, unit: "ppm", sourceConfidence: "confirmed" },

    // CYA-present case: the graduated minimum-chlorine formula. Seeded as a curve, not a
    // flat "with CYA" number -- the actual minimum keeps climbing as CYA rises, and
    // Rule 94 abandons the chlorine-number approach entirely at CYA >=80 (requires
    // dilution/draining instead). curveDataPoints intentionally left unset -- these are
    // real stated bands, not a graph read off an image, so the formula lives in
    // relationalRule/curveDescription as prose per the source text, not a fabricated array.
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      appliesWhen: "CYA present",
      minValue: 2.0,
      unit: "ppm",
      isCurveBased: true,
      curveDescription:
        "Base figure for CYA 20-40 ppm, pH 7.2-7.5 band. For higher CYA, Rule 94's footnote adds 0.5 mg/L to the minimum for each additional 20 ppm of CYA (or fraction thereof) above 40: CYA >40-60 ppm -> 2.5 ppm min; >60-80 ppm -> 3.0 ppm min. At CYA >=80 ppm, EGLE's guidance abandons the chlorine-minimum approach entirely and instead requires lowering CYA by draining and adding fresh water -- there is no chlorine number for that tier.",
      relationalRule: "minimumFreeChlorine(pH band, CYA ppm) = baseForBand + 0.5 * ceil(max(0, CYA - 40) / 20), for CYA < 80 ppm; at CYA >= 80 ppm, the rule requires dilution instead of a chlorine target.",
      sourceConfidence: "confirmed",
      notes: "pH 7.2-7.5 band, CYA 20-40 ppm base case. This row is the DEFAULT_CONDITION_PRIORITY default for the CYA-present branch; the pH>7.5 and higher-CYA bands are documented in curveDescription/relationalRule rather than as separate rows, since the underlying formula is 2-dimensional (pH band x CYA level).",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "SPA",
      appliesWhen: "CYA present",
      minValue: 2.0,
      unit: "ppm",
      isCurveBased: true,
      curveDescription: "Same graduated formula as the POOL/CYA-present row above -- Table 3 applies uniformly to pools and spas.",
      relationalRule: "minimumFreeChlorine(pH band, CYA ppm) = baseForBand + 0.5 * ceil(max(0, CYA - 40) / 20), for CYA < 80 ppm; at CYA >= 80 ppm, the rule requires dilution instead of a chlorine target.",
      sourceConfidence: "confirmed",
    },

    // Bromine is NOT pH-banded -- one flat minimum across both pH bands, per the source.
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Rule 94 table -- same 2.0 ppm minimum applies regardless of pH band, unlike free chlorine. No maximum stated in the source." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 2.0, unit: "ppm", sourceConfidence: "confirmed" },

    {
      parameter: "CYANURIC_ACID",
      maxValue: 80,
      hazardMax: 80,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "Rule 94(6) ceiling and EGLE's explicit closure-order threshold are the same number (80 ppm) -- same ceiling-equals-closure-trigger shape as Indiana, not a separate wider hazard band. Michigan is one of the few states in this dataset with an explicitly *named* CYA closure trigger rather than an inferred one.",
    },
    // No TOTAL_ALKALINITY row -- see the GAP ComplianceNote below. R 325.2159 only lists
    // it as a parameter a test kit "may" need to cover if EGLE determines it's
    // important, with no stated target range anywhere in the rules.
    { parameter: "TEMPERATURE", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "Rule 94(7). Source doesn't scope this to spas specifically the way most other states do -- seeded unconditional." },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "before and during each period of use, at least once per day",
      intervalMinutes: 1440,
      notes: "R 325.2194(2). Notably less frequent than most other states collected (Illinois/Indiana/Maine/Massachusetts all require 2-4x/day) -- a once-daily floor, even though EGLE's separate guidance recommends tighter operating RANGES (not frequency) as best practice.",
    },
    { parameter: "CYANURIC_ACID", appliesWhen: "if used", cadence: "at least once each week, more often if necessary", intervalMinutes: 10080, notes: "Rule 94(6)." },
  ],
  eventProtocols: [
    {
      triggerType: "CHEMISTRY_HAZARD_THRESHOLD",
      triggerLabel: "pH outside 7.2-8.0",
      closureKind: "CHEMISTRY_HAZARD_THRESHOLD",
      reopeningCondition: "EGLE advises a closure order when pH <7.2 or pH >8.0 -- the routine Rule 94 range doubles as the closure trigger. Reopen once pH is restored to 7.2-8.0.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "CHEMISTRY_HAZARD_THRESHOLD",
      triggerLabel: "Free chlorine or bromine below the Rule 94 table minimum for the current pH band",
      closureKind: "CHEMISTRY_HAZARD_THRESHOLD",
      reopeningCondition: "EGLE advises closure whenever disinfectant residual falls below the applicable Rule 94 minimum. Reopen once the residual is restored to at least that minimum.",
      sourceConfidence: "confirmed",
      notes: "Same routine-range-is-the-closure-trigger shape as the pH row above -- not a separate wider hazard band, so not duplicated as hazardMin on every FREE_CHLORINE/BROMINE row.",
    },
    {
      triggerType: "CHEMISTRY_HAZARD_THRESHOLD",
      triggerLabel: "Free chlorine above 10 ppm",
      closureKind: "DESCEND_BELOW_CEILING",
      reopeningCondition: "EGLE advises closure when free chlorine exceeds 10 ppm (tied to NSF product-label maximums, not a separate Rule 94 number). Reopens once the reading descends back to 10 ppm or below -- same mirror-case shape as Florida's breakpoint-chlorination reopening rule.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "CYA_IN_USE",
      triggerLabel: "Cyanuric acid exceeds 80 ppm",
      closureKind: "CHEMISTRY_HAZARD_THRESHOLD",
      reopeningCondition: "Rule 94(6): closure ordered when CYA exceeds 80 ppm. At this level EGLE's guidance does not offer a chlorine-adjustment path back into compliance -- reopening requires lowering CYA by draining and adding fresh water.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "FECAL_OR_VOMIT_OR_BLOOD",
      triggerLabel: "Pool polluted with feces, vomit, sewage, or other material",
      closureKind: "AUTHORITY_MANDATORY",
      reopeningCondition:
        "Rule 94(10): owner shall immediately close the pool and take actions to mitigate the pollution and restore water quality. Reopening is 'according to the contingency plan adopted by the owner under R 325.2194a' -- or, if no approved plan exists, only with department/local health department approval.",
      remediationSteps:
        "Rule 94a requires every pool owner to write and maintain their own Contingency and Emergency Response Plan covering rapid mitigation of contamination, kept on-site for review. Michigan does not state its own CT value/ppm target the way Delaware/Indiana/Maine do -- the facility's own written plan is the operative document. AquaRunner would need a customer's actual contingency plan, not a state-level number, to represent Michigan's true incident-response chemistry for a given property.",
      sourceConfidence: "gap",
      notes: "A third distinct shape for this pattern in the dataset, alongside 'state states its own CT value' (Delaware/Indiana/Maine) and 'no protocol exists at all' (Iowa/Kentucky/Louisiana/Massachusetts) -- Michigan requires *a* protocol to exist, but delegates its numbers to each facility, not the state code.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "Total alkalinity has no numeric target range anywhere in Michigan's rules.",
      detail: "R 325.2159 (Rule 59) only lists alkalinity as a parameter a test kit 'may' need to cover if EGLE determines it's important, with no stated target -- confirmed absent, not seeded, same shape as Iowa's and Hawaii's alkalinity gaps.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Free chlorine's minimum is genuinely pH-banded (1.0 ppm for pH 7.2-7.5, 2.0 ppm for pH >7.5-8.0, before even considering CYA) -- the app's DEFAULT_CONDITION_PRIORITY tie-break only handles a CYA-present/absent axis, not a pH-band axis, so the lower/first band was seeded as the resolvable default.",
      detail: "Same class of limitation as New York's pH-banded chlorine floor (see NEW_YORK's seed comment) -- a reading whose actual pH sits above 7.5 gets compared against the lower band's floor instead of the correct higher one. Properly fixing this means looking up the chlorine threshold per-reading based on that reading's own measured pH, a real code change out of scope for a data-seeding pass.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "R 325.2165(3) requires every pool to keep a blood-spill cleanup kit (medical-grade latex gloves + antimicrobial hand wipe) on hand -- a first-aid/PPE equipment requirement, not a water-treatment chemistry rule.",
    },
  ],
};


// ---------------------------------------------------------------------------
// Minnesota -- Minn. Rules Chapter 4717, "Public Swimming Pools." Sourcing note: most
// figures come from a 2016-dated primary PDF (pdftotext-verified); the cyanuric acid
// rule was separately re-verified against the current text as amended effective
// 5/4/2022 (also pdftotext-verified), since the 2016 copy predates that amendment.
// Notable: 4717.3970's enumerated closure list names only clarity and disinfectant
// residual as specific triggers -- pH and CYA are NOT independently named, only
// reachable via the general "endangers health or safety" catch-all, unlike Delaware/
// Illinois/Indiana/Kentucky/Michigan where pH is a named trigger. CYA is now fully
// banned in every indoor pool (both phase-in dates, 2/23/2022 for new and 2/23/2024
// for existing, are in the past as of this pass). No fecal/vomit/blood protocol
// exists anywhere in the chapter -- confirmed via full-text search, the fifth state
// in this dataset confirmed absent that way (after Iowa/Kentucky/Louisiana/
// Massachusetts).
// ---------------------------------------------------------------------------
const MINNESOTA: StateSeed = {
  state: "MN",
  ruleset: {
    stateName: "Minnesota",
    healthDepartmentName: "Minnesota Department of Health (MDH)",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "Minnesota Rules, Chapter 4717, \"Public Swimming Pools\" -- chemistry at 4717.1750 (\"Pool Water Condition\"), operator/record requirements at 4717.0650/4717.0750, closure list at 4717.3970 (\"Pool Closure\")",
    sourceDocument:
      "Minnesota Rules Chapter 4717, 2016 codification (Office of the Revisor of Statutes), read via direct text extraction; cyanuric acid subpart re-verified against the current text as amended effective 5/4/2022",
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "4717.0750 mandates what a pool record must contain (flow rates, chemical amounts, disinfectant residuals, pH, temperature, equipment issues, accidents) but doesn't reference a named MDH form the way Georgia's or Michigan's rules do.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under Minnesota Rules,
Chapter 4717.

### Chemistry targets
- **Free chlorine:** 1.0 – 10.0 ppm (pools), 2.0 – 10.0 ppm (spas)
- **Bromine:** 2.0 – 20.0 ppm (pools), 4.0 – 20.0 ppm (spas)
- **pH:** 7.2 – 7.8
- **Cyanuric acid:** must not exceed 100 ppm — banned entirely in every indoor pool as of
  2024
- **Total alkalinity:** 50 ppm minimum, no stated ceiling
- **Combined chlorine:** must not exceed 0.5 ppm

### Closure triggers
Enumerated triggers: water clarity failure and disinfectant residual out of range. A pH or
cyanuric acid violation only forces closure via the general "endangers health or safety"
catch-all — not independently named the way clarity and disinfectant are.

### Fecal/vomit/blood response
No protocol exists anywhere in Chapter 4717 — confirmed absent via a full-text search, not
a research gap.

### Equipment / gauge readings
Every visit also requires a flow meter reading. No state-issued log form is confirmed
to exist for Minnesota; this comes directly from 4717.0750's record-content mandate
(flow rates among what a pool record must contain), not a named form field.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Minnesota
Department of Health's own published code. Verify against the authoritative source for
anything compliance-critical.*`,
  },
  chemistryThresholds: [
    {
      parameter: "PH",
      minValue: 7.2,
      maxValue: 7.8,
      unit: "",
      sourceConfidence: "confirmed",
      notes:
        "Subp. 5. Not independently named in 4717.3970's enumerated closure list -- only clarity and disinfectant residual are named triggers there; a pH violation only forces closure via the general catch-all (item E, \"any condition that endangers the health or safety of the public\"), not as its own numbered trigger. No separate hazard band stated, so hazardMin/Max stay unset.",
    },

    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Subp. 3.A (floor), Subp. 3.C (10 ppm ceiling, applies to both pools and spas)." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 2.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Subp. 4 (floor), Subp. 3.C (ceiling)." },

    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.0, maxValue: 20.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Subp. 3.B (floor), Subp. 3.C (20 ppm ceiling, applies to both pools and spas)." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 4.0, maxValue: 20.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Subp. 4 (floor), Subp. 3.C (ceiling)." },

    { parameter: "COMBINED_CHLORINE", maxValue: 0.5, unit: "ppm", sourceConfidence: "confirmed", notes: "Subp. 3.E. Must not exceed 0.5 ppm; superchlorinate/treat if exceeded (no stated multiplier formula, unlike some other states' 10x-combined-chlorine shock rule)." },

    {
      parameter: "CYANURIC_ACID",
      maxValue: 100,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "Subp. 11.D, as amended effective 5/4/2022. Applies where CYA is used to stabilize chlorine -- necessarily outdoor pools only now, since indoor use is fully banned (see the CYA_IN_USE EventProtocol below). Not independently named in 4717.3970's closure list -- exceeding 100 ppm only triggers closure via the general catch-all, same gap as pH above.",
    },

    { parameter: "TOTAL_ALKALINITY", minValue: 50, unit: "ppm", sourceConfidence: "confirmed", notes: "Subp. 6. Floor only -- no stated ceiling anywhere in the chapter, confirmed absent rather than a missed excerpt." },

    { parameter: "TEMPERATURE", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "Subp. 1. Not scoped to spas specifically in the source -- seeded unconditional, same as Michigan's TEMPERATURE row." },
  ],
  frequencyRules: [
    {
      parameter: "CYANURIC_ACID",
      appliesWhen: "if used",
      cadence: "at least once a week",
      intervalMinutes: 10080,
      notes: "Subp. 11.C, from the 2022 amendment -- this explicit weekly minimum supersedes 4717.0750.F's looser 'not required daily' framing specifically for CYA (see the matching ComplianceNote).",
    },
    // No TOTAL_ALKALINITY frequency row: 4717.0750.F states alkalinity measurements are
    // explicitly NOT required to be recorded daily, a negative/relaxed statement rather
    // than a positive cadence to encode as intervalMinutes -- see the ComplianceNote below.
  ],
  eventProtocols: [
    {
      triggerType: "CLARITY_FAILURE",
      triggerLabel: "Water clarity failure",
      closureKind: "ENUMERATED_CHECKLIST",
      reopeningCondition: "4717.3970, item B -- one of only two specifically-named closure triggers in Minnesota's list (the other is disinfectant residual). Reopen once clarity is restored.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "CHEMISTRY_HAZARD_THRESHOLD",
      triggerLabel: "Disinfectant residual out of range",
      closureKind: "ENUMERATED_CHECKLIST",
      reopeningCondition: "4717.3970, item C -- the other specifically-named closure trigger. Reopen once free chlorine/bromine is restored to the Subp. 3/4 range.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "SAFETY_HAZARD",
      triggerLabel: "General catch-all -- any condition endangering health or safety",
      closureKind: "AUTHORITY_DISCRETIONARY",
      reopeningCondition:
        "4717.3970, item E. This is the ONLY mechanism by which a pH or cyanuric acid violation can force closure in Minnesota -- neither is independently named the way clarity and disinfectant residual are. Reopens once the department/local authority is satisfied the condition no longer applies.",
      sourceConfidence: "confirmed",
      notes: "Don't assume pH/CYA parity with states (Delaware/Illinois/Indiana/Kentucky/Michigan) where every chemistry parameter is separately enumerated in the closure list -- Minnesota's list is narrower.",
    },
    {
      triggerType: "CYA_IN_USE",
      triggerLabel: "Cyanuric acid use in an indoor pool",
      closureKind: "AUTHORITY_MANDATORY",
      reopeningCondition:
        "Subp. 11.A-B (2022 amendment): CYA use in any NEW indoor pool has been prohibited since 2/23/2022, and in any EXISTING indoor pool since 2/23/2024 -- both dates are now in the past, so the ban is fully in effect statewide for every indoor pool regardless of age. Not a close/reopen cycle so much as an outright prohibition; CYA is legal only in outdoor pools going forward.",
      sourceConfidence: "confirmed",
      notes: "A flat, dated ban rather than a phase-out window like Oregon's -- similar in shape to Delaware/Indiana/Iowa's outright indoor bans, but Minnesota's is the most recently enacted (2022) and had a longer grace period for existing installations (2 years) than most.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "No fecal/vomit/blood contamination protocol exists anywhere in Chapter 4717.",
      detail:
        "Confirmed via full-text search of the entire swimming-pool-specific portion of the chapter for \"fecal\", \"stool\", \"vomit\", \"diarrhea\", and \"blood\" -- zero matches. The only \"blood\" hits are an unrelated spa health-warning sign about blood pressure. Fifth state in this dataset confirmed via full-text search to lack this protocol (after Iowa, Kentucky, Louisiana, Massachusetts).",
    },
    {
      kind: "GAP",
      summary: "No intra-day testing frequency requirement exists anywhere in Chapter 4717.",
      detail:
        "Confirmed via full-text search -- no \"times per day\", \"hourly\", or \"twice daily\" language appears anywhere in the pool-specific sections. 4717.0750 requires disinfectant residual and pH readings recorded \"for each day the pool is open\", implying at least once daily, but no explicit multiple-tests-per-day requirement exists the way it does in Illinois/Indiana/Maine/Massachusetts/Michigan. No DISINFECTANT_AND_PH FrequencyRule row seeded rather than inventing an interval count.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Total alkalinity has a stated floor (50 ppm) but no ceiling anywhere in the chapter -- seeded as minValue only, maxValue left unset rather than borrowing another state's ceiling.",
    },
    {
      kind: "GAP",
      summary: "4717.0750.F explicitly states alkalinity and cyanuric acid measurements are NOT required to be recorded daily -- a looser cadence than every other state collected, confirmed by the rule's own text rather than inferred from silence.",
      detail: "No FrequencyRule row seeded for TOTAL_ALKALINITY since this is a negative/relaxed statement, not a positive interval to encode. CYA gets its own explicit weekly minimum from the 2022 amendment (see the CYANURIC_ACID FrequencyRule row), which supersedes this looser framing specifically for CYA.",
    },
  ],
  equipmentReadingRequirements: [
    {
      parameter: "FLOW_METER",
      notes: "No state-issued log form is confirmed to exist (see logSheetSource note) -- this requirement comes directly from 4717.0750's record-content mandate (flow rates among what a pool record must contain) rather than a named form field.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Mississippi -- not a sourcing gap, a confirmed structural absence. MSDH's own
// "Regulations" index lists five codified statewide rules and swimming pools isn't among
// them; MSDH's pool-related page is explicitly a reference "Model Code" that links out to
// the CDC's own Model Aquatic Health Code rather than stating Mississippi-specific
// numbers. Binding regulation is instead promulgated separately by each of Mississippi's
// 9 Public Health Districts (confirmed count via MSDH's own district-listing page) -- the
// same county/district-fragmented shape as Nevada/SNHD, split nine ways. No specific
// district's actual rule text was located and verified, so isSupported stays false --
// inventing numbers, or borrowing another state's, would misrepresent a structure that's
// genuinely fragmented, not merely unresearched. The CDC Model Aquatic Health Code (MAHC)
// values below are a different thing entirely: MSDH's own guidance page points operators
// to the CDC MAHC directly, so seeding its actual numbers (sourced from cmahc.org, not
// invented) as advisory reference data is representing what MSDH itself already points
// to, not fabricating a Mississippi-specific number that doesn't exist.
// ---------------------------------------------------------------------------
const MISSISSIPPI: StateSeed = {
  state: "MS",
  ruleset: {
    stateName: "Mississippi",
    healthDepartmentName:
      "Mississippi State Department of Health (MSDH) -- state-level oversight and model-code role only; actual enforcement and numeric standards belong to whichever of the 9 local Public Health Districts covers a given property.",
    isSupported: false,
    hasNoLegalRequirement: true,
    sourceDocument:
      "MSDH 'Swimming and Aquatic Health Model Code' page (confirms reference/model-document status, links to CDC MAHC); MSDH 'Regulations' index (confirms pools isn't among MSDH's five codified statewide regulations); MSDH 'Public Health Districts' page (confirms the 9-district structure).",
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.2, maxValue: 7.8, unit: "", sourceConfidence: "confirmed", notes: "CDC MAHC §5.7.3.4. Advisory reference only -- not a Mississippi legal requirement (no statewide code exists; see GAP note)." },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      appliesWhen: "no CYA present",
      minValue: 1.0,
      maxValue: 10.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "CDC MAHC §5.7.3.1.1.5. Advisory reference only.",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      appliesWhen: "CYA present",
      minValue: 2.0,
      maxValue: 10.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "CDC MAHC §5.7.3.1.3.1 (\"minimum chlorine levels should be increased by a factor of at least two when using CYA\"). Advisory reference only.",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "SPA",
      minValue: 3.0,
      maxValue: 10.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "CDC MAHC §5.7.3.1.1.5. Advisory reference only.",
    },
    {
      parameter: "BROMINE",
      disinfectionMethod: "BROMINE",
      bodyOfWaterCategory: "POOL",
      minValue: 3.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "CDC MAHC §5.7.3.1.2.2. No MAHC-cited maximum located this pass -- left null rather than guessed. Advisory reference only.",
    },
    {
      parameter: "BROMINE",
      disinfectionMethod: "BROMINE",
      bodyOfWaterCategory: "SPA",
      minValue: 4.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "CDC MAHC §5.7.3.1.2.2. Advisory reference only.",
    },
    {
      parameter: "CYANURIC_ACID",
      maxValue: 100,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "CDC MAHC §5.7.3.1.3.1. MAHC prohibits CYA entirely in spas/therapy pools, but this app doesn't yet track that distinction per body of water (same limitation as other states' body-subtype CYA notes), so this cap also shows for spas. Advisory reference only.",
    },
    { parameter: "TOTAL_ALKALINITY", minValue: 60, maxValue: 180, unit: "ppm", sourceConfidence: "confirmed", notes: "CDC MAHC §5.7.4.4.1. Advisory reference only." },
  ],
  frequencyRules: [],
  eventProtocols: [],
  complianceNotes: [
    {
      kind: "GAP",
      summary:
        "Mississippi has no statewide numeric pool chemistry regulation -- MSDH's own site confirms pools aren't among its five codified rules and its pool guidance page only links to the CDC Model Aquatic Health Code, not a Mississippi-specific standard.",
      detail:
        "Binding regulation is promulgated separately by each of Mississippi's 9 Public Health Districts. No specific district's rule text was located and verified this pass -- do not treat the CDC MAHC values on this ruleset as any specific district's actual rule. The 9 districts are not confirmed to use matching numbers, and no cross-district assumption should be made. This is the confirmed structure, not unresearched territory -- revisit per-district if/when a specific district's rule is sourced.",
    },
    {
      kind: "ASSUMPTION",
      summary:
        "The chemistry thresholds on this ruleset are CDC Model Aquatic Health Code (MAHC) reference values, not Mississippi law -- no statewide code exists. Shown to technicians as optional logging fields only.",
      detail:
        "Sourced directly from the Council for the MAHC's own published code text (cmahc.org): pH §5.7.3.4, free chlorine/CYA §5.7.3.1.1.5 and §5.7.3.1.3.1, bromine §5.7.3.1.2.2, total alkalinity §5.7.4.4.1. MSDH's own guidance page points operators to the CDC MAHC directly, so this represents what MSDH already references, not a fabricated Mississippi-specific number. isSupported stays false so closure-risk banners and the public inspector log stay off (there's nothing to enforce), but activeReadingFields() still renders these as non-required fields so a technician can optionally log against a real, commonly-referenced standard instead of nothing.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Missouri -- the one real numeric standard lives in 19 CSR 20-3.050 ("Sanitation and
// Safety Standards for Lodging Establishments"), scoped specifically to pools/spas at
// licensed lodging establishments (hotels, motels, B&Bs) -- confirmed via full-text
// review that no separate general-public-pool numeric chemistry section exists anywhere
// else in 19 CSR 20-3. Municipal pools, apartment/HOA pools, and water parks have no
// state-level numeric standard found; county health departments would likely govern
// those instead, out of scope this pass. Closure is a discretionary "menace to health"
// authority (19 CSR 20-3.020(9)), same shape as Louisiana/Connecticut/Maine -- no
// enumerated pH/chemistry-specific trigger exists. No CYA, no alkalinity, no testing
// frequency, and no fecal/vomit/blood protocol -- all confirmed absent via full-text
// search, not sourcing gaps.
// ---------------------------------------------------------------------------
const MISSOURI: StateSeed = {
  state: "MO",
  ruleset: {
    stateName: "Missouri",
    healthDepartmentName: "Missouri Department of Health and Senior Services (DHSS)",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "19 CSR 20-3.020, \"Sanitation of Public Bathing Places\" (general/no numeric standard, discretionary closure authority) and 19 CSR 20-3.050, \"Sanitation and Safety Standards for Lodging Establishments\" (swimming pool/spa subsections -- the source of every numeric figure below)",
    sourceDocument:
      "19 CSR 20-3, Rules of the Department of Health and Senior Services, Division 20, Chapter 3 -- General Sanitation (Missouri Secretary of State, official CSR PDF), read via direct text extraction",
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "No state-issued form found. 19 CSR 20-3.050 requires daily operating records (disinfectant, pH, water temp, timestamp) but doesn't reference a specific form.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under 19 CSR 20-3.050.

*Scope note: this numeric standard applies specifically to pools/spas at licensed lodging
establishments (hotels, motels, B&Bs). No state-level numeric standard was found for
municipal, apartment/HOA, or water-park pools.*

### Chemistry targets
- **Free chlorine:** 1.0 ppm minimum
- **Bromine:** 3.0 – 5.0 ppm (spas)
- **pH:** 7.2 – 7.8
- **Max spa temperature:** 104°F

### Closure authority
Missouri's only closure mechanism is a discretionary "menace to health" determination by
the Department of Health — there's no enumerated pH/chemistry-specific trigger, no stated
testing frequency, and no cyanuric acid or alkalinity standard anywhere in the chapter.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Missouri
Department of Health and Senior Services' own published code. Verify against the
authoritative source for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.2, maxValue: 7.8, unit: "", sourceConfidence: "confirmed", notes: "19 CSR 20-3.050, pools and spas at lodging establishments. No separate, wider closure band exists -- see the AUTHORITY_DISCRETIONARY EventProtocol below; this is the only pH standard Missouri states." },

    // Source states only a POOL figure for chlorine and only a SPA figure for bromine --
    // duplicated onto both body types per the mandatory scoping rule, with the
    // not-stated-for-this-body-type half flagged rather than silently assumed.
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, unit: "ppm", sourceConfidence: "confirmed", notes: "19 CSR 20-3.050: minimum 1.0 ppm maintained throughout the pool. No maximum stated." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 1.0, unit: "ppm", sourceConfidence: "assumption", notes: "Missouri's chlorine figure is stated for \"the pool\" only -- the rule doesn't separately state a spa chlorine minimum (spas instead get a bromine minimum, see below). Duplicated onto SPA per the mandatory FREE_CHLORINE scoping rule so the app's lookup resolves; treat as an assumed carryover, not a confirmed spa-specific number." },

    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 3.0, maxValue: 5.0, unit: "ppm", sourceConfidence: "confirmed", notes: "19 CSR 20-3.050: \"a minimum residual between three and five (3-5) ppm shall be maintained throughout the spa\" -- the rule text names only \"spa,\" not \"pool,\" quoted verbatim rather than assumed to also cover pools." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 3.0, maxValue: 5.0, unit: "ppm", sourceConfidence: "assumption", notes: "Missouri's bromine figure is textually spa-only (see the SPA row's notes) -- duplicated onto POOL per the mandatory BROMINE scoping rule so the app's lookup resolves for a chlorine-alternative pool. Not independently confirmed for pools; see ComplianceNote." },

    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "19 CSR 20-3.050, max spa/pool temperature." },
    // No CYANURIC_ACID or TOTAL_ALKALINITY row -- both confirmed absent via full-text
    // search of the entire chapter, see the matching GAP ComplianceNotes below.
  ],
  frequencyRules: [],
  eventProtocols: [
    {
      triggerType: "SAFETY_HAZARD",
      triggerLabel: "General \"menace to health\" determination by the Department of Health",
      closureKind: "AUTHORITY_DISCRETIONARY",
      reopeningCondition:
        "19 CSR 20-3.020(9): \"If...the Department of Health finds that any public bathing place is in any way a menace to health on account of...inefficient operation, or if the water quality is unsatisfactory for bathing purposes...Failure to properly maintain a public bathing place in a sanitary condition shall be sufficient reason to close it.\" A discretionary judgment call, not a bright-line chemistry number -- this is the only closure mechanism found anywhere in the chapter. Reopens once the Department is satisfied the condition no longer constitutes a menace to health; no enumerated checklist or fixed retest count is stated.",
      sourceConfidence: "confirmed",
      notes: "Same discretionary-authority shape as Connecticut, Louisiana, and Maine -- not a flat threshold trigger. No pH/chlorine-specific enumerated closure trigger exists within 19 CSR 20-3.050 itself.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "The state-level numeric standard applies only to pools/spas at licensed lodging establishments -- no state-level numeric standard was found for municipal pools, apartment/HOA pools, water parks, or other non-lodging public pool types.",
      detail: "Confirmed via full-text review of the entire 19 CSR 20-3 chapter -- no separate general-public-pool chemistry section exists. County-level health departments would likely govern non-lodging pools instead; not researched this pass. Relevant for AquaRunner customers whose Missouri properties aren't hotels/motels/B&Bs.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Missouri's chlorine minimum is stated for pools only and its bromine minimum is stated for spas only -- each was duplicated onto the other body type per the mandatory FREE_CHLORINE/BROMINE scoping rule, not independently confirmed for that body type.",
      detail: "The source doesn't state a spa-specific chlorine floor or a pool-specific bromine floor at all -- don't treat the duplicated rows as confirmed Missouri figures for that specific body-type/chemical combination.",
    },
    {
      kind: "GAP",
      summary: "Cyanuric acid and total alkalinity have no numeric standard anywhere in the chapter -- confirmed absent via full-text search, not a sourcing gap.",
    },
    {
      kind: "GAP",
      summary: "No explicit testing frequency (daily, weekly, or otherwise) is stated. 19 CSR 20-3.050 requires \"daily operating records\" (implying at least once-daily testing) but no explicit multiple-times-per-day requirement was found.",
      detail: "No FrequencyRule rows seeded rather than inventing a cadence beyond what the record-keeping requirement implies.",
    },
    {
      kind: "GAP",
      summary: "No fecal/vomit/blood contamination protocol exists anywhere in the sections reviewed -- confirmed via full-text search of the entire regulations document (3,150+ lines spanning multiple DHSS chapters) for \"fecal,\" \"stool,\" \"vomit,\" \"diarrhea,\" and \"blood\" in the pool/spa context, zero matches.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Montana -- ARM Title 37, Ch. 115, implemented via Circular FCS 3-2022 (revised
// 2/24/2023), DPHHS's directly-enforceable standards document. Notable: ORP is a named,
// independent critical closure trigger on its own (<650 mV), not just an optional
// controller-based alternative the way most other states treat it. CYA is banned
// outright in spas (not just capped) -- Table 2 marks it "N/A" for spas rather than
// giving it a number; the app's CYANURIC_ACID lookup is always unconditional
// (bodyOfWaterCategory: null per lib/compliance.ts), so this spa-specific ban can't be
// automatically surfaced by current app logic -- flagged via ComplianceNote, same
// limitation class as DC's indoor/outdoor axis. Alkalinity gets a genuinely softer
// enforcement track (3 consecutive failed inspections) than CYA/pH/ORP's immediate-
// closure tier -- modeled as its own N_CONSECUTIVE_FAILURES EventProtocol rather than
// flattened into the same severity. Montana also names a separate Legionella-specific
// contamination response (deferring to MAHC 2nd Ed. §6.5.3.6), distinct from its
// fecal/vomit protocol -- fecal and vomit are named together with NO blood-specific
// provision, unlike several other states.
// ---------------------------------------------------------------------------
const MONTANA: StateSeed = {
  state: "MT",
  ruleset: {
    stateName: "Montana",
    healthDepartmentName: "Montana Department of Public Health and Human Services (DPHHS), Food and Consumer Safety Section",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "Administrative Rules of Montana (ARM), Title 37, Chapter 115, implemented via Circular FCS 3-2022, \"Montana Standards for Public Swimming Pools\" (revised 2/24/2023) -- chemistry at §7.7.1 Table 2, critical-violation closures at §2.1.1, repeated-failure closures at §2.2.1, testing frequency at §7.2, fecal/vomit response at §2.4, Legionella response at §2.5",
    sourceDocument: "Circular FCS 3-2022 (DPHHS, revised 2/24/2023) -- DPHHS's directly-enforceable operative document, not informal guidance layered on a separate binding text",
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Public Swimming Pool Inspection Report + department-approved fecal incident log",
    logSheetSourceNotes: "§2.4.1(d) specifically requires a \"department approved fecal incident log\" for contamination events, on top of the standard inspection report.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under Montana Circular FCS
3-2022.

### Chemistry targets
- **Free chlorine:** 1.0 – 10.0 ppm without cyanuric acid, 2.0 – 10.0 ppm with (pools);
  3.0 – 10.0 ppm (spas, CYA banned outright)
- **Bromine:** 3.0 – 8.0 ppm (pools), 4.0 – 8.0 ppm (spas)
- **pH:** 7.2 – 7.8 — critical/immediate closure below 6.5 or above 8.0
- **ORP:** 650 mV minimum — Montana treats this as its own independent critical closure
  trigger, not just an optional controller alternative
- **Cyanuric acid:** must not exceed 50 ppm (ideal ≤15 ppm) — also the closure trigger
- **Total alkalinity:** 60 – 180 ppm, but only closes after 3 consecutive failed
  inspections, not a single reading

### Fecal/vomit response
Montana defers to the CDC's Fecal Incident Response Recommendations for the specific CT
values, requiring the Certified Pool Operator to be notified and the incident logged.
Legionella contamination is handled as a separate, distinct protocol.

*This page reflects AquaRunner's built-in rule engine, not a substitute for Montana
DPHHS's own published standards. Verify against the authoritative source for anything
compliance-critical.*`,
  },
  chemistryThresholds: [
    {
      parameter: "PH",
      minValue: 7.2,
      maxValue: 7.8,
      hazardMin: 6.5,
      hazardMax: 8.0,
      unit: "",
      sourceConfidence: "confirmed",
      notes:
        "§7.7.1 Table 2 routine range; §2.1.1(o) names pH <6.5 or >8.0 as a critical, immediate-closure violation -- a genuinely wider closure band than the routine target, same two-tier shape as Delaware/Illinois/Indiana/Iowa. Flow-through hot springs get a looser closure ceiling (up to 9.4) -- not modeled as a separate row since the app doesn't track hot-springs as a distinct facility subtype.",
    },

    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "no CYA present", minValue: 1.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§7.7.1 Table 2, unstabilized pool. DEFAULT_CONDITION_PRIORITY default row." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "CYA present", minValue: 2.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§7.7.1 Table 2, stabilized pool." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 3.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§7.7.1 Table 2. No CYA branch for spas -- CYA/stabilized chlorine is banned outright in spas (§7.5.6), not just capped." },

    { parameter: "COMBINED_CHLORINE", maxValue: 0.4, unit: "ppm", sourceConfidence: "confirmed", notes: "§7.7.1 Table 2. Same ceiling for pools and spas." },

    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 3.0, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed" },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 4.0, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed" },

    {
      parameter: "TOTAL_ALKALINITY",
      minValue: 60,
      maxValue: 180,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "§7.7.1 Table 2. Same range for pools and spas, collapsed to one unconditional row. Enforcement is genuinely softer than CYA/pH/ORP -- see the ALKALINITY_REPEATED_FAILURE EventProtocol below: falling outside this range only triggers closure after 3 consecutive inspections show the violation (§2.2.1(a)), not immediately.",
    },

    { parameter: "CALCIUM_HARDNESS", bodyOfWaterCategory: "POOL", maxValue: 1000, idealMin: 200, idealMax: 400, unit: "ppm", sourceConfidence: "confirmed", notes: "§7.7.1 Table 2." },
    { parameter: "CALCIUM_HARDNESS", bodyOfWaterCategory: "SPA", maxValue: 1000, idealMin: 100, idealMax: 200, unit: "ppm", sourceConfidence: "confirmed", notes: "§7.7.1 Table 2. Same ceiling as pools, tighter ideal band." },

    {
      parameter: "ORP",
      minValue: 650,
      hazardMin: 650,
      unit: "mV",
      sourceConfidence: "confirmed",
      notes:
        "§7.7.1 Table 2 routine target; §2.1.1(b) makes ORP <650 mV its OWN independent critical, immediate-closure trigger, regardless of what the chlorine reading shows -- every other state collected treats ORP (where mentioned at all) as an optional controller-based alternative to manual testing, not a mandatory independently-enforced parameter. hazardMin matches minValue since Montana treats the routine floor and the closure trigger as the same number.",
    },

    {
      parameter: "CYANURIC_ACID",
      maxValue: 50,
      hazardMax: 50,
      idealMax: 15,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "§7.7.1 Table 2 pool figure (50 ppm ceiling, ideal <=15 ppm), used as the unconditional default per the mandatory scoping rules since CYANURIC_ACID must resolve without body-of-water scoping. §2.1.1(c) names \"sanitizer concentration falls outside the parameters set forth in 7.7.1, Table 2\" as a critical, immediate-closure violation -- hazardMax mirrors maxValue, same ceiling-equals-closure-trigger shape as Indiana. Table 2 marks CYA \"N/A\" for spas -- CYA/stabilized chlorine (Trichlor/Dichlor) may not be used in an indoor pool or spa, or an outdoor hot water spa, at all (§7.5.6) -- see the ASSUMPTION ComplianceNote below; this app's CYANURIC_ACID lookup is always unconditional, so the spa-specific outright ban can't be automatically distinguished from the pool ceiling by current app logic.",
    },

    { parameter: "SATURATION_INDEX", minValue: -0.3, maxValue: 0.3, unit: "", sourceConfidence: "confirmed", notes: "§7.7.1 Table 2. Same range for pools and spas." },
    { parameter: "COPPER", appliesWhen: "if a copper/silver ion system is in use", maxValue: 1.3, unit: "ppm", sourceConfidence: "confirmed", notes: "§7.7.1 Table 2." },
    { parameter: "SILVER", appliesWhen: "if a copper/silver ion system is in use", maxValue: 0.10, unit: "ppm", sourceConfidence: "confirmed", notes: "§7.7.1 Table 2." },
    { parameter: "OZONE", appliesWhen: "if used", maxValue: 0.1, unit: "ppm", sourceConfidence: "confirmed", notes: "§7.7.1 Table 2, residual ozone." },

    { parameter: "TEMPERATURE", bodyOfWaterCategory: "POOL", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "§7.7.1 Table 2. Flow-through hot springs get a higher 106°F ceiling -- not modeled as a separate row, no hot-springs facility subtype tracked by this app." },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "§7.7.1 Table 2." },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      appliesWhen: "manual-feed pools (no automated controller)",
      cadence: "before opening and every 2 hours while open",
      intervalMinutes: 120,
      notes: "§7.2.",
    },
    {
      parameter: "DISINFECTANT_AND_PH",
      appliesWhen: "automated-controller pools",
      cadence: "before opening (manual) and every 4 hours while open (electronic readings permitted for the remaining daily checks)",
      intervalMinutes: 240,
      notes: "§7.2.",
    },
    { parameter: "COMBINED_CHLORINE", cadence: "before opening, daily", intervalMinutes: 1440, notes: "§7.2." },
    { parameter: "TOTAL_ALKALINITY", cadence: "weekly", intervalMinutes: 10080, notes: "§7.2." },
    { parameter: "CALCIUM_HARDNESS", cadence: "at least monthly", intervalMinutes: 43200, notes: "§7.2." },
    { parameter: "SATURATION_INDEX", cadence: "at least monthly", intervalMinutes: 43200, notes: "§7.2." },
    {
      parameter: "CYANURIC_ACID",
      appliesWhen: "if used",
      cadence: "at least monthly per Circular §7.2.8",
      intervalMinutes: 43200,
      notes:
        "sourceConfidence: conflict (FrequencyRule has no sourceConfidence column -- noted here instead). Circular FCS 3-2022 §7.2.8 (the primary enforcement document) states monthly, but a separate DPHHS Cyanuric Acid fact sheet states weekly (\"Cyanuric acid level is required to tested and recorded at least once a week\") -- two official DPHHS documents genuinely disagree, both quoted rather than one picked silently. Seeded from the Circular as the more authoritative source; see the matching GAP ComplianceNote.",
    },
  ],
  eventProtocols: [
    {
      triggerType: "ALKALINITY_REPEATED_FAILURE",
      triggerLabel: "Total alkalinity outside 60-180 ppm on 3 consecutive inspections",
      closureKind: "N_CONSECUTIVE_FAILURES",
      consecutiveFailuresRequired: 3,
      reopeningCondition: "§2.2.1(a): closure is only triggered after alkalinity has failed on 3 consecutive inspections, not on a single out-of-range reading -- a genuinely softer enforcement track than the immediate-closure tier CYA/pH/ORP get. Reopen once alkalinity is restored within 60-180 ppm.",
      sourceConfidence: "confirmed",
      notes: "New triggerType -- Montana is the first state in this dataset with an alkalinity-specific repeated-failure tier distinct from Colorado's bacterial 2-consecutive-failure rule (which covers a different parameter).",
    },
    {
      triggerType: "FECAL_OR_VOMIT",
      triggerLabel: "Fecal or vomit contamination of the pool",
      closureKind: "UNTIL_RETEST_PASSES",
      externalReferenceLabel: "CDC Fecal Incident Response, 2018 edition",
      reopeningCondition:
        "§2.4.1: the person in charge must immediately close the pool, follow the applicable procedures in the CDC Fecal Incident Response (2018 ed.), notify the Certified Pool Operator and request assistance, and document the incident using a department-approved fecal incident log. Same externally-deferred-to-CDC shape as Florida/Georgia/Hawaii -- Montana doesn't restate the CDC's numeric CT values in its own text.",
      sourceConfidence: "confirmed",
      notes:
        "Fecal and vomit are named together as one category -- no separate blood-specific provision was found anywhere in §2.4; blood isn't mentioned there at all (only as a first-aid-kit line item elsewhere in the Circular). Don't assume Montana grants a blood exemption like New York/Delaware/Oregon, or treats blood as an equal trigger like Washington -- it's simply not addressed in the contamination-response section.",
    },
    {
      triggerType: "PATHOGEN_LAB_RESULT",
      triggerLabel: "Legionella contamination",
      closureKind: "UNTIL_RETEST_PASSES",
      externalReferenceLabel: "2018 Model Aquatic Health Code (MAHC) §6.5.3.6",
      appliesWhen: "Legionella",
      reopeningCondition: "§2.5: Montana names a separate Legionella-specific contamination response, deferring to MAHC 2nd Edition §6.5.3.6 -- a distinct contamination category not seen named elsewhere in this dataset, kept separate from the fecal/vomit protocol above rather than folded into it.",
      sourceConfidence: "confirmed",
      notes: "Same distinct-category pattern as Oregon's separate Legionella response.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "Montana's own two DPHHS documents disagree on cyanuric acid test cadence: Circular FCS 3-2022 §7.2.8 states monthly, a separate DPHHS Cyanuric Acid fact sheet states weekly.",
      detail: "Seeded the FrequencyRule from the Circular (the primary enforcement document) as authoritative, with sourceConfidence: \"conflict\" on that row. Recommend treating the Circular as authoritative unless DPHHS clarifies, but this is a genuine unresolved conflict between two official sources, not a transcription error.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Cyanuric acid / stabilized chlorine is banned outright in spas and outdoor hot water spas (§7.5.6), not just capped at a lower number -- but this app's CYANURIC_ACID lookup (lib/compliance.ts) is always unconditional (bodyOfWaterCategory: null), so a spa-specific prohibition can't currently be distinguished from the pool's 50 ppm ceiling by app logic.",
      detail: "Same class of limitation as DC's indoor/outdoor chlorine-ceiling axis and New York's pH-banded chlorine floor -- a real accuracy gap for Montana spas specifically (a spa CYA reading would be evaluated against the pool's 50 ppm ceiling rather than flagged as an outright prohibited chemical). Properly fixing this means tracking body-of-water-scoped bans separately from body-of-water-scoped ranges, a real code change out of scope for a data-seeding pass. A DPHHS fact sheet gives the underlying rationale: CYA can multiply the time needed for chlorine to kill Pseudomonas aeruginosa (\"hot tub itch\") by up to 100x at even moderate concentrations.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Nebraska -- 178 NAC Chapter 2, effective 9/14/2010, no later amendment found. The
// most explicit version of the "routine range = closure trigger" pattern collected:
// 2-005.02's own header states plainly that failure to meet ANY standard in
// 2-005.02A-G (clarity, surface cleanliness, combined chlorine, disinfectant residual,
// cyanuric acid, pH, alkalinity) is grounds for immediate closure -- pH, CYA, and
// alkalinity are each individually, explicitly named triggers, not inferred from a
// general catch-all the way Illinois/Minnesota's are. CYA's ceiling and its closure
// trigger are the same number (50 ppm), same shape as Indiana. No fecal/vomit/blood
// protocol exists anywhere in Chapter 2 -- confirmed via full-text search, joining
// Iowa/Kentucky/Louisiana/Massachusetts/Minnesota/Missouri in this dataset.
// ---------------------------------------------------------------------------
const NEBRASKA: StateSeed = {
  state: "NE",
  ruleset: {
    stateName: "Nebraska",
    healthDepartmentName: "Nebraska Department of Health and Human Services (DHHS)",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "Title 178 Nebraska Administrative Code (NAC), Chapter 2, \"Operation and Management of Public Swimming Pools\" -- water quality at 178 NAC 2-005.02, testing/records at 2-005.03",
    sourceDocument: "Title 178, Nebraska DHHS -- complete title PDF, Chapter 2 (p.6+), effective 9/14/2010",
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Attachment 3 (Pool Water Quality Log Sheet) / Attachment 4 (Spa Water Quality Log Sheet)",
    logSheetSourceNotes: "Both incorporated by reference directly into 2-005.03's rule text; records kept at least 1 year.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under Title 178 NAC, Chapter 2.

### Chemistry targets
- **Free chlorine:** 2.0 ppm minimum (pools), 3.0 ppm minimum (spas), 10.0 ppm closure
  ceiling
- **Bromine:** 2.0 ppm minimum (pools), 4.0 ppm minimum (spas), 18.0 ppm closure ceiling
- **pH:** 7.2 – 7.8 — this exact range is also Nebraska's closure trigger
- **Cyanuric acid:** must not exceed 50 ppm — also the closure trigger
- **Total alkalinity:** 80 ppm minimum, no stated ceiling
- **Combined chlorine:** must not exceed 0.5 ppm

### Closure triggers
Nebraska names pH, cyanuric acid, and alkalinity individually as closure triggers, not
just via a general catch-all — failure to meet any listed standard forces immediate
closure.

### Fecal/vomit/blood response
No protocol exists anywhere in Chapter 2 — confirmed absent via a full-text search, not a
research gap.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Nebraska
Department of Health and Human Services' own published code. Verify against the
authoritative source for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    {
      parameter: "PH",
      minValue: 7.2,
      maxValue: 7.8,
      hazardMin: 7.2,
      hazardMax: 7.8,
      unit: "",
      sourceConfidence: "confirmed",
      notes: "2-005.02F. Same range for pools and spas -- one unconditional row. The umbrella closure clause (2-005.02's header) makes this exact range the mandatory-closure trigger, not a separately-stated wider band -- same shape as Kentucky/Massachusetts/Michigan.",
    },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 2.0, hazardMax: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "2-005.02D. No stated routine maximum below the 10.0 ppm closure ceiling -- that ceiling is explicitly named 'forces closure', so modeled as hazardMax rather than maxValue." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 3.0, hazardMax: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "2-005.02D." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.0, hazardMax: 18.0, unit: "ppm", sourceConfidence: "confirmed", notes: "2-005.02D. Same shape as free chlorine -- no stated routine max below the 18 ppm closure ceiling." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 4.0, hazardMax: 18.0, unit: "ppm", sourceConfidence: "confirmed" },
    {
      parameter: "COMBINED_CHLORINE",
      maxValue: 0.5,
      hazardMax: 0.5,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "2-005.02C. Same for pools and spas. The 0.5 ppm ceiling is itself the closure trigger per the umbrella clause -- same ceiling-equals-trigger shape as CYA below.",
    },
    {
      parameter: "CYANURIC_ACID",
      appliesWhen: "if cyanurates used",
      maxValue: 50,
      hazardMax: 50,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "2-005.02E: 'below 50 ppm required; at or above 50 ppm is itself the mandatory-closure condition' -- one flat ceiling, not a close/reopen pair with two different numbers the way Iowa uses.",
    },
    {
      parameter: "TOTAL_ALKALINITY",
      minValue: 80,
      hazardMin: 80,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "2-005.02G. Minimum 80 ppm for both pools and spas -- collapsed to one unconditional row. No maximum is stated anywhere in the source (confirmed, not an omission -- see ComplianceNote).",
    },
    { parameter: "TEMPERATURE", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "Same 104°F ceiling stated for both pools and spas -- seeded unconditional (source doesn't split this one by body type the way most other states' spa-only temperature cap does)." },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "before opening, then at intervals not longer than 4 hours until closing",
      intervalMinutes: 240,
      notes: "2-005.03. At least one manual test (FAS-DPD for chlorine, phenol red for pH) required daily even if an automatic controller is present.",
    },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", cadence: "before opening, then every 4 hours", intervalMinutes: 240, notes: "2-005.03. Only spa temperature has a stated cadence; pool temperature isn't separately scheduled." },
    { parameter: "TOTAL_ALKALINITY", cadence: "weekly", intervalMinutes: 10080 },
    { parameter: "COMBINED_CHLORINE", appliesWhen: "if chlorine used", cadence: "weekly", intervalMinutes: 10080 },
    { parameter: "CYANURIC_ACID", appliesWhen: "if used", cadence: "weekly", intervalMinutes: 10080 },
  ],
  eventProtocols: [
    {
      triggerType: "CHEMISTRY_HAZARD_THRESHOLD",
      triggerLabel: "Failure to meet any standard in 2-005.02A-G",
      closureKind: "AUTHORITY_MANDATORY",
      reopeningCondition:
        "2-005.02's own header: 'Failure to meet any standard in 178 NAC 2-005.02A-F is grounds for immediate closing of the swimming pool' (the span actually runs A-G: clarity, surface cleanliness, combined chlorine, disinfectant residual, cyanuric acid, pH, and alkalinity). Reopen once the specific out-of-range item is corrected back within its 2-005.02 range.",
      sourceConfidence: "confirmed",
      notes: "The most explicit version of the routine-range-is-the-closure-trigger pattern collected -- pH, CYA, and alkalinity are each individually, explicitly named, resolving the ambiguity Illinois/Minnesota leave to inference in the opposite, more explicit direction. Same AUTHORITY_MANDATORY/CHEMISTRY_HAZARD_THRESHOLD shape as Massachusetts's §435.34(2) row.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "No fecal/vomit/blood contamination protocol exists anywhere in 178 NAC Chapter 2.",
      detail:
        "Confirmed via full-text search of the entire chapter (~870 lines covering operating standards, staffing, and construction) for \"fecal\", \"stool\", \"vomit\", \"diarrhea\", and \"blood\" -- no water-treatment protocol found. The only \"blood\" hits are a first-aid-kit line item (an emergency response pack for cleaning up blood) and an unrelated spa health-warning sign about blood pressure. Joins Iowa, Kentucky, Louisiana, Massachusetts, Minnesota, and Missouri as states confirmed via full-text search to lack this protocol.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Total alkalinity has a stated minimum (80 ppm) but no stated maximum anywhere in the source, for either pools or spas.",
      detail: "Confirmed absence of an upper bound, not a missed excerpt -- seeded with minValue/hazardMin only, no maxValue/hazardMax.",
    },
  ],
};

// ---------------------------------------------------------------------------
// New Hampshire -- Env-Wq 1100, "Public Bathing Facility (PBF) Rules." Regulated by DES
// (an environmental agency, not a health department -- same non-health-dept pattern as
// Michigan/Kansas). Env-Wq 1105.13 frames every listed parameter as a "shall not allow
// bathers to use the pool... unless" condition, so the routine range doubles as the
// mandatory closure trigger for pH/chlorine/bromine/combined-chlorine/CYA alike -- same
// shape as Kentucky/Massachusetts/Michigan. New Hampshire explicitly distrusts ORP as a
// standalone sanitizer measurement (Env-Wq 1104.01(b): a controller "shall not be relied
// upon" to measure sanitizer concentration) -- the opposite stance from Montana, which
// treats ORP<650mV as its own mandatory critical-closure trigger, even though both states
// use the identical 650 mV figure. ★ Sourcing confidence flag: the fecal/vomit protocol
// isn't in the rule text itself (which only requires logging the incident) -- the actual
// numbers come from a DES guidance bulletin (WD-BB-47) that returned HTTP 403 on every
// direct-fetch attempt during research, so those figures are seeded as "assumption", not
// "confirmed", per state-compliance-data.md's own explicit flag.
// ---------------------------------------------------------------------------
const NEW_HAMPSHIRE: StateSeed = {
  state: "NH",
  ruleset: {
    stateName: "New Hampshire",
    healthDepartmentName: "New Hampshire Department of Environmental Services (DES) -- not a health department",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation: "Env-Wq 1100, \"Public Bathing Facility (PBF) Rules\" -- chemistry at Env-Wq 1105.13, testing/records at Env-Wq 1104.01/1104.03",
    sourceDocument: "Env-Wq 1100, New Hampshire Code of Administrative Rules, Public Bathing Facility Rules (full text, read via direct text extraction)",
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "No single named state form -- Env-Wq 1104.01(f)-(g) mandates what a daily log must contain (test results, filter events, fecal/vomit accident times) and requires a rolling 12-month retention, but doesn't reference a specific numbered DES form.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under New Hampshire Env-Wq
1105.13.

### Chemistry targets
- **Free chlorine:** 1.0 – 5.0 ppm (pools), 2.0 – 10.0 ppm (spas)
- **Bromine:** 2.0 – 10.0 ppm (pools and spas)
- **pH:** 7.0 – 7.8 — this exact range is also the mandatory closure trigger
- **Cyanuric acid:** must not exceed 50 ppm — also the closure trigger
- **Total alkalinity:** 60 – 180 ppm
- **Combined chlorine:** must not exceed 0.5 ppm

### Testing frequency
Disinfectant/pH tested before opening and every 4 hours during operation.

### Fecal/vomit response
New Hampshire's rule text only requires logging a fecal/vomit incident; the actual CT
values come from a separate DES guidance bulletin, not the codified rule itself.

*This page reflects AquaRunner's built-in rule engine, not a substitute for New Hampshire
DES's own published rules. Verify against the authoritative source for anything
compliance-critical.*`,
  },
  chemistryThresholds: [
    {
      parameter: "PH",
      minValue: 7.0,
      maxValue: 7.8,
      hazardMin: 7.0,
      hazardMax: 7.8,
      unit: "",
      sourceConfidence: "confirmed",
      notes:
        "Env-Wq 1105.13's 'shall not allow use unless' framing makes the routine range itself the mandatory closure trigger, with no separate wider band -- same shape as Kentucky/Massachusetts/Michigan. hazardMin/Max deliberately set equal to minValue/maxValue (not left null) so activeChemistryThresholds() surfaces a real hazard band rather than nothing, per Michigan's seed convention; see the ENUMERATED_CHECKLIST EventProtocol below for the full closure mechanism this represents.",
    },

    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, maxValue: 5.0, unit: "mg/L", sourceConfidence: "confirmed", notes: "Env-Wq 1105.13, swimming/wading/special-recreation pools." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 2.0, maxValue: 10.0, unit: "mg/L", sourceConfidence: "confirmed", notes: "Env-Wq 1105.13, therapy pools and spas -- source states one combined 'free chlorine or bromine' range for this body type; same figure duplicated on the BROMINE/SPA row below." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.0, maxValue: 10.0, unit: "mg/L", sourceConfidence: "confirmed", notes: "Env-Wq 1105.13, swimming/wading/special-recreation pools." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 2.0, maxValue: 10.0, unit: "mg/L", sourceConfidence: "confirmed", notes: "Same combined chlorine-or-bromine figure as the FREE_CHLORINE/SPA row above." },

    { parameter: "COMBINED_CHLORINE", maxValue: 0.5, hazardMax: 0.5, unit: "mg/L", sourceConfidence: "confirmed", notes: "Env-Wq 1105.13." },
    {
      parameter: "ORP",
      appliesWhen: "if a controller is used",
      minValue: 650,
      unit: "mV",
      sourceConfidence: "confirmed",
      notes:
        "Env-Wq 1104.01(b). New Hampshire explicitly states an ORP controller 'shall not be relied upon' as a substitute for measuring actual sanitizer concentration -- a real reading requirement exists but is NOT treated as sufficient on its own, the opposite stance from Montana's mandatory ORP<650mV critical-closure trigger despite the identical 650 mV number. See ComplianceNote.",
    },
    { parameter: "CYANURIC_ACID", maxValue: 50, hazardMax: 50, unit: "mg/L", sourceConfidence: "confirmed", notes: "Env-Wq 1105.13. Exceeding 50 mg/L is itself an immediate 'shall not allow use' closure condition, not a softer standing violation -- hazardMax set equal to maxValue for the same reason as PH above." },
    { parameter: "TOTAL_ALKALINITY", minValue: 60, maxValue: 180, unit: "mg/L", sourceConfidence: "confirmed", notes: "Env-Wq 1105.13." },
    { parameter: "TURBIDITY", maxValue: 2, unit: "NTU", sourceConfidence: "confirmed", notes: "Env-Wq 1105.13 -- a measured NTU ceiling, not a visual disk standard." },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "POOL", maxValue: 89, unit: "°F", sourceConfidence: "confirmed", notes: "Env-Wq 1105.13, heated swimming/wading/special-recreation pools." },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "Env-Wq 1105.13, heated therapy pools/spas." },
  ],
  frequencyRules: [
    { parameter: "DISINFECTANT_AND_PH", cadence: "prior to opening and every 4 hours during operation", intervalMinutes: 240, notes: "Env-Wq 1104.01/1104.03." },
    { parameter: "TEMPERATURE", appliesWhen: "heated pool/spa", cadence: "prior to use and every 4 hours", intervalMinutes: 240 },
    {
      parameter: "DISINFECTANT_AND_PH",
      facilityAttribute: "common_interest_bathing_facility_with_approved_automated_ph_and_disinfectant_controller",
      cadence: "once per day",
      intervalMinutes: 1440,
      notes: "A looser cadence carve-out for common-interest facilities running an approved automated controller for both pH and disinfectant -- distinct from the general 4-hour rule, same shape as California's small-HOA exception.",
    },
  ],
  eventProtocols: [
    {
      triggerType: "UNIFIED_CLOSURE_CHECKLIST",
      triggerLabel: "Any Env-Wq 1105.13 water-quality standard not met",
      closureKind: "ENUMERATED_CHECKLIST",
      reopeningCondition: "Correct the specific out-of-range parameter(s), then reopen.",
      remediationSteps:
        "Env-Wq 1105.13: 'the owner...shall not allow bathers to use the pool or spa...unless the water meets' every listed standard -- pH 7.0-7.8, free chlorine/bromine within range, combined chlorine <=0.5 mg/L, cyanuric acid <=50 mg/L, and turbidity <=2 NTU. One unified list spanning multiple chemistry parameters under a single closure mechanism, same shape as Georgia/Illinois/Delaware's enumerated checklists.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Formed-stool fecal accident",
      appliesWhen: "unverified -- from WD-BB-47 guidance bulletin, not the rule text itself",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 60,
      ctValue: 180,
      ctValueUnit: "ppm*min",
      reopeningCondition: "Raise free chlorine to 3.0 mg/L (if below that) at pH 7.2-7.5, hold for at least 1 hour before reopening.",
      externalReferenceLabel: "WD-BB-47 (2019), \"Fecal Accidents: A Protocol for Public Bathing Facilities\" (NH DES)",
      sourceConfidence: "assumption",
      notes:
        "The rule text (Env-Wq 1104.01(g)(6)) only requires logging the time and actions taken for a fecal/vomit accident -- it does not itself state a target ppm or hold time. These figures come from DES's own bulletin WD-BB-47, located but blocked (HTTP 403) on every direct-fetch attempt during research, so they're seeded from a single web-search extraction, not a direct primary-text read. Treat as assumption, not confirmed, until WD-BB-47 is read directly.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal fecal accident",
      appliesWhen: "unverified -- from WD-BB-47 guidance bulletin, not the rule text itself",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 780,
      ctValue: 15300,
      ctValueUnit: "ppm*min",
      reopeningCondition: "Raise free chlorine to 20 mg/L at pH 7.2-7.5 for at least 13 hours, OR 10 mg/L at pH 7.2-7.5 for at least 26 hours (both equivalent to CT=15,300).",
      externalReferenceLabel: "WD-BB-47 (2019), \"Fecal Accidents: A Protocol for Public Bathing Facilities\" (NH DES)",
      sourceConfidence: "assumption",
      notes:
        "Same sourcing caveat as the formed-stool row above -- not independently verified against the primary bulletin. The CT=15,300 figure independently matches the same value already sourced for New York and Indiana -- three states converging on an identical CDC/MAHC-derived number is meaningful corroboration, but doesn't substitute for reading WD-BB-47 directly. No blood-specific provision was found in either source reviewed.",
    },
  ],
  complianceNotes: [
    {
      kind: "ASSUMPTION",
      summary: "The fecal/vomit CT protocol (formed-stool and diarrheal EventProtocol rows above) is sourced from a single web-search extraction of DES bulletin WD-BB-47, not a direct read -- the bulletin returned HTTP 403 on every direct-fetch attempt during research.",
      detail: "The rule text itself (Env-Wq 1104.01(g)(6)) only requires logging the incident, not a specific chemistry protocol. Recommend a follow-up direct read of WD-BB-47 before treating these two EventProtocol rows as fully confirmed.",
    },
    {
      kind: "GAP",
      summary: "No blood-specific provision was found in either source reviewed -- neither an exemption (New York/Delaware/Oregon's 'does not pose a public health risk' language) nor inclusion in the fecal/vomit protocol.",
    },
    {
      kind: "ASSUMPTION",
      summary: "PH and CYANURIC_ACID's hazardMin/hazardMax were set equal to their routine minValue/maxValue (not left null) to represent Env-Wq 1105.13's 'routine range = closure trigger' mechanism, matching Michigan's seed convention rather than Kentucky's (which leaves hazard fields unset for the same underlying pattern) -- a real inconsistency across this dataset's seed data, not a data conflict, since both approaches describe the same rule shape differently.",
    },
  ],
};


// ---------------------------------------------------------------------------
// New Jersey -- N.J.A.C. 8:26, Chapter IX, "Public Recreational Bathing." The routine
// Appendix C/D chemistry range IS the mandatory closure trigger (§8:26-8.6(d) for pools,
// §8:26-8.7(e) for spas) -- same shape as Kentucky/Massachusetts/Michigan/Mississippi/
// Nebraska/New Hampshire. Stabilized chlorine (CYA) is flatly prohibited in every indoor
// pool and spa (§8:26-7.8(e)/7.12(g)) -- same prohibition pattern as Delaware/Indiana/
// Iowa/Minnesota/Montana; not modeled as a separate row since the app doesn't track
// indoor/outdoor per body of water. Total alkalinity is a genuine middle case: a real
// 60-180 ppm figure appears on the department's own self-inspection checklist, but a
// full-text search of all 2,824 lines of the codified rule sections themselves (§8:26-7.7
// through 7.14) never states an alkalinity standard -- seeded with sourceConfidence:
// "assumption", not "confirmed", per the source research's own explicit recommendation.
// No fecal/vomit/blood protocol exists anywhere in the chapter -- confirmed via full-text
// search, joining Iowa/Kentucky/Louisiana/Massachusetts/Minnesota/Missouri/Nebraska.
// ---------------------------------------------------------------------------
const NEW_JERSEY: StateSeed = {
  state: "NJ",
  ruleset: {
    stateName: "New Jersey",
    healthDepartmentName: "New Jersey Department of Health, Public Recreational Bathing (PRB) Project, Consumer, Environmental, and Occupational Health Services division",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "New Jersey State Sanitary Code, Chapter IX, \"Public Recreational Bathing\" (N.J.A.C. 8:26) -- chemistry at §8:26-7.7 through 7.14 and Appendices C (pools) / D (spas), closure at §8:26-8.5 through 8.7",
    sourceDocument: "New Jersey State Sanitary Code, Chapter IX, Public Recreational Bathing, full text (nj.gov), read via direct text extraction",
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "Records must be kept in a \"bound log\" (§8:26-7.12(b), cross-referencing §8:26-7.7(e)) documenting every chemical test, bather load, clarity, temperature, and weather -- the rule mandates the log's contents and binding format but doesn't name a single numbered state form. A separate self-inspection checklist (Appendix, PRB_Checklist.pdf) exists as a distinct department-published document -- it's the source of the total-alkalinity figure below, not a facility log template itself.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under N.J.A.C. 8:26.

### Chemistry targets
- **Free chlorine:** 1.0 – 10.0 ppm (pools), 2.0 – 10.0 ppm (spas)
- **Bromine:** 2.0 – 10.0 ppm (pools and spas)
- **pH:** 7.2 – 7.8 — this exact range is also New Jersey's mandatory closure trigger
- **Cyanuric acid:** 10 – 100 ppm — banned entirely in indoor pools and spas
- **Total alkalinity:** 60 – 180 ppm (department self-inspection checklist figure, not the
  codified rule text itself)
- **Combined chlorine:** must not exceed 0.2 ppm

### Fecal/vomit/blood response
No protocol exists anywhere in Chapter IX — confirmed absent via a full-text search, not a
research gap. Anyone actively recovering from diarrhea is barred from using the pool.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the New Jersey
Department of Health's own published code. Verify against the authoritative source for
anything compliance-critical.*`,
  },
  chemistryThresholds: [
    {
      parameter: "PH",
      minValue: 7.2,
      idealMin: 7.4,
      idealMax: 7.6,
      maxValue: 7.8,
      hazardMin: 7.2,
      hazardMax: 7.8,
      unit: "",
      sourceConfidence: "confirmed",
      notes: "Appendix C/D, same range for pools and spas -- one unconditional row. §8:26-8.6(d)/8.7(e) make this exact range the mandatory-closure trigger, not a separately-stated wider band.",
    },

    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "no CYA present", minValue: 1.0, idealMin: 2.0, idealMax: 4.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Appendix C. Not actually CYA-branched in the source (New Jersey states one flat pool figure) -- appliesWhen set to the DEFAULT_CONDITION_PRIORITY string anyway so this row resolves as the unconditional default without ambiguity." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 2.0, idealMin: 3.0, idealMax: 5.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Appendix D." },

    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.0, idealMin: 4.0, idealMax: 6.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Appendix C." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 2.0, idealMin: 4.0, idealMax: 6.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Appendix D -- same figures as pools." },

    { parameter: "COMBINED_CHLORINE", maxValue: 0.2, hazardMax: 0.2, unit: "ppm", sourceConfidence: "confirmed", notes: "Appendix C/D. Same ceiling for pools and spas; no minimum stated." },

    {
      parameter: "CYANURIC_ACID",
      minValue: 10,
      idealMin: 30,
      idealMax: 50,
      maxValue: 100,
      hazardMin: 10,
      hazardMax: 100,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "Appendix C/D, same range for pools and spas -- one unconditional row. Only applies to outdoor pools/spas: stabilized chlorine is flatly prohibited in every indoor pool and indoor spa (§8:26-7.8(e), §8:26-7.12(g)), same prohibition pattern as Delaware/Indiana/Iowa/Minnesota/Montana -- not modeled as a separate row since this app doesn't track indoor/outdoor per body of water. Falling outside this range is itself an immediate-closure condition under §8:26-8.6(d)/8.7(e), same umbrella mechanism as pH.",
    },

    {
      parameter: "TOTAL_ALKALINITY",
      minValue: 60,
      maxValue: 180,
      unit: "ppm",
      sourceConfidence: "assumption",
      notes:
        "Sourced only from the department's self-inspection checklist appendix (\"Total Alkalinity (60-180 ppm)\"), not from the codified rule text -- a full-text search of all 2,824 lines of §8:26-7.7 through 7.14 (the actual operative water-quality sections) never states an alkalinity standard. A real number the Department itself publishes and presumably expects facilities to meet, but a different legal weight than the Appendix C/D chlorine/pH/CYA figures. See the matching ComplianceNote.",
    },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "every 2 hours during operating hours, performed alongside each microbial sample",
      intervalMinutes: 120,
      notes: "§8:26-7.7, 7.12, same cadence for pools and spas. Automatic chemical controller systems meeting §8:26-6.13(m) may substitute for manual 2-hour testing.",
    },
    { parameter: "CYANURIC_ACID", appliesWhen: "outdoor pools/spas only, if used", cadence: "at least once per week", intervalMinutes: 10080, notes: "§8:26-7.7/7.12, test kit covering 0-100 ppm." },
    { parameter: "CLARITY", cadence: "daily", intervalMinutes: 1440 },
  ],
  eventProtocols: [
    {
      triggerType: "CHEMISTRY_HAZARD_THRESHOLD",
      triggerLabel: "Disinfectant residual or chemical/physical water quality out of range",
      closureKind: "AUTHORITY_MANDATORY",
      reopeningCondition:
        "§8:26-8.6(d): \"The swimming pool or wading pool shall close immediately if the disinfectant residual is not within the range set forth at N.J.A.C. 8:26-7.8 or if the chemical or physical water quality is not in conformance with N.J.A.C. 8:26-7.8 and 7.9.\" §8:26-8.7(e) states the identical rule for hot tubs/spas against §7.12. Reopen once the specific out-of-range reading is corrected back within its Appendix C/D range.",
      sourceConfidence: "confirmed",
      notes: "The routine Appendix C/D range is the closure trigger -- same shape as Kentucky/Massachusetts/Michigan/Mississippi/Nebraska/New Hampshire's AUTHORITY_MANDATORY/CHEMISTRY_HAZARD_THRESHOLD rows.",
    },
  ],
  complianceNotes: [
    {
      kind: "ASSUMPTION",
      summary: "Total alkalinity (60-180 ppm) is sourced only from the department's self-inspection checklist appendix, not from the codified §8:26-7.7 through 7.14 rule text itself.",
      detail: "A full-text search of the entire 2,824-line chapter for \"alkalinity\" returns exactly one hit -- the checklist figure. This sits in an unusual middle ground between a codified standard and confirmed-absent: a real number the Department itself publishes, but carrying different legal weight than the chlorine/pH/CYA figures explicitly written into the binding rule. Seeded with sourceConfidence: \"assumption\" rather than \"confirmed\" for this reason.",
    },
    {
      kind: "GAP",
      summary: "No fecal/vomit/blood contamination protocol exists anywhere in Chapter IX.",
      detail:
        "Confirmed via full-text search of the entire chapter for \"fecal\", \"stool\", \"vomit\", \"diarrhea\", and \"blood\" -- no water-treatment protocol found. The only substantive hits are a bather-exclusion notice (\"recovering from diarrhea...shall not use the pool\") and an unrelated drowning/accident report form field asking for a victim's blood-alcohol level. Joins Iowa, Kentucky, Louisiana, Massachusetts, Minnesota, Missouri, and Nebraska as states confirmed via full-text search to lack this protocol.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "A bather-exclusion rule bars anyone actively recovering from diarrhea from using any public pool/spa -- a patron-eligibility policy, distinct from the incident-response EventProtocol rows above, not modeled as its own schema row.",
    },
  ],
};

// ---------------------------------------------------------------------------
// North Carolina -- 15A NCAC 18A .2500, amended effective 7/1/2022. New enforcement
// pattern: a point-based demerit classification system (.2511(b)) sorts every violation
// into two/four/six-demerit tiers rather than a flat "shall close" rule or pure
// discretion -- six-demerit items (which include pH and every disinfectant-residual-
// related standard, .2535(3)/(4)/(5)/(7)/(8)/(9)) "warrant immediate suspension of an
// operation permit," so pH/chlorine/CYA violations function as an immediate-closure
// trigger in practice, modeled here via AUTHORITY_MANDATORY plus hazardMin/Max matching
// the routine range. CYA is the PRESUMPTIVE DEFAULT for outdoor chlorinated pools here
// (the inverse of most states' opt-in framing) unless the operator demonstrates it's
// unneeded, and elemental gas chlorine is flatly prohibited. North Carolina's
// formed-stool/vomit CT figures and its liquid-stool CT=15,300 are a primary-source
// fourth confirmation of that exact figure (after New York, Indiana, and
// secondary-sourced New Hampshire) -- the strongest evidence in this dataset that
// 15,300 is a real recurring CDC/MAHC standard, not a one-state number.
// ---------------------------------------------------------------------------
const NORTH_CAROLINA: StateSeed = {
  state: "NC",
  ruleset: {
    stateName: "North Carolina",
    healthDepartmentName:
      "North Carolina Department of Health and Human Services (DHHS), Division of Public Health, Environmental Health Services Section -- enforced through local county environmental health departments",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation: "15A NCAC 18A .2500, \"Rules Governing Public Swimming Pools\" -- chemistry at .2535 (\"Water Quality Standards\"), demerit classification at .2511 (\"Inspections\")",
    sourceDocument: "15A NCAC 18A .2500, version amended effective July 1, 2022 (NC DHHS, official PDF), read via direct text extraction",
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceLabel: "Inspection of Swimming Pool Form DENR 3960 (department's own inspection form, not a facility daily log)",
    logSheetSourceNotes: ".2535(11) requires daily/weekly operator record-keeping directly in the rule text without naming a separate facility-side log form -- DENR 3960 is the state's own inspection form, used here for confirmation only.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under 15A NCAC 18A .2535.

### Chemistry targets
- **Free chlorine:** 1.0 ppm minimum (all pool types)
- **Bromine:** 2.0 ppm minimum (all pool types)
- **pH:** 7.2 – 7.8
- **Cyanuric acid:** must not exceed 100 ppm — required by default for chlorinated
  outdoor pools unless shown to be unnecessary
- **PHMB:** 30 – 50 ppm, where used

### Enforcement — a demerit-point system, not a flat threshold
North Carolina classifies violations into 2/4/6-demerit tiers. Six-demerit items — which
include pH and every disinfectant/CYA-related standard — warrant immediate suspension of
the operating permit.

### Fecal/vomit response
Formed stool or vomit: 2 ppm free chlorine for 25 minutes (or 3 ppm for 19 minutes),
pH 7.2–7.5. Diarrheal (liquid) stool: raised chlorine and extended hold time to reach a
CT of 15,300, then backwash the filter. No blood-specific provision exists.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the North
Carolina DHHS's own published code. Verify against the authoritative source for anything
compliance-critical.*`,
  },
  chemistryThresholds: [
    {
      parameter: "PH",
      minValue: 7.2,
      maxValue: 7.8,
      hazardMin: 7.2,
      hazardMax: 7.8,
      unit: "",
      sourceConfidence: "confirmed",
      notes: ".2535. pH is explicitly named a six-demerit item (.2511(b)(3)) -- \"warrant[ing] immediate suspension of an operation permit\" -- so the routine range doubles as the closure trigger via North Carolina's point-classification system, not a separately-stated wider band.",
    },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, hazardMin: 1.0, unit: "ppm", sourceConfidence: "confirmed", notes: ".2535(3). No routine maximum stated. Disinfectant-residual violations under .2535(3)/(4)/(5)/(7)/(8)/(9) are six-demerit items -- hazardMin mirrors minValue for the same immediate-suspension reason as pH." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 1.0, hazardMin: 1.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Source doesn't split this figure by pool/spa -- same number duplicated per the mandatory scoping rule." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.0, hazardMin: 2.0, unit: "ppm", sourceConfidence: "confirmed", notes: ".2535. No routine maximum stated." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 2.0, hazardMin: 2.0, unit: "ppm", sourceConfidence: "confirmed" },
    {
      parameter: "CYANURIC_ACID",
      maxValue: 100,
      hazardMax: 100,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        ".2535(4). Six-demerit item, same immediate-suspension severity as chlorine/pH. .2535(4) makes CYA the PRESUMPTIVE DEFAULT for chlorinated pools -- \"pools that use chlorine as the disinfectant must be stabilized with cyanuric acid except at indoor pools or where it can be shown that cyanuric acid is not necessary\" -- the inverse of most states' opt-in framing. Elemental (gaseous) chlorine is flatly prohibited (.2535(9)), not modeled as its own row (a delivery-method restriction, not a testable reading).",
    },
    { parameter: "PHMB", appliesWhen: "if used as biguanide disinfectant", minValue: 30, maxValue: 50, unit: "ppm", sourceConfidence: "confirmed", notes: ".2535." },
    {
      parameter: "COPPER",
      appliesWhen: "silver/copper ion system in use",
      maxValue: 1.0,
      unit: "ppm",
      relationalRule: "A copper/silver ion system does not replace the standard chlorine requirement -- a chlorine residual per the normal FREE_CHLORINE rule must still be maintained alongside the ion system.",
      sourceConfidence: "confirmed",
      notes: ".2535.",
    },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "POOL", maxValue: 90, unit: "°F", sourceConfidence: "confirmed", notes: ".2535, heated pools." },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: ".2535, heated spas." },
    // No TOTAL_ALKALINITY row -- confirmed absent from .2535 itself, see the matching
    // GAP ComplianceNote below. A test kit and weekly recording are both required
    // (.2535(10)/(11)(d)) even though no numeric range is ever stated.
  ],
  frequencyRules: [
    { parameter: "DISINFECTANT_AND_PH", cadence: "daily", intervalMinutes: 1440, notes: ".2535(11). A once-daily floor, the lighter end of the range collected across states (similar to Michigan's once-daily cadence), not a 3-4x/day requirement." },
    { parameter: "TOTAL_ALKALINITY", cadence: "weekly", intervalMinutes: 10080, notes: ".2535(11)(d). Cadence is stated even though the numeric range itself is confirmed absent -- see the matching ChemistryThreshold GAP note." },
    { parameter: "CYANURIC_ACID", appliesWhen: "if used", cadence: "weekly", intervalMinutes: 10080, notes: ".2535(11)." },
  ],
  eventProtocols: [
    {
      triggerType: "UNIFIED_CLOSURE_CHECKLIST",
      triggerLabel: "Six-demerit violation under .2511(b)'s point classification system",
      closureKind: "AUTHORITY_MANDATORY",
      reopeningCondition:
        "A new pattern for this dataset: .2511(b) sorts every rule violation into two, four, or six-demerit items rather than a flat \"shall close\" rule or pure discretion. Six-demerit items are defined as \"failures to maintain minimum water quality or safety standards\" and \"warrant immediate suspension of an operation permit\" -- includes pH and every disinfectant-residual/CYA-related standard. Four-demerit items \"warrant denial...or notification of intent to suspend.\" Two-demerit items don't trigger permit action \"unless such violation causes an imminent hazard, a failure to meet water quality or safety standard, or a suction hazard.\" Reopen once the Department confirms the violation is corrected.",
      sourceConfidence: "confirmed",
      notes: "Genuinely different enforcement shape than any other state collected -- a point-classification system with an explicit immediate-suspension tier, not a bare threshold or a two-tier discretionary/mandatory authority like Connecticut's.",
    },
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Formed stool or vomit discharged into the pool",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 25,
      ctValue: 50,
      ctValueUnit: "ppm*min",
      reopeningCondition:
        ".2535(13): direct all bathers out of every affected pool, do not allow reentry until decontamination is complete. Remove material with a net or scoop, dispose via a sewage treatment/disposal system. Raise free available chlorine to 2 ppm at pH 7.2-7.5, confirm mixed throughout the pool, and maintain for at least 25 minutes -- OR maintain 3 ppm for at least 19 minutes instead (two equivalent CT-based options, not a single fixed number; this row seeds the 2 ppm/25 min option as primary).",
      sourceConfidence: "confirmed",
      notes: "No blood-specific provision found -- only \"feces or vomit\" are named in .2535(13); don't assume North Carolina grants a blood exemption or treats blood as an equal trigger.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Liquid (diarrheal) stool discharged into the pool",
      closureKind: "FIXED_DURATION",
      ctValue: 15300,
      ctValueUnit: "ppm*min",
      reopeningCondition: ".2535(13): raise free chlorine and extend closure time to reach a stated CT inactivation value of 15,300, then backwash the filter before reopening.",
      sourceConfidence: "confirmed",
      notes:
        "Primary-source fourth confirmation of CT=15,300 in this dataset, after New York, Indiana, and secondary-sourced New Hampshire -- the strongest evidence yet that this is a real, recurring CDC/MAHC-derived standard rather than a one-state figure.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "Total alkalinity has no numeric target range anywhere in .2535, even though a test kit and weekly recording are both required.",
      detail: ".2535(10) requires a test kit capable of measuring alkalinity; .2535(11)(d) requires weekly recording -- but no min/max ppm range is stated anywhere in the water-quality section. Confirmed absent, not a missed excerpt.",
    },
  ],
};

// ---------------------------------------------------------------------------
// North Dakota -- the state chapter (NDAC 33-29-01) is almost entirely gutted: six of
// its 15 sections, including "Right of Closure" and "Enforcement," were repealed
// effective 4/1/1993, and what survives has no pH, CYA, or alkalinity standard at all --
// confirmed via full reading of the (short, 180-line) chapter, not a sourcing gap.
// §33-29-01-12 explicitly makes local ordinances controlling wherever they're stricter,
// so -- same convention already used for Nevada/SNHD, Alabama/Baldwin County, and
// Arizona/Maricopa County in this dataset -- this entry is seeded from a specific,
// directly-read local health unit's rule (First District Health Unit, Minot, ND) as the
// representative operative standard, jurisdictionLevel: "COUNTY", rather than from the
// nearly-empty state floor. First District is confirmed via its own repeated
// self-references ("DISTRICT HEALTH UNIT, MINOT, NORTH DAKOTA") to genuinely be a North
// Dakota document -- an earlier draft of this research mistakenly filed it under
// Mississippi; that error was corrected before this file was shared for review. Not
// assumed to be identical to every other North Dakota local health unit -- no count or
// convergence check was done across North Dakota's other districts.
// ---------------------------------------------------------------------------
const NORTH_DAKOTA: StateSeed = {
  state: "ND",
  ruleset: {
    stateName: "North Dakota",
    healthDepartmentName:
      "First District Health Unit (Minot, ND) -- used as the representative North Dakota local health unit per NDAC 33-29-01-12's local-ordinances-control framing. The state's own chapter (North Dakota Department of Health, NDAC 33-29-01) has almost no numeric chemistry standard of its own -- see ComplianceNote.",
    isSupported: true,
    jurisdictionLevel: "COUNTY",
    officialCitation:
      "State floor: NDAC 33-29-01, \"Pool Facilities in North Dakota\" (six of its 15 sections, including closure/enforcement authority, repealed effective 4/1/1993). Operative local standard used below: First District Health Unit, \"Swimming Pool and Spa Rules and Regulations,\" Rule and Regulation 12, Rule 4 (chemistry) and Appendix F/G (contamination response), effective 1/1/2009.",
    sourceDocument:
      "NDAC Chapter 33-29-01 (North Dakota Legislative Branch, official PDF, read via direct text extraction); First District Health Unit's Swimming Pool and Spa Rules and Regulations (fdhu.org, official PDF, read via direct text extraction)",
    recordRetentionMonths: 36,
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "Neither the state chapter (33-29-01-08, daily pH/disinfectant/temperature records, 3-year retention) nor First District's rule (a daily log per body of water) names a specific numbered form.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas in North Dakota.

*North Dakota's own state code has almost no numeric chemistry standard left — most of its
enforcement sections were repealed in 1993. Local ordinances control instead, so these
figures come from First District Health Unit (Minot, ND) as a representative example, not
a statewide North Dakota number. A different local health unit may enforce different
figures.*

### Chemistry targets (First District)
- **Free chlorine:** 2.0 – 4.0 ppm (pools), 3.0 – 5.0 ppm (spas)
- **pH:** 7.2 – 7.8 — this exact range is also the mandatory closure trigger
- **Cyanuric acid:** should stay below 50 ppm, closes at above 100 ppm, reopen once back
  below 50 ppm

### Fecal/vomit/blood response
Formed stool, vomit, or blood: raise free chlorine to 10 mg/L for 30 minutes, reopen once
back down to 2–3 mg/L. Diarrheal stool: 20 mg/L for 13 hours.

*This page reflects AquaRunner's built-in rule engine, not a substitute for your local
North Dakota health unit's own published rules. Verify against the authoritative source
for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    {
      parameter: "PH",
      minValue: 7.2,
      maxValue: 7.8,
      hazardMin: 7.2,
      hazardMax: 7.8,
      unit: "",
      sourceConfidence: "confirmed",
      notes:
        "First District Rule 4-9.B: \"A pH value between 7.2 and 7.8 shall be maintained at all times...If the pH value falls outside this range, the pool or spa shall immediately be closed\" -- the routine range IS the closure trigger, same shape as Kentucky/Massachusetts/Michigan/Nebraska, so hazardMin/Max mirror minValue/maxValue. The state floor has NO pH standard at all -- this figure is First District's alone.",
    },

    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 2.0, maxValue: 4.0, unit: "mg/L", sourceConfidence: "confirmed", notes: "First District Rule 4. The state floor only requires a bare 1 mg/L minimum with no stated ceiling and no pool/spa split at all -- First District's tighter, more complete range is used as the operative standard here." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 3.0, maxValue: 5.0, unit: "mg/L", sourceConfidence: "confirmed", notes: "First District Rule 4." },

    {
      parameter: "CYANURIC_ACID",
      maxValue: 50,
      hazardMax: 100,
      unit: "mg/L",
      sourceConfidence: "confirmed",
      notes:
        "First District Rule 4-8: should stay below 50 mg/L; closure trigger is >100 mg/L, reopening once back below 50 mg/L specifically -- a close/reopen pair using two different numbers, same shape as Iowa's 80/40 pair. The state floor has no CYA provision at all. Unstabilized cyanuric acid is banned outright for any purpose at First District (Rule 4-8.D) -- not modeled as a separate row, see ComplianceNote.",
    },

    {
      parameter: "TOTAL_ALKALINITY",
      minValue: 60,
      maxValue: 150,
      unit: "ppm",
      sourceConfidence: "assumption",
      notes:
        "First District Rule 4: acceptable range 60-150 ppm; the ideal sub-range is chemical-conditional (80-100 ppm with hypochlorites vs. 100-120 ppm with gas chlorine/dichlor/trichlor), which this app doesn't track per body of water -- collapsed to the shared outer bound with no idealMin/idealMax, same approach as Maine's alkalinity row. The state floor has no alkalinity provision at all.",
    },

    { parameter: "BACTERIA", maxValue: 200, unit: "colonies/mL", sourceConfidence: "confirmed", notes: "State floor (33-29-01), no confirmed coliform presence permitted. First District defers to this state standard rather than stating its own number." },
    { parameter: "CLARITY", unit: "", sourceConfidence: "confirmed", notes: "State floor (33-29-01): main drain must be clearly visible from the deck. First District defers to this state standard." },

    {
      parameter: "PHMB",
      maxValue: 0,
      unit: "mg/L",
      sourceConfidence: "confirmed",
      notes: "First District Rule 4-8.E-G flatly prohibits ozone, chlorine dioxide, and PHMB -- PHMB modeled as maxValue: 0, same convention Maine and Alaska already use for their own outright chemical bans. Ozone and chlorine dioxide are delivery-method prohibitions, not testable readings, so not modeled as their own rows -- see ComplianceNote.",
    },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "daily (state floor, 33-29-01-08(2)) -- no explicit intra-day count stated by either the state chapter or First District",
      intervalMinutes: 1440,
      notes: "Neither source states a multiple-times-per-day requirement the way most other states in this dataset do -- seeded from the one number both sources agree on (at least daily), not a fabricated tighter cadence.",
    },
    {
      parameter: "CYANURIC_ACID",
      appliesWhen: "if stabilized chlorine used",
      cadence: "daily",
      intervalMinutes: 1440,
      notes: "First District Rule 4 -- notably more frequent than most other states' weekly CYA cadence collected in this dataset. Reagents replaced every 6 months or at season-start, whichever is sooner (not modeled as its own FrequencyRule row, an equipment-maintenance cadence rather than a testing one).",
    },
  ],
  eventProtocols: [
    {
      triggerType: "CYA_IN_USE",
      triggerLabel: "Cyanuric acid exceeds 100 mg/L",
      closureKind: "DESCEND_BELOW_CEILING",
      reopeningCondition: "First District Rule 4-8: closed once CYA exceeds 100 mg/L; reopen once CYA is back below 50 mg/L specifically -- the reopening threshold is a lower number than the closure trigger, not a symmetric round-trip.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "FECAL_OR_VOMIT_OR_BLOOD",
      triggerLabel: "Formed stool, vomit, or blood -- shared track",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 30,
      ctValue: 300,
      ctValueUnit: "mg/L*min",
      reopeningCondition:
        "First District Appendix F: evacuate bathers, remove material with a net/scoop (vacuuming prohibited), raise free chlorine to 10 mg/L for at least 30 minutes, document the incident. Reopen once chlorine is back down to 2-3 mg/L (sodium thiosulfate permitted to speed the reduction).",
      sourceConfidence: "confirmed",
      notes:
        "Blood is folded into this SAME track as formed stool -- not exempted the way New York/Delaware/Oregon exempt it, and not given its own heavier track either. Same approach as Maine's shared formed-stool/vomit/blood track, and the same approach the (now-corrected) Mississippi mis-citation of this exact document also showed.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrhea (liquid stool)",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 780,
      ctValue: 15600,
      ctValueUnit: "mg/L*min",
      reopeningCondition:
        "First District Appendix F: same evacuation/removal as the formed-stool track, raise free chlorine to 20.0 mg/L for 13 hours, backwash the filter to waste, reopen once back down to 2-3 mg/L.",
      sourceConfidence: "confirmed",
      notes:
        "CT=15,600 mg/L*min is close to but not identical to the 15,300 ppm*min figure Arkansas/New York/California/Delaware/Indiana independently converge on -- seeded as First District's own stated 20 mg/L/13 hr figure rather than 'corrected' toward the more common number.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary:
        "The North Dakota STATE floor (NDAC 33-29-01) has no pH, cyanuric acid, or alkalinity standard, and no closure authority at all -- \"Right of Closure,\" \"Enforcement,\" and three other sections were repealed effective 4/1/1993.",
      detail:
        "Confirmed via full reading of the current (180-line) chapter's complete table of contents -- not a sourcing gap. Every ChemistryThreshold/EventProtocol row seeded for North Dakota above comes from First District Health Unit's rule specifically, used as a directly-verified example of what a North Dakota local health unit's binding rule looks like, per §33-29-01-12's own local-ordinances-control framing -- not from the state chapter itself, which has almost nothing left to seed.",
    },
    {
      kind: "ASSUMPTION",
      summary:
        "First District Health Unit (Minot, ND) is used as North Dakota's representative jurisdiction, the same convention already used for Nevada/SNHD, Alabama/Baldwin County, and Arizona/Maricopa County -- not confirmed to match every other North Dakota local health unit's numbers.",
      detail:
        "No count of North Dakota's other local health units, and no convergence check across them, was done this pass -- unlike Mississippi's confirmed 9-district count. An AquaRunner customer under a different North Dakota health unit may be bound by different numbers than the ones seeded here.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary:
        "First District's contamination-response appendix includes a second, CDC-sourced procedure specifically for surface/deck body-fluid spills (block off the area, PPE, absorb, disinfect with a 1:9 bleach solution held 20 minutes) -- distinct from the water-treatment EventProtocol rows above, not modeled as its own schema row (a surface-cleaning procedure, not a pool-water chemistry target).",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "Stabilized chlorine is prohibited indoors and ozone/chlorine dioxide are flatly banned at First District -- delivery-method/indoor-outdoor restrictions, not testable chemistry readings, so not modeled as their own ChemistryThreshold rows beyond the PHMB ban already seeded.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Ohio -- OAC 3701-31-04. Sourcing note: the readable source PDF is a 2011-stamped
// mirror, independently cross-checked against the current codes.ohio.gov text (re-adopted
// 7/25/2024) -- every figure below matches exactly between both versions. Genuinely
// distinctive enforcement shape: pH and cyanuric acid are explicitly NOT named among the
// twelve "critical operational items" (imminent-hazard closure triggers) in paragraph
// (B)(1) -- disinfectant residual is a named trigger, pH/CYA are not, the opposite of
// most other states in this dataset where pH is either separately named or covered by a
// catch-all. The fecal/RWI response defers to the CDC's own documents, reproduced as
// embedded IMAGE pages inside Ohio's own rule (Appendix A) rather than transcribed text --
// the specific CT/ppm numbers were not independently re-extracted this pass, so those
// EventProtocol rows are seeded at sourceConfidence "assumption", not "confirmed".
// ---------------------------------------------------------------------------
const OHIO: StateSeed = {
  state: "OH",
  ruleset: {
    stateName: "Ohio",
    healthDepartmentName: "Ohio Department of Health (ODH) -- enforced through local licensors (city/county health departments)",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "Ohio Administrative Code (OAC) 3701-31-04, \"Responsibilities of the Licensee\" -- water quality at paragraph (C), disinfection at paragraph (D), imminent-hazard closures at paragraph (B)(1), fecal-accident response at Appendix A",
    sourceDocument:
      "OAC 3701-31-04, effective 4/1/2011 per the readable source PDF (poolweb.com mirror), independently cross-checked against the current codes.ohio.gov text (re-adopted 7/25/2024) -- every figure below confirmed to match both versions",
    recordRetentionMonths: 24,
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "Paragraph (B)(4)(a) specifies exactly what a written water-quality record must contain and how often, but doesn't reference a specific numbered ODH form.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under OAC 3701-31-04.

### Chemistry targets
- **Free chlorine:** 1.0 ppm minimum (pools), 2.0 ppm minimum (spas), no stated maximum
- **Bromine:** 2.0 ppm minimum (pools), 4.0 ppm minimum (spas)
- **pH:** 7.2 – 7.8 — notably, pH is NOT one of Ohio's named imminent-hazard closure
  triggers
- **Cyanuric acid:** must not exceed 70 ppm — also not a named closure trigger
- **Total alkalinity:** 60 ppm minimum, no numeric ceiling
- **Combined chlorine:** must not exceed 1.0 ppm

### Closure triggers
Twelve named imminent-hazard conditions force closure, including disinfectant residual
below minimum, equipment failure, insufficient clarity, an untreated fecal accident, and
electrical hazards — disinfectant residual is named, pH and CYA are not.

### Fecal/vomit response
Ohio incorporates the CDC's fecal-response guidance directly (embedded as image pages in
its own Appendix A rather than transcribed text) as the binding protocol until treated.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Ohio
Department of Health's own published code. Verify against the authoritative source for
anything compliance-critical.*`,
  },
  chemistryThresholds: [
    {
      parameter: "PH",
      minValue: 7.2,
      maxValue: 7.8,
      unit: "",
      sourceConfidence: "confirmed",
      notes:
        "OAC 3701-31-04(C). NOT named among the twelve imminent-hazard closure triggers in paragraph (B)(1) -- confirmed independently in both the 2011 and 2024-current text. Don't assume Ohio closes for a pH violation the way it does for disinfectant residual; see the UNIFIED_CLOSURE_CHECKLIST EventProtocol below.",
    },

    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, unit: "ppm", sourceConfidence: "confirmed", notes: "(D). Minimum only -- no maximum stated anywhere in the source for either body type." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 2.0, unit: "ppm", sourceConfidence: "confirmed", notes: "(D). Same figure applies to spray grounds/special features. Minimum only, no stated maximum." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.0, unit: "ppm", sourceConfidence: "confirmed", notes: "(D). Minimum only, no stated maximum." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 4.0, unit: "ppm", sourceConfidence: "confirmed", notes: "(D). Same figure applies to spray grounds/special features. Minimum only, no stated maximum." },

    { parameter: "COMBINED_CHLORINE", maxValue: 1.0, unit: "ppm", sourceConfidence: "confirmed", notes: "(D)." },
    {
      parameter: "CYANURIC_ACID",
      maxValue: 70,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "(D)(5). NOT named among the twelve imminent-hazard closure triggers in paragraph (B)(1) -- same non-enumerated status as pH, confirmed rather than a gap. Lower than Delaware/Illinois's 100 ppm, closer to Indiana's 60 ppm.",
    },
    {
      parameter: "TOTAL_ALKALINITY",
      minValue: 60,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "(C). Minimum 60 ppm -- no numeric ceiling exists; instead a functional cap (\"not...so high that it impairs the ability to meet other required...parameters\"). Confirmed absent as a number, not a research gap -- seeded with minValue only.",
    },
    {
      parameter: "ORP",
      appliesWhen: "automatic controllers",
      minValue: 650,
      unit: "mV",
      sourceConfidence: "confirmed",
      notes: "(D). Minimum only for controller-equipped facilities.",
    },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "POOL", maxValue: 90, unit: "°F", sourceConfidence: "confirmed", notes: "Director may approve a higher ceiling on request -- not modeled as a separate row, no per-facility-variance tracking in this schema." },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: "°F", sourceConfidence: "confirmed" },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "daily prior to bathers entering, then every 4 hours while open",
      intervalMinutes: 240,
      notes: "(B)(4)(a).",
    },
    {
      parameter: "DISINFECTANT_AND_PH",
      appliesWhen: "automatic chemical controller installed",
      cadence: "every 12 hours instead of every 4",
      intervalMinutes: 720,
      notes: "A LOOSER, not tighter, cadence with automation -- the opposite of the \"automation reduces manual checks but keeps the same base frequency\" pattern seen in most other states collected (e.g. Delaware's DPD-method manual-test requirement stays constant regardless of automation).",
    },
    { parameter: "COMBINED_CHLORINE", cadence: "daily prior to opening, then every 4 hours", intervalMinutes: 240 },
    { parameter: "TEMPERATURE", cadence: "at least once daily", intervalMinutes: 1440 },
    { parameter: "TOTAL_ALKALINITY", cadence: "weekly", intervalMinutes: 10080 },
    { parameter: "CYANURIC_ACID", appliesWhen: "if used", cadence: "weekly", intervalMinutes: 10080 },
    {
      parameter: "TDS",
      appliesWhen: "salt generators, or whenever a clarity problem occurs",
      cadence: "per manufacturer specification, or situationally on clarity issues",
      isPerformanceBased: true,
      notes: "Conditional/situational cadence, not a fixed interval -- no single intervalMinutes value represents this faithfully.",
    },
  ],
  eventProtocols: [
    {
      triggerType: "UNIFIED_CLOSURE_CHECKLIST",
      triggerLabel: "Any of the twelve named imminent-hazard ('critical operational item') conditions, paragraph (B)(1)",
      closureKind: "ENUMERATED_CHECKLIST",
      reopeningCondition: "Correct the specific condition(s) that triggered closure, then reopen.",
      remediationSteps:
        "Named imminent-hazard conditions: improper/non-functioning drain covers or SVRS; disinfectant residual below the required (D) minimum; circulation/disinfection system failure; malfunctioning automatic chemical controller; missing required lifeguard; insufficient clarity; insufficient lighting; an untreated fecal accident or a recreational waterborne illness (RWI) linked to the pool, until treated per Appendix A; improper chemical storage/use; and electrical hazards. pH and cyanuric acid are explicitly NOT on this list -- see the PH and CYANURIC_ACID ChemistryThreshold notes.",
      sourceConfidence: "confirmed",
      notes: "Disinfectant residual is a named trigger; pH and CYA are not -- a genuinely different enforcement shape than most other states collected, where pH is either separately named or covered by a general catch-all.",
    },
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Fecal accident -- formed stool (assumed figures, CDC-sourced)",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 25,
      ctValue: 45,
      ctValueUnit: "ppm*min",
      externalReferenceLabel: "CDC \"Fecal Incident Response Recommendations\" (cdc.gov/healthywater), reproduced as embedded image pages in OAC 3701-31-04 Appendix A",
      reopeningCondition: "Paragraph (B)(1)(i) makes an untreated fecal accident an imminent-hazard closure trigger until treated per Appendix A's CDC-sourced procedure -- reopen once the CDC protocol's hold time/concentration target is met.",
      sourceConfidence: "assumption",
      notes:
        "Appendix A is literally the CDC's own document reproduced as embedded IMAGE content in Ohio's rule, not transcribed text -- the specific 2 ppm/25 min figure was not independently re-extracted this pass (it exists only as image content in both the source PDF and the live CDC PDF). Other states in this dataset citing the same CDC source land on this exact figure, so it's *likely* correct for Ohio too, but flagged as assumption pending direct verification against the CDC PDF. The fact that Ohio incorporates this CDC document as its binding protocol IS confirmed (see the UNIFIED_CLOSURE_CHECKLIST row) -- only the specific numbers are assumption-level.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Fecal accident -- diarrheal stool (assumed figures, CDC-sourced)",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 765,
      ctValue: 15300,
      ctValueUnit: "ppm*min",
      externalReferenceLabel: "CDC \"Hyperchlorination to Kill Cryptosporidium\" (cdc.gov/healthywater), reproduced as embedded image pages in OAC 3701-31-04 Appendix A",
      reopeningCondition: "Same paragraph (B)(1)(i) mechanism as the formed-stool row -- reopen once the CDC protocol's hold time/concentration target is met.",
      sourceConfidence: "assumption",
      notes: "Same embedded-image sourcing caveat as the formed-stool row above. CT=15,300 matches the same CDC/MAHC-derived figure independently confirmed for New York, Indiana, and New Hampshire -- meaningful corroboration, but not a substitute for reading Ohio's actual Appendix A image content directly.",
    },
  ],
  complianceNotes: [
    {
      kind: "OUT_OF_SCOPE",
      summary: "Gas chlorine and hand-dosing of disinfectant are both prohibited outright -- Ohio requires continuous mechanical feed for every public pool, not just spas (D)(2).",
      detail: "A disinfection-delivery-method restriction, not a testable chemistry reading, so not modeled as its own ChemistryThreshold row.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "Spa water must be drained completely to waste at least every 30 days.",
      detail: "A mandatory maintenance action, not a testable chemistry reading or a testing cadence -- no clean FrequencyRule/ChemistryThreshold shape fits a periodic full-drain requirement.",
    },
    {
      kind: "GAP",
      summary: "A recreational waterborne illness (RWI) linked to the pool is its own named imminent-hazard closure trigger (paragraph (B)(1)(j)), pointing to the same Appendix A CDC protocol as the fecal-accident trigger -- not modeled as a separate EventProtocol row since it shares the identical remediation mechanism.",
      detail: "Distinct from a visible fecal/vomit accident -- this trigger fires on an epidemiological link to illness, not a directly observed contamination event. Worth its own triggerType if AquaRunner ever needs to distinguish the two in the UI.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Oklahoma -- OAC 310:320, "Public Bathing Place Operations." ★ Sourcing confidence
// flag: the actual regulatory chemistry table (310:320-3-8) exists only as a scanned
// image in every version found this pass (Cornell LII's own page says "Click here to
// view image"), and OSDH's hosted PDF copy now 404s. Every chemistry figure below is
// corroborated from (a) a 2022 proposed-amendments redline read directly via
// pdftotext, and (b) a Tulsa Health Department program page -- not the primary table
// itself. sourceConfidence is "assumption" throughout the chemistry rows per
// state-compliance-data.md's own explicit recommendation. Total alkalinity is a
// genuine two-source CONFLICT: the redline's appendix splits it 80-120 ppm (pools) /
// 100-150 ppm (spas), while Tulsa's page gives one flat 80-200 ppm figure with no
// split -- both quoted, not silently reconciled. Oklahoma also folds vomit into the
// heavier diarrheal-tier treatment (20 ppm/8 hr) rather than the lighter formed-stool
// tier most other states use -- a genuine outlier grouping, not a transcription
// choice.
// ---------------------------------------------------------------------------
const OKLAHOMA: StateSeed = {
  state: "OK",
  ruleset: {
    stateName: "Oklahoma",
    healthDepartmentName: "Oklahoma State Department of Health (OSDH)",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "OAC 310:320, \"Public Bathing Place Operations\" -- closure trigger at 310:320-3-7, chemistry table (image-only, not extractable) at 310:320-3-8, testing frequency at 310:320-3-9, log form at 310:320-5-4",
    sourceDocument:
      "OSDH Ch. 320, Proposed Rule Amendments, Flight 2 2022 (read via direct pdftotext extraction) for testing frequency, the closure clause, and the redline appendix's alkalinity figures; Tulsa Health Department's public swimming pools program page for corroborating chemistry ranges and the fecal/vomit response, since the state's own primary 310:320-3-8 table is image-only on every platform checked and OSDH's hosted PDF now 404s.",
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Operation Record Form and Instructions (310:320-5-4)",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under OAC 310:320.

*Sourcing note: Oklahoma's own chemistry table (310:320-3-8) exists only as a scanned
image on every platform checked — these figures are corroborated from a 2022 proposed-
amendments redline plus a Tulsa Health Department page, not a direct primary-text read.*

### Chemistry targets
- **Free chlorine:** 1.0 – 5.0 ppm (pools and spas, not split by body type)
- **pH:** 7.2 – 7.8
- **Cyanuric acid:** 30 – 100 ppm — not one of Oklahoma's three named closure triggers
- **Total alkalinity:** 80 – 120 ppm (pools) — sources disagree on the spa figure

### Closure triggers
Only three parameters are named as flat closure triggers: free chlorine, pH, and
turbidity. Cyanuric acid and alkalinity violations are standing violations, not confirmed
closure triggers.

### Fecal/vomit response
Formed stool: close roughly 30 minutes with levels restored. Diarrheal stool or vomit:
raise free chlorine to 20 ppm, hold pH 7.2–7.8 for 8 hours, backwash the filter — Oklahoma
groups vomit with the heavier diarrheal treatment, not the lighter formed-stool one.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Oklahoma
State Department of Health's own published code. Verify against the authoritative source
for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    {
      parameter: "PH",
      minValue: 7.2,
      maxValue: 7.8,
      unit: "",
      sourceConfidence: "assumption",
      notes:
        "Corroborated via Tulsa Health Dept's page, not read directly from the image-only 310:320-3-8 table. 310:320-3-7 makes this exact range (along with free chlorine and turbidity) a flat mandatory closure trigger -- see the ENUMERATED_CHECKLIST EventProtocol below.",
    },

    // Source doesn't split by body type at all -- duplicated onto POOL and SPA per the
    // mandatory FREE_CHLORINE scoping rule. No bromine figure found in either source
    // reviewed, so no BROMINE row is seeded (not fabricated).
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      minValue: 1.0,
      maxValue: 5.0,
      unit: "ppm",
      sourceConfidence: "assumption",
      notes:
        "1.0 ppm minimum is Tulsa's stated figure; the 5.0 ppm figure is Tulsa's 'operational range up to 5 ppm', not a primary-table-confirmed hard ceiling -- treat the max as soft/approximate.",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "SPA",
      minValue: 1.0,
      maxValue: 5.0,
      unit: "ppm",
      sourceConfidence: "assumption",
      notes: "Same undifferentiated figure as the POOL row -- neither source reviewed splits this by body type.",
    },

    {
      parameter: "CYANURIC_ACID",
      minValue: 30,
      maxValue: 100,
      unit: "ppm",
      sourceConfidence: "assumption",
      notes:
        "Single secondary source (Tulsa), not independently corroborated by a second source the way most other figures here are. Not named in 310:320-3-7's three-item closure clause (chlorine/pH/turbidity only) -- see ComplianceNote.",
    },

    {
      parameter: "TOTAL_ALKALINITY",
      minValue: 80,
      maxValue: 120,
      unit: "ppm",
      sourceConfidence: "conflict",
      notes:
        "Two disagreeing sources: the 2022 redline's own appendix gives 80-120 ppm for pools (seeded here as the unconditional default per the mandatory-rule pool/spa tie-break) and 100-150 ppm for spas; Tulsa's page separately states one flat 80-200 ppm with no pool/spa split at all. Not silently reconciled -- see the matching GAP/CONFLICT ComplianceNote for both figures. Also not named in 310:320-3-7's closure clause, same as cyanuric acid.",
    },

    // Turbidity IS one of the three parameters named in 310:320-3-7's mandatory closure
    // clause, but no NTU figure was captured in either source reviewed -- seeded as a
    // range:null row (queryable, not fabricated) rather than omitted entirely, since its
    // closure-trigger status is itself primary-source confirmed even though the number
    // isn't.
    {
      parameter: "TURBIDITY",
      unit: "NTU",
      sourceConfidence: "gap",
      notes:
        "310:320-3-7 names turbidity as one of exactly three mandatory closure triggers (with free chlorine and pH), primary-source confirmed via the 2022 redline -- but no numeric NTU standard was found in either source reviewed. Seeded as range:null rather than fabricating a number; see ComplianceNote.",
    },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "4 times per day (free chlorine, bromine if used, pH, turbidity)",
      intervalMinutes: 360,
      notes:
        "310:320-3-9, primary-source confirmed via the 2022 redline. Up to 3 of the 4 daily chlorine/pH readings may be substituted with electrode-type automatic controller readings, with Department approval.",
    },
    { parameter: "COMBINED_CHLORINE", cadence: "daily", intervalMinutes: 1440, notes: "310:320-3-9." },
    { parameter: "TOTAL_ALKALINITY", cadence: "weekly", intervalMinutes: 10080, notes: "310:320-3-9." },
    {
      parameter: "CALCIUM_HARDNESS",
      cadence: "weekly",
      intervalMinutes: 10080,
      notes: "310:320-3-9 states a weekly cadence for calcium hardness, but no numeric target range was found in either source -- no matching ChemistryThreshold row seeded, see ComplianceNote.",
    },
    { parameter: "CYANURIC_ACID", cadence: "weekly", intervalMinutes: 10080, notes: "310:320-3-9." },
    {
      parameter: "TEMPERATURE",
      facilityAttribute: "hot water facility (>90°F)",
      cadence: "4 times per day",
      intervalMinutes: 360,
      notes: "310:320-3-9, hot-water facilities specifically.",
    },
    {
      parameter: "COPPER",
      facilityAttribute: "hot water facility (>90°F)",
      cadence: "weekly",
      intervalMinutes: 10080,
      notes: "310:320-3-9 states a weekly cadence but no numeric target range was found -- no matching ChemistryThreshold row.",
    },
    {
      parameter: "IRON",
      facilityAttribute: "hot water facility (>90°F)",
      cadence: "weekly",
      intervalMinutes: 10080,
      notes: "Same shape as COPPER above -- cadence stated, no numeric target found.",
    },
    {
      parameter: "TDS",
      facilityAttribute: "hot water facility (>90°F)",
      cadence: "weekly",
      intervalMinutes: 10080,
      notes: "Same shape as COPPER/IRON above -- cadence stated, no numeric target found.",
    },
  ],
  eventProtocols: [
    {
      triggerType: "UNIFIED_CLOSURE_CHECKLIST",
      triggerLabel: "Free chlorine, pH, or turbidity outside required limits",
      closureKind: "ENUMERATED_CHECKLIST",
      reopeningCondition:
        "310:320-3-7: \"No pool is allowed to remain open for use if the free active chlorine, pH, or turbidity are not within the limits required by these regulations... It is the responsibility of the pool personnel to close the pool if any one of these three are not within the required limits.\" A flat, mandatory (not discretionary) trigger scoped to exactly these three parameters -- primary-source confirmed via the 2022 redline. Reopen once the specific out-of-range parameter is corrected.",
      sourceConfidence: "confirmed",
      notes:
        "Cyanuric acid and total alkalinity are NOT named in this specific three-item clause -- treat CYA/alkalinity violations as standing violations rather than a confirmed independent closure trigger, per the source's own explicit caveat.",
    },
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Formed stool with adequate chlorine present",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 30,
      reopeningCondition: "Remove material, locally treat the affected area, allow re-entry after roughly 30 minutes once levels are confirmed acceptable.",
      sourceConfidence: "assumption",
      notes: "Corroborated via Tulsa Health Dept's page, not the state's own image-only appendix. No specific ppm/CT value stated -- \"levels confirmed acceptable\" appears to mean the routine operating range, not a distinct incident-specific target.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Watery/diarrheal stool OR vomit",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 480,
      ctValue: 9600,
      ctValueUnit: "ppm*min",
      reopeningCondition: "Clear the pool, remove material, raise free chlorine to 20 ppm, maintain pH 7.2-7.8 for 8 hours, backwash the filter, then reopen.",
      sourceConfidence: "assumption",
      notes:
        "★ Oklahoma folds VOMIT into this heavier diarrheal-tier treatment, not the lighter formed-stool tier -- the opposite grouping from most other states in this dataset (which pair vomit with formed stool). ctValue is a direct multiplication of the stated 20 ppm x 480 minutes, not an independently stated CT figure. No blood-specific provision found in either source -- see ComplianceNote.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary:
        "The primary regulatory chemistry table (OAC 310:320-3-8) exists only as a scanned image on every platform checked (Cornell LII, OSDH's own site) -- no chemistry figure in this seed comes from a direct read of that table.",
      detail:
        "OSDH's previously-hosted full-chapter PDF also now 404s. All chemistry ranges are corroborated instead from a 2022 proposed-amendments redline (read directly) and a Tulsa Health Department program page (secondary, county-level). Recommend an OCR pass on the 310:320-3-8 image, or a fresh search for OSDH's relocated PDF, before treating any chemistry figure here as fully confirmed.",
    },
    {
      kind: "GAP",
      summary: "Total alkalinity has two disagreeing sources -- the 2022 redline's appendix (80-120 ppm pools / 100-150 ppm spas) vs. Tulsa's page (80-200 ppm, no split).",
      detail: "Seeded from the redline's pool figure (80-120 ppm) as the unconditional default per the mandatory pool/spa tie-break rule, with sourceConfidence: \"conflict\" on that row. Don't treat either figure as fully resolved without reading the primary 310:320-3-8 table directly.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Cyanuric acid and total alkalinity are not named in 310:320-3-7's three-item mandatory closure clause (free chlorine, pH, turbidity only).",
      detail: "Treat CYA/alkalinity violations as standing violations under the routine chemistry table, not a confirmed independent closure trigger -- the source is explicit that only these three parameters carry the flat \"close the pool\" language.",
    },
    {
      kind: "GAP",
      summary: "No numeric target range was found for turbidity (despite being a named closure trigger), calcium hardness, copper, iron, or TDS, even though a testing cadence is stated for all of them.",
      detail: "310:320-3-9 states testing frequencies for all five parameters, but neither source reviewed gives a numeric standard for any of them. FrequencyRule rows are seeded (cadence is real); no matching ChemistryThreshold row exists for calcium hardness/copper/iron/TDS, and TURBIDITY is seeded with range:null rather than a fabricated NTU figure.",
    },
    {
      kind: "GAP",
      summary: "No blood-specific provision was found in either source reviewed -- neither an exemption (New York/Delaware/Oregon's pattern) nor inclusion in the fecal/vomit protocol.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "310:320-3-9 also requires daily turnover-rate testing -- not modeled as a FrequencyRule row since turnover rate isn't a chemistry-reading parameter this app's schema tracks.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Oregon -- OAR 333-062, "Aquatic Facility Operations and Maintenance," effective
// April 1, 2025 -- a very recent, close adoption of the 2024 CDC Model Aquatic Health
// Code (MAHC) template, the same underlying model Delaware's rule independently adopted
// (several passages below read almost identically to Delaware's). Notable: (1) CYA is
// phased out of new/altered indoor construction on a 4-year clock (by ~April 2029), not
// banned outright the way Delaware/Indiana/Iowa/Minnesota/Montana do; (2) a ratio-based
// CYA closure trigger (CYA:DPD-FC > 45:1, OR CYA > 150 ppm) -- the first ratio-based CYA
// trigger in this dataset, modeled via relationalRule since EventProtocol has no
// relational field of its own; (3) testing cadence is TIGHTER (hourly, not 4-hourly) for
// outdoor non-CYA venues -- the opposite direction from how most states treat CYA
// presence; (4) one of the most complete fecal/vomit/blood protocols collected, with an
// explicit blood exemption and a separate Legionella response (same distinct-category
// shape as Montana's).
// ---------------------------------------------------------------------------
const OREGON: StateSeed = {
  state: "OR",
  ruleset: {
    stateName: "Oregon",
    healthDepartmentName: "Oregon Health Authority (OHA), Public Health Division, Food, Pool & Lodging Health and Safety Program",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "OAR 333-062, \"Aquatic Facility Operations and Maintenance,\" effective 4/1/2025 -- chemistry at §5.7.3-5.7.4, testing frequency at §5.7.5, imminent-hazard closures at §6.6.3, fecal/vomit/blood response at §6.5A/6.5.2/6.5.3. A companion rule, OAR 333-060 (design/construction), was not reviewed.",
    sourceDocument: "Oregon Public Aquatic Facility Rules, OAR 333-062, effective April 1, 2025 (Oregon Health Authority, official PDF, read via direct text extraction)",
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes: "The rule specifies record content and retention requirements directly rather than naming a single numbered OHA form in the sections reviewed.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under OAR 333-062 (effective
4/1/2025).

### Chemistry targets
- **Free chlorine:** 1.0 ppm minimum without cyanuric acid, 2.0 ppm with (pools); 3.0 ppm
  minimum (spas)
- **Bromine:** 3.0 ppm minimum (pools), 4.0 ppm minimum (spas)
- **pH:** 7.0 – 7.8 — this exact range is also the mandatory closure trigger
- **Cyanuric acid:** 90 ppm routine ceiling; closes if the CYA:chlorine ratio exceeds
  45:1 or CYA exceeds 150 ppm outright — phased out of new/altered indoor construction
  by 2029
- **Total alkalinity:** 60 – 180 ppm
- **Calcium hardness:** must not exceed 2,500 ppm

### Testing frequency
Every 4 hours for indoor venues or any venue using cyanuric acid; every hour for outdoor
venues without cyanuric acid — a tighter cadence for the no-stabilizer case.

### Fecal/vomit/blood response
Formed stool or vomit: 2.0 ppm for 25 minutes (doubled with cyanuric acid present).
Diarrheal stool: 20.0 ppm for 12.75 hours. Blood alone does not require closure. A
separate Legionella-specific response also exists.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Oregon
Health Authority's own published rules. Verify against the authoritative source for
anything compliance-critical.*`,
  },
  chemistryThresholds: [
    {
      parameter: "PH",
      minValue: 7.0,
      maxValue: 7.8,
      hazardMin: 7.0,
      hazardMax: 7.8,
      unit: "",
      sourceConfidence: "confirmed",
      notes:
        "§5.7.3. §6.6.3.1 names pH below 7.0 or above 7.8 as two of twenty individually enumerated Imminent Health Hazard violations requiring immediate closure -- the routine range doubles as the closure trigger, same shape as Kentucky/Massachusetts/Michigan/Nebraska, hazardMin/Max mirror minValue/maxValue.",
    },

    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "no CYA present", minValue: 1.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§5.7.3. DEFAULT_CONDITION_PRIORITY default row." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "CYA present", minValue: 2.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§5.7.3." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 3.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§5.7.3. Source gives one spa figure, not split by CYA presence the way pools are." },

    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 3.0, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§5.7.3." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 4.0, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§5.7.3." },

    {
      parameter: "COMBINED_CHLORINE",
      unit: "ppm",
      sourceConfidence: "gap",
      notes: "§5.7.4.4.2 requires remedial action above a set threshold, but the exact ppm figure wasn't captured this pass -- seeded as range:null rather than a fabricated number. See ComplianceNote.",
    },

    {
      parameter: "CYANURIC_ACID",
      maxValue: 90,
      hazardMax: 150,
      unit: "ppm",
      relationalRule:
        "§6.6.3.1(3): closure is required for AQUATIC VENUES using chlorine stabilizers where the CYA:DPD-FC ratio exceeds 45:1, OR when CYA levels exceed 150 ppm -- a ratio-based closure trigger, not just an absolute ceiling. The first ratio-based CYA trigger in this dataset (beyond Alabama's simple presence/absence branch). Not auto-evaluated by the app this pass -- stored faithfully as the regulation states it, per this schema's relationalRule convention.",
      sourceConfidence: "confirmed",
      notes: "§5.7.3.1.3.1A: 90 ppm routine ceiling -- matches Georgia's cap exactly, a second independent confirmation that 90 ppm is the CDC MAHC's own recommended maximum. hazardMax (150 ppm) is the absolute-number half of the ratio-OR-absolute closure trigger described in relationalRule above.",
    },

    { parameter: "CALCIUM_HARDNESS", maxValue: 2500, unit: "ppm", sourceConfidence: "confirmed", notes: "§5.7.3. Source doesn't split this by body type." },
    { parameter: "TOTAL_ALKALINITY", minValue: 60, maxValue: 180, unit: "ppm", sourceConfidence: "confirmed", notes: "§5.7.3." },
    { parameter: "TEMPERATURE", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "§5.7.3. Source doesn't scope this to spas specifically -- seeded unconditional, same as Michigan's/Minnesota's TEMPERATURE rows." },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "every 4 hours while open",
      intervalMinutes: 240,
      notes: "§5.7.5. Baseline cadence for indoor venues and any venue using CYA.",
    },
    {
      parameter: "DISINFECTANT_AND_PH",
      appliesWhen: "outdoor venue, no CYA present",
      cadence: "every hour while open",
      intervalMinutes: 60,
      notes: "§5.7.5. A TIGHTER cadence for the no-stabilizer outdoor case -- the opposite direction from how most states treat CYA presence (most loosen cadence when CYA is absent, Oregon tightens it).",
    },
    { parameter: "TOTAL_ALKALINITY", cadence: "weekly", intervalMinutes: 10080, notes: "§5.7.5." },
    { parameter: "CYANURIC_ACID", appliesWhen: "if used", cadence: "monthly", intervalMinutes: 43200, notes: "§5.7.5." },
  ],
  eventProtocols: [
    {
      triggerType: "UNIFIED_CLOSURE_CHECKLIST",
      triggerLabel: "Any of §6.6.3.1's twenty enumerated Imminent Health Hazard conditions",
      closureKind: "ENUMERATED_CHECKLIST",
      reopeningCondition: "Correct the specific condition(s) that triggered closure, then reopen.",
      remediationSteps:
        "§6.6.3.1 names twenty individually enumerated Imminent Health Hazard violations requiring immediate closure, including pH <7.0 or >7.8, the CYA ratio/absolute trigger (see the CYANURIC_ACID threshold's relationalRule), and non-chemistry items (lightning within 10 miles, broken glass on deck, among others) -- only the chemistry-relevant items were captured in this pass's source research; the full twenty-item list wasn't transcribed verbatim.",
      sourceConfidence: "confirmed",
      notes: "Same long-enumerated-checklist shape as Delaware/Georgia/Illinois, but unusually long and specific (20 named items) compared to most other states' shorter lists.",
    },
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Formed-stool fecal accident or vomit, no CYA present",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 25,
      ctValue: 50,
      ctValueUnit: "ppm*min",
      cascadesToSharedFiltration: true,
      reopeningCondition:
        "§6.5A/§6.5.2.1.1: raise/maintain DPD-FC at 2.0 ppm for at least 25 minutes. Pre-treatment: pH <=7.5, water temperature >=77°F (waived for unheated venues), continuous filtration, multi-point sampling, only non-stabilized chlorine products used to raise the residual -- this combination is close to word-for-word identical to Delaware's §9.28.3.6, confirming both are independent adoptions of the same MAHC template.",
      remediationSteps: "Removal via net/scoop/bucket only -- vacuum cleaners prohibited unless waste discharges to sanitary sewer and equipment can be fully disinfected. Formed-stool and vomit share identical numbers (separate code sections, same figures).",
      sourceConfidence: "confirmed",
      notes: "Closure extends to every aquatic venue sharing the same recirculation system (§6.5.2.1.1) -- same cascading-closure pattern as Delaware/New York/California/Georgia/Indiana.",
    },
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Formed-stool fecal accident or vomit, CYA/stabilized chlorine present",
      appliesWhen: "CYA present",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 50,
      ctValue: 100,
      ctValueUnit: "ppm*min",
      cascadesToSharedFiltration: true,
      reopeningCondition: "Same as the no-CYA formed-stool/vomit protocol, but the inactivation time is doubled to at least 50 minutes at 2.0 ppm because CYA/stabilized chlorine is present.",
      sourceConfidence: "confirmed",
      notes: "§6.5A.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal-stool fecal accident",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 765,
      ctValue: 15300,
      ctValueUnit: "ppm*min",
      cascadesToSharedFiltration: true,
      reopeningCondition: "Raise/maintain DPD-FC at 20.0 ppm for at least 12.75 hours (or equivalent CT), OR secondary treatment to reduce Cryptosporidium below 1 oocyst/100 mL. Same pre-treatment conditions as the formed-stool protocol.",
      sourceConfidence: "confirmed",
      notes: "§6.5A. CT=15,300 matches the same CDC/MAHC-derived standard Arkansas, New York, California, Delaware, Indiana, and New Hampshire independently converge on.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal-stool fecal accident -- any venue containing CYA/stabilized chlorine",
      appliesWhen: "CYA present",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 1680,
      ctValue: 33600,
      ctValueUnit: "ppm*min",
      cascadesToSharedFiltration: true,
      reopeningCondition:
        "Lower CYA to <=15 ppm by draining if needed, then hyperchlorinate to one of three equivalent CT-based options: 20 ppm for 28 hours (seeded here, CT=33,600), 30 ppm for 18 hours (CT=32,400), or 40 ppm for 8.5 hours (CT=20,400) -- OR secondary treatment, OR drain completely. A more granular version of Delaware's single 40 ppm/30 hr figure for the same underlying complication.",
      sourceConfidence: "confirmed",
      notes: "§6.5A. Only the first of the three equivalent options is seeded as ctValue/minimumDurationMinutes; all three are described in reopeningCondition.",
    },
    {
      triggerType: "BLOOD",
      triggerLabel: "Blood contamination of aquatic venue water",
      closureKind: "NO_CLOSURE_REQUIRED",
      reopeningCondition:
        "No closure required. \"Blood contamination of a properly maintained AQUATIC VENUE's water does not pose a public health risk to swimmers.\" Operators MAY choose to treat it as a formed-stool event, purely to satisfy patron concerns, not because the code requires it.",
      sourceConfidence: "confirmed",
      notes: "§6.5A. Same shape as New York's and Delaware's blood exemption -- a third/fourth independent confirmation of this pattern in the dataset.",
    },
    {
      triggerType: "PATHOGEN_LAB_RESULT",
      triggerLabel: "Legionella contamination",
      appliesWhen: "Legionella",
      closureKind: "UNTIL_RETEST_PASSES",
      reopeningCondition: "§6.5.3.6: close the spa immediately without draining, contact the Authority Having Jurisdiction for lab testing.",
      sourceConfidence: "confirmed",
      notes: "A separate, named Legionella-specific response distinct from the fecal/vomit/blood protocol above -- same distinct-category pattern as Montana's separate Legionella response.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "The exact combined-chlorine remediation threshold (§5.7.4.4.2) wasn't captured -- the source confirms remedial action is required above a set ppm level, but not the specific number.",
      detail: "Seeded COMBINED_CHLORINE as range:null with sourceConfidence:gap rather than guessing a figure. Follow-up: re-read §5.7.4.4.2 directly for the exact threshold.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "OAR 333-060 (design/construction standards) was not reviewed this pass -- only OAR 333-062 (operation and maintenance).",
    },
  ],
};


// ---------------------------------------------------------------------------
// Pennsylvania -- 28 Pa. Code, Chapter 18, "Public Swimming and Bathing Places,"
// adopted 1971, confirmed current through June 2026. Genuine, corroborated outlier:
// 0.4 mg/L free chlorine floor, the second-lowest in this dataset after Louisiana's
// 0.4-0.6 ppm -- read directly from primary text, not a transcription error. Otherwise
// a sparse code: no CYA or alkalinity standard anywhere in the chapter, and the
// chapter's only closure/contamination provision (§18.27) is defined exclusively in
// bacteriological (coliform) terms -- no chemistry-based (pH/chlorine) closure trigger
// and no fecal/vomit/blood protocol exist at all, both confirmed absent, not gaps in
// research.
// ---------------------------------------------------------------------------
const PENNSYLVANIA: StateSeed = {
  state: "PA",
  ruleset: {
    stateName: "Pennsylvania",
    healthDepartmentName: "Pennsylvania Department of Health",
    isSupported: true,
    jurisdictionLevel: "STATE",
    officialCitation:
      "28 Pa. Code, Chapter 18, \"Public Swimming and Bathing Places\" -- water supply/chemistry standards at §§18.21-18.32, specifically §18.29 for chlorine/pH, §18.27 for the bacteriological contamination/closure definition",
    sourceDocument:
      "28 Pa. Code Chapter 18, adopted September 18, 1971; per the Pennsylvania Code's own currency statement, reflects the code through June 2, 2026 -- confirmed still in force, not a stale citation",
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "§18.32 requires operational records, filed monthly or more often as required, but no specific numbered state form was confirmed. A separate county-level \"Public Bathing Place Inspection Report Annex\" (Chester County) exists but is a local document, not necessarily statewide.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under 28 Pa. Code Chapter 18.

### Chemistry targets
- **Free chlorine:** 0.4 ppm minimum — a real, primary-source-confirmed figure, the
  lowest in AquaRunner's dataset alongside Louisiana's
- **pH:** 7.2 – 8.2

### What Pennsylvania's code doesn't specify
No numeric cyanuric acid or total alkalinity standard exists anywhere in the chapter. The
only closure/contamination provision (§18.27) is defined exclusively in bacteriological
(coliform) terms — there's no chemistry-based (pH/chlorine) closure trigger and no
fecal/vomit/blood protocol, both confirmed absent, not gaps in this research.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the
Pennsylvania Department of Health's own published code. Verify against the authoritative
source for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.2, maxValue: 8.2, unit: "", sourceConfidence: "confirmed", notes: "§18.29." },

    // Source gives one flat figure ("in all parts of the pool when in use"), not split
    // by body type -- duplicated onto POOL and SPA per the mandatory scoping rule.
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 0.4, unit: "mg/L", sourceConfidence: "confirmed", notes: "§18.29. Second-lowest free-chlorine floor collected in this dataset after Louisiana's 0.4-0.6 ppm -- a real, corroborated outlier, not a transcription error. No maximum stated." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 0.4, unit: "mg/L", sourceConfidence: "confirmed", notes: "Same undifferentiated §18.29 standard as pools -- see the POOL row's notes." },

    {
      parameter: "CYANURIC_ACID",
      unit: "ppm",
      sourceConfidence: "gap",
      notes: "NOT FOUND -- confirmed absent from §18.29 and from the chapter's table of contents. A separate, non-binding \"Standard Operating Recommendations\" guidance document reportedly advises against using cyanuric acid/stabilizer/trichlor/dichlor at all in Pennsylvania facilities, but this is guidance, not a codified numeric standard. Seeded as range:null rather than a fabricated number.",
    },
    {
      parameter: "TOTAL_ALKALINITY",
      unit: "ppm",
      sourceConfidence: "gap",
      notes: "NOT FOUND -- same shape as cyanuric acid, confirmed absent from the codified chapter. Seeded as range:null.",
    },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "at least twice daily, or more often if required by the Department",
      intervalMinutes: 720,
      notes: "§18.29. Test kits must be accurate to within 0.1 mg/L (chlorine) and 0.2 pH units.",
    },
  ],
  eventProtocols: [],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "No numeric cyanuric acid standard exists anywhere in Chapter 18 -- confirmed absent, not a sourcing gap.",
      detail: "A separate non-binding guidance document advises against CYA use entirely but sets no enforceable number.",
    },
    {
      kind: "GAP",
      summary: "No numeric total alkalinity range exists anywhere in Chapter 18 -- confirmed absent, same shape as cyanuric acid.",
    },
    {
      kind: "GAP",
      summary: "No chemistry-based (pH/chlorine) mandatory closure trigger exists in the sections reviewed -- §18.27, the chapter's only closure/contamination provision, defines contamination exclusively in bacteriological (coliform sample) terms.",
      detail: "Confirmed directly: \"§18.27 addresses only bacteriological contamination...does not address chemistry violations like chlorine or pH levels...no mention of...closure procedures.\" Don't assume a pH or chlorine violation triggers automatic closure in Pennsylvania the way it does in most other states in this dataset -- the codified mechanism found is purely microbiological, and no EventProtocol row is seeded to represent it since this app's schema doesn't yet model a lab-result-driven bacteriological closure distinct from the states' chemistry/incident triggers.",
    },
    {
      kind: "GAP",
      summary: "No fecal/vomit/blood contamination protocol exists anywhere in the sections reviewed (§§18.21-18.32) -- confirmed absent, not unresearched.",
      detail: "No CT value, no CDC cross-reference. The chapter's only contamination-related provision is §18.27's bacteriological/coliform closure rule, unrelated to bodily-fluid incidents.",
    },
    {
      kind: "ASSUMPTION",
      summary: "The 0.4 mg/L chlorine floor is treated as Pennsylvania's current, still-in-force figure -- a genuine, primary-source-confirmed outlier, not a typo toward the more common 1.0 ppm floor.",
      detail: "The Pennsylvania Code's own currency statement reflects the code through June 2, 2026, corroborating this is still in force. Don't \"correct\" this number toward another state's more typical floor.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Rhode Island -- 216-RICR-50-05-4, "Licensing Aquatic Venues," effective 8/7/2022.
// Genuine outlier: the lowest outdoor cyanuric acid cap collected in this dataset (25
// ppm, vs. 90-150 ppm almost everywhere else), and CYA is banned outright indoors AND
// in every spa/hot tub/therapeutic pool (broader than Delaware's indoor-only ban) --
// only outdoor traditional/wading pools may use it at all. Total alkalinity and calcium
// hardness are confirmed absent from the codified standard entirely (no range exists,
// not a research gap). There's a state-provided daily log form, but the fecal/vomit/
// blood rule stops at "close immediately" -- no CT value, hold time, or blood exemption,
// the same shape as Pennsylvania's confirmed-absent incident protocol. Testing cadence
// is a second example of a facility-attribute-based frequency split (Oregon's is
// CYA-presence-based; Rhode Island's is keyed on manual vs. automated feed equipment).
// ---------------------------------------------------------------------------
const RHODE_ISLAND: StateSeed = {
  state: "RI",
  ruleset: {
    stateName: "Rhode Island",
    healthDepartmentName: "Rhode Island Department of Health, Public Drinking Water Program (administers the Licensed Swimming Pools Program)",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "216-RICR-50-05-4, \"Licensing Aquatic Venues\" -- chemistry at §4.6.2(B), clarity at §4.6.2(C), records at §4.6.2(D), bacteriological standard at §4.6.3, Imminent Health Hazards at §4.3.9(C)",
    sourceDocument: "216-RICR-50-05-4, codified final regulation effective August 7, 2022 (Rhode Island Department of State, Office of Regulatory Reform, official text)",
    recordRetentionMonths: 12,
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Water Quality Parameter Daily Operations Logs",
    logSheetSourceNotes:
      "§4.6.2(D) codifies a requirement to record daily water-quality analyses, clarity observations, maintenance, corrective actions, and closures \"on forms provided by the Licensing Agency\" -- the exact form number wasn't captured this pass, only that RI Health publishes and requires this specific form (not just an available convenience template).",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under 216-RICR-50-05-4.

### Chemistry targets
- **Free chlorine:** 1.0 – 10.0 ppm without cyanuric acid, 2.0 – 10.0 ppm with (pools);
  2.0 – 10.0 ppm (spas, cyanuric acid banned there entirely)
- **Bromine:** 3.0 – 8.0 ppm (pools), 4.0 – 8.0 ppm (spas)
- **pH:** 7.2 – 7.8
- **Cyanuric acid:** must not exceed 25 ppm — the lowest cap in AquaRunner's dataset —
  and banned entirely indoors and in every spa/hot tub

### Closure triggers
Any water quality parameter outside its required range forces closure by default, not
just pH/chlorine. A separate Imminent Health Hazard list also names vomit and fecal
matter, disinfectant residual, pH, and non-functioning equipment.

### Fecal/vomit/blood response
Rhode Island requires immediate closure for vomit or fecal matter but states no specific
chlorine target, CT value, or hold time.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Rhode
Island Department of Health's own published code. Verify against the authoritative source
for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.2, idealMin: 7.4, idealMax: 7.6, maxValue: 7.8, unit: "", sourceConfidence: "confirmed", notes: "§4.6.2(B)(7)-(9). Same range for every venue type (chlorine or bromine) -- one unconditional row." },

    // Indoor pools/wading pools and outdoor pools without CYA share identical numbers
    // (§4.6.2(B)(7)) -- collapsed to one unconditional-default POOL row using the
    // DEFAULT_CONDITION_PRIORITY string, since CYA use is the only real branch.
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "no CYA present", minValue: 1.0, idealMin: 2.0, idealMax: 4.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§4.6.2(B)(7). Covers both indoor pools/wading pools and outdoor pools without CYA -- identical figures, so one row serves both cases." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "CYA present", minValue: 2.0, idealMin: 2.0, idealMax: 8.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§4.6.2(B)(7), outdoor pools using CYA only -- CYA is banned indoors, so this branch is implicitly outdoor-only even though the app doesn't track that axis." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 2.0, idealMin: 3.0, idealMax: 5.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§4.6.2(B)(8), hot tubs/spas/therapeutic pools. No CYA-present branch for spas -- CYA is banned there outright (§4.6.2(B)(4)), so this is the only spa chlorine row needed." },

    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 3.0, idealMin: 4.0, idealMax: 6.0, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§4.6.2(B)(9), traditional/non-traditional/wading pools." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 4.0, idealMin: 4.0, idealMax: 6.0, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§4.6.2(B)(10), hot tubs/spas." },

    { parameter: "COMBINED_CHLORINE", minValue: 0.0, idealMin: 0.0, idealMax: 0.0, maxValue: 0.2, unit: "ppm", sourceConfidence: "confirmed", notes: "§4.6.2(B)(7)-(8). Same ceiling for all chlorine venues." },

    {
      parameter: "CYANURIC_ACID",
      maxValue: 25,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "§4.6.2(B)(11), outdoor pools only -- the lowest outdoor CYA cap collected in this dataset (Georgia/Oregon sit at 90 ppm, Delaware/most states at 100 ppm). Seeded as the unconditional default per the mandatory CYANURIC_ACID scoping rule, since the app's CYA lookup never scopes by body type or indoor/outdoor. CYA/stabilized chlorine is banned OUTRIGHT indoors and in every spa/hot tub/therapeutic pool (§4.6.2(B)(4)) -- broader than Delaware's indoor-only ban -- so a spa or indoor-pool CYA reading would incorrectly be evaluated against this 25 ppm pool figure rather than flagged as a prohibited chemical; see the matching ComplianceNote, same limitation class as DC's and Montana's indoor/outdoor CYA gaps.",
    },

    { parameter: "OZONE", appliesWhen: "if used as secondary disinfectant", maxValue: 0.1, unit: "ppm", sourceConfidence: "confirmed", notes: "§4.6.2(B)(12), residual." },
    { parameter: "COPPER", appliesWhen: "if used as secondary disinfectant", maxValue: 1.3, unit: "ppm", sourceConfidence: "confirmed", notes: "§4.6.2(B)(12), copper ions." },
    { parameter: "SILVER", appliesWhen: "if used as secondary disinfectant", maxValue: 0.10, unit: "ppm", sourceConfidence: "confirmed", notes: "§4.6.2(B)(12), silver ions." },

    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "§4.6.2(B)(8), spa/hot tub water temperature." },

    { parameter: "CLARITY", unit: "", sourceConfidence: "confirmed", notes: "§4.6.2(C). No numeric NTU standard -- a marker tile or floor suction outlet must remain visible while the water is static, a visual standard like several other states' disk tests." },

    { parameter: "BACTERIA", appliesWhen: "heterotrophic plate count", maxValue: 200, unit: "CFU/mL", sourceConfidence: "confirmed", notes: "§4.6.3(C). Matches Delaware's 200 colonies/mL HPC ceiling exactly." },

    // No TOTAL_ALKALINITY or CALCIUM_HARDNESS row -- both confirmed absent from §4.6.2
    // in full (checked, not a missed excerpt), see the matching GAP ComplianceNotes below.
  ],
  frequencyRules: [
    { parameter: "CLARITY", cadence: "observed and analyzed prior to opening, every operating day", intervalMinutes: 1440, notes: "§4.6.2(A)." },
    {
      parameter: "DISINFECTANT_AND_PH",
      appliesWhen: "manual disinfectant feed system",
      cadence: "every 2 hours while open to bathers",
      intervalMinutes: 120,
      notes: "§4.6.2(A). A second example of a facility-attribute-based frequency split (after Oregon's CYA-presence-based split) -- Rhode Island's is keyed on feed-equipment type instead.",
    },
    {
      parameter: "DISINFECTANT_AND_PH",
      appliesWhen: "automated disinfectant feed system",
      cadence: "every 4 hours while open to bathers",
      intervalMinutes: 240,
      notes: "§4.6.2(A). Lighter cadence for automated control, same shape as Oregon's cadence split.",
    },
    { parameter: "BACTERIAL_SAMPLE", appliesWhen: "year-round venues", cadence: "every 90 days", intervalMinutes: 129600, notes: "§4.6.3(A)." },
    { parameter: "BACTERIAL_SAMPLE", appliesWhen: "seasonal venues", cadence: "once in June and once in August", notes: "§4.6.3(B). A fixed twice-per-season schedule, not a repeating interval -- no single intervalMinutes value represents this faithfully." },
  ],
  eventProtocols: [
    {
      triggerType: "CHEMISTRY_HAZARD_THRESHOLD",
      triggerLabel: "Any water quality parameter outside its required range",
      closureKind: "AUTHORITY_MANDATORY",
      reopeningCondition:
        "§4.6.2(A): \"If any water quality parameter is not within the range [required]...the Aquatic Venue shall close and remain closed until such time that the Licensing Agency determines the water quality meets all standards.\" Makes every threshold in the chemistry table a closure trigger by default, not just pH/chlorine -- reopen once the Licensing Agency confirms compliance.",
      sourceConfidence: "confirmed",
      notes: "Broadest-possible version of the routine-range-is-the-closure-trigger pattern -- every parameter, not a named subset the way Minnesota's enumerated list is.",
    },
    {
      triggerType: "UNIFIED_CLOSURE_CHECKLIST",
      triggerLabel: "Imminent Health Hazard, §4.3.9(C)",
      closureKind: "ENUMERATED_CHECKLIST",
      reopeningCondition: "Correct the specific condition(s) that triggered closure, then reopen.",
      remediationSteps:
        "§4.3.9(C) named items captured this pass: (2) disinfectant residual below minimum or above maximum; (3) pH outside the stated range; (4) filtration/disinfection equipment not running continuously; (17) broken glass, sharp objects, vomit, fecal matter, or other AHJ-determined hazard on the deck or in the water. The full enumerated list runs longer than these four items -- not fully transcribed this pass.",
      sourceConfidence: "confirmed",
      notes: "Same enumerated-checklist shape as Delaware/Georgia/Oregon.",
    },
    {
      triggerType: "FECAL_OR_VOMIT_OR_BLOOD",
      triggerLabel: "Vomit or fecal matter on the deck or in the water",
      closureKind: "AUTHORITY_MANDATORY",
      reopeningCondition:
        "§4.3.9(C)(17) names vomit and fecal matter as an Imminent Health Hazard requiring immediate closure, but the regulation does not specify a CT value, hold time, pre-treatment condition, formed-vs-diarrheal-stool distinction, or any blood-specific exemption -- it stops at \"close immediately.\" No detailed remediation protocol exists to seed beyond that.",
      sourceConfidence: "gap",
      notes: "Same gap shape as Pennsylvania's confirmed-absent incident protocol -- closure-on-contamination exists, but no CT-based procedure. Don't borrow another state's numbers for Rhode Island.",
    },
    {
      triggerType: "PATHOGEN_LAB_RESULT",
      triggerLabel: "Heterotrophic plate count exceeds 200 CFU/mL",
      closureKind: "UNTIL_RETEST_PASSES",
      reopeningCondition: "§4.6.3(G): exceeding the 200 CFU/mL HPC ceiling requires immediate closure upon notification of the lab result -- a lab-result-triggered closure distinct from the daily-reading triggers above. No fixed reopening window stated.",
      sourceConfidence: "confirmed",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "Total alkalinity has no numeric target range anywhere in the codified standard -- confirmed absent from §4.6.2 in full, not a research gap.",
      detail: "Same shape as Pennsylvania's confirmed-absent CYA/alkalinity fields, just a different pair of parameters. No ChemistryThreshold row seeded.",
    },
    {
      kind: "GAP",
      summary: "Calcium hardness has no numeric target range anywhere in the codified standard -- confirmed absent, same shape as total alkalinity.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Cyanuric acid is banned outright indoors and in every spa/hot tub/therapeutic pool (§4.6.2(B)(4)), not just capped at a lower number -- but the app's CYANURIC_ACID lookup (lib/compliance.ts) is always unconditional, so this can't currently be distinguished from the 25 ppm outdoor-pool ceiling seeded above.",
      detail: "Same class of limitation as DC's indoor/outdoor chlorine-ceiling axis and Montana's spa CYA ban -- a real accuracy gap for Rhode Island indoor pools and all spas specifically. Properly fixing this means tracking body-of-water-scoped bans separately from ranges, a real code change out of scope for a data-seeding pass.",
    },
    {
      kind: "GAP",
      summary: "No CT-based fecal/vomit/blood remediation protocol exists anywhere in the regulation -- §4.3.9(C)(17) only requires immediate closure, with no concentration, hold time, or blood-specific provision stated.",
      detail: "Confirmed absent, not unresearched. Rhode Island gives no detailed remediation protocol at all, the same gap shape as Pennsylvania.",
    },
    {
      kind: "GAP",
      summary: "The exact name/number of the \"Water Quality Parameter Daily Operations Logs\" form wasn't captured this pass -- only that it exists and is state-provided.",
    },
  ],
};

// ---------------------------------------------------------------------------
// South Carolina -- S.C. Code Ann. Regs. 61-51. Agency name is mid-transition: pool
// oversight moved from DHEC to the new SC Department of Environmental Services (SCDES)
// effective 7/1/2024 (Act 60 of 2023), but R.61-51's own text still internally defines
// "Department" as DHEC -- SCDES is the current authority, the stale internal definition
// is noted rather than treated as a contradiction. Total alkalinity and calcium hardness
// are confirmed absent from the entire 47-page regulation -- no numeric range, no
// index-based method either (unlike Delaware's Langelier approach). The fecal/vomit/
// blood rule is the thinnest incident protocol collected: a pure incorporation-by-
// reference to external, non-static CDC guidance with no CT values of its own, and
// blood is grouped with fecal material rather than exempted -- the opposite direction
// from New York/Delaware/Oregon's blood exemption.
// ---------------------------------------------------------------------------
const SOUTH_CAROLINA: StateSeed = {
  state: "SC",
  ruleset: {
    stateName: "South Carolina",
    healthDepartmentName:
      "South Carolina Department of Environmental Services (SCDES), Bureau of Water -- Recreational Waters Program. Formerly SC DHEC (split into SCDES/DPH effective 7/1/2024, Act 60 of 2023); R.61-51's own text still internally defines \"Department\" as DHEC, not yet reworded post-split.",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "S.C. Code Ann. Regs. 61-51 -- Section J (\"Operation and Maintenance for All Type Pools\") for chemistry/records, Section K (\"Pool Closures and Enforcement\") for closure triggers",
    sourceDocument: "S.C. Code Ann. Regs. 61-51, full 47-page text (SCDES, official PDF), read via direct text extraction (pdftotext -layout)",
    recordRetentionMonths: 18,
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "§J.17(a)-(b) requires a \"bound log, with consecutively numbered pages, that is acceptable to the Department,\" with date/time/numerical reading, initialed at each reading and signed by the pool operator -- a content/format requirement, not a prescribed state form.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under S.C. Code Ann. Regs.
61-51.

### Chemistry targets
- **Free chlorine:** 1.0 – 8.0 ppm (pools and spas, not split by body type)
- **Bromine:** 2.3 – 17.6 ppm
- **pH:** 7.0 – 7.8 — this exact range is also one of 16 enumerated closure triggers
- **Cyanuric acid:** must not exceed 100 ppm
- **Max water temperature:** 104°F

### Closure triggers
A flat 16-item checklist spans chemistry, equipment, and safety: disinfectant/pH out of
range, high temperature, fecal coliform present, insufficient lifeguards, no valid permit,
and more. No total alkalinity or calcium hardness standard exists anywhere in the
regulation.

### Fecal/vomit/blood response
South Carolina requires immediate closure and defers entirely to current CDC guidance —
it doesn't codify its own CT values. Blood is grouped with fecal material, not exempted.

*This page reflects AquaRunner's built-in rule engine, not a substitute for SCDES's own
published code. Verify against the authoritative source for anything
compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.0, maxValue: 7.8, unit: "", sourceConfidence: "confirmed", notes: "§J.14(b)-(c). Also named in §K.1(a)(viii) as one of the flat 16-item mandatory closure triggers." },

    // Source gives one flat range with no CYA-present/absent split and no separate
    // pool/spa figures -- duplicated onto explicit POOL and SPA rows per the mandatory
    // FREE_CHLORINE/BROMINE scoping rule.
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§J.14(b)-(c). One flat range -- unlike most states in this dataset, South Carolina states no separate minimum for CYA-present vs. CYA-absent pools." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 1.0, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Same flat range as pools -- the source doesn't split this parameter by body type." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.3, maxValue: 17.6, unit: "ppm", sourceConfidence: "confirmed", notes: "§J.14(b)-(c)." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 2.3, maxValue: 17.6, unit: "ppm", sourceConfidence: "confirmed", notes: "Same flat range as pools." },

    {
      parameter: "CYANURIC_ACID",
      maxValue: 100,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "§J.14(c). 100 ppm is the current, fully-phased-in figure -- the reg text itself carries a now-stale historical phase-down schedule (200 ppm for 2009, 150 ppm for 2010, 100 ppm \"beginning in 2011\"), only the 100 ppm figure is live today. \"Indoor pools need not be stabilized\" is permissive language, not an outright indoor CYA prohibition the way Delaware/Indiana/Iowa ban it.",
    },

    { parameter: "TEMPERATURE", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "§J.16(a). Applies to all pool types, not spa-scoped in the source -- seeded unconditional. Also named in §K.1(a)(xii) as a mandatory closure trigger." },
    { parameter: "CLARITY", unit: "", sourceConfidence: "confirmed", notes: "§J.13. Qualitative, not an NTU figure -- main drains \"must be plainly visible\" from the deck, with grate openings individually countable. Also named in §K.1(a) as a closure trigger (\"water too cloudy to see the main drains\")." },
    // No TOTAL_ALKALINITY or CALCIUM_HARDNESS row -- both confirmed absent from the
    // entire 47-page regulation, not a research gap. See the matching GAP ComplianceNote.
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "daily or more often during operating hours, to ensure the facility maintains required water quality standards",
      intervalMinutes: 1440,
      notes: "§J.17-18. A stated daily baseline plus an adequacy-based escalation clause -- same shape as Connecticut/Delaware, not purely performance-based (isPerformanceBased left false since a concrete baseline number is stated).",
    },
    { parameter: "CYANURIC_ACID", appliesWhen: "if used", cadence: "weekly", intervalMinutes: 10080, notes: "§J.17(a)." },
  ],
  eventProtocols: [
    {
      triggerType: "UNIFIED_CLOSURE_CHECKLIST",
      triggerLabel: "Any of §K.1(a)'s 16 enumerated closure conditions",
      closureKind: "ENUMERATED_CHECKLIST",
      reopeningCondition: "Correct the specific condition(s) that triggered closure, then reopen.",
      remediationSteps:
        "§K.1(a): free chlorine/halogen below 1.0 or above 8.0 ppm; pH below 7.0 or above 7.8; temperature above 104°F; fecal coliform present; no valid permit; insufficient lifeguards; missing life-saving equipment or emergency phone; imminent safety hazard; disinfection/recirculation/filtration system not fully operational; log not maintained or unavailable; required signage missing; uncorrected defects past the Department's deadline; no credentialed pool operator; non-compliant fencing/gate; and water too cloudy to see the main drains -- a flat 16-item checklist spanning chemistry, equipment, and safety, same shape as Georgia/Delaware, not a two-tier discretionary/mandatory authority structure like Connecticut's.",
      sourceConfidence: "confirmed",
      notes: "§K (\"Pool Closures and Enforcement\").",
    },
    {
      triggerType: "FECAL_OR_VOMIT_OR_BLOOD",
      triggerLabel: "Biological or chemical contamination of pool water",
      closureKind: "UNTIL_RETEST_PASSES",
      externalReferenceLabel: "CDC Healthy Swimming guidance (healthyswimming.org), incorporated by reference via §J.14(e)",
      reopeningCondition:
        "§J.14(e), quoted in full: \"In all cases of biological or chemical contamination of the pool water, the pool shall be immediately closed and the facility operator shall follow all current Department guidance in addressing the contamination before reopening of the pool. Biological contamination such as fecal, blood, or other body fluids shall be treated using guidance published by the Centers for Disease Control (CDC) on their healthy swimming web site. Procedures other than those provided by the Department may be approved on a case-by-case basis.\" South Carolina does not codify its own CT (concentration x time) values for formed-stool, diarrheal-stool, or vomit anywhere in R.61-51 -- unlike Delaware/Oregon, which lift MAHC's numbers directly into the regulation text, this is a pure incorporation-by-reference to external, non-static CDC guidance. The actual numeric remediation standard lives outside this regulation entirely and can change without a rulemaking.",
      sourceConfidence: "confirmed",
      notes:
        "★ Blood is NOT exempted here, unlike New York/Delaware/Oregon's \"does not pose a public health risk to swimmers\" carve-out -- §J.14(e) groups \"fecal, blood, or other body fluids\" together under the same immediate-closure-plus-CDC-guidance sentence, the opposite direction from that pattern. No explicit statement on whether closure cascades to other pools sharing the same recirculation system, and no separate brominated-pool remediation language -- both confirmed absent (the rule's overall brevity on this topic), not an oversight. cascadesToSharedFiltration deliberately left unset rather than assumed true.",
    },
    {
      triggerType: "PATHOGEN_LAB_RESULT",
      triggerLabel: "Fecal coliform present in a bacteriological sample",
      closureKind: "INDETERMINATE_LAB_RETEST",
      reopeningCondition: "§J.20 (Bacteriological Quality): presence of any fecal coliform in a lab sample is its own independent closure trigger, held open \"until satisfactory results are obtained\" -- no fixed reopening window, same open-ended lab-retest shape as Alaska's pathogen-result trigger.",
      sourceConfidence: "confirmed",
      notes: "Distinct from the visible-contamination-event provision above (§J.14(e)) -- this is a lab-result-triggered closure, closer in shape to Pennsylvania's bacteriological-only closure mechanism than to a CT-based event protocol.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "Total alkalinity and calcium hardness targets are confirmed absent from the codified regulation -- no numeric range, and no index-based method (e.g. Delaware's Langelier Saturation Index) either.",
      detail: "Confirmed via full-text review of the entire 47-page R.61-51 document -- not a sourcing gap.",
    },
    {
      kind: "GAP",
      summary: "The fecal/vomit/blood protocol doesn't address whether closure cascades to other pools sharing the same recirculation system, or give separate brominated-pool remediation language.",
      detail: "Both confirmed absent, consistent with §J.14(e)'s overall brevity (a single sentence deferring to external CDC guidance) rather than an oversight in this research pass.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "The pool operator of record must physically inspect each pool at least 3 times per week, logged and initialed separately from the chemistry log (§J.18(b)).",
      detail: "A staffing/visit-cadence requirement, not a chemistry reading or testing frequency -- not modeled as a FrequencyRule row, same treatment as Georgia's operator-visit-cadence note.",
    },
  ],
};

// ---------------------------------------------------------------------------
// South Dakota -- a confirmed PARTIAL regulatory vacuum, narrower than Idaho's but real:
// the general municipal/public-beach pool chapter (Title 74, Ch. 74:04:08) was deleted
// effective 4/15/2013 and never replaced. What remains is narrower: Dept. of Health
// food/lodging rules (ARSD 44:02:02 hotels, 44:02:14 campgrounds, 44:02:08 vacation
// homes) incorporate by reference the 1996 GLUMRB "Recommended Standards for Swimming
// Pool Design and Operation" (DOH-hosted, updated April 2019) -- but ONLY for pools
// attached to a licensed lodging establishment. A standalone municipal pool, HOA pool,
// water park, or gym pool has NO confirmed state-level chemistry standard at all --
// the load-bearing gap for AquaRunner's typical (non-hotel) commercial customers. Both
// chlorine minimums are pH-indexed linear staircases (unlike Alaska's unavailable
// curve, South Dakota's actual step formula IS in hand, seeded as isCurveBased +
// relationalRule with sourceConfidence: confirmed, not a gap). Spa max temp (102°F) is
// a genuine outlier vs. the 104°F ceiling used almost everywhere else in this dataset.
// No fecal/vomit/blood protocol exists at all -- this document predates that model.
// ---------------------------------------------------------------------------
const SOUTH_DAKOTA: StateSeed = {
  state: "SD",
  ruleset: {
    stateName: "South Dakota",
    healthDepartmentName:
      "South Dakota Department of Health (DOH) -- for lodging-attached pools only. The Department of Agriculture and Natural Resources (DENR's renamed successor) has had no swimming-pool chapter since the 2013 deletion.",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "ARSD 44:02:02:22 (hotels), 44:02:14:11 (campgrounds), 44:02:08:13 (vacation homes) -- each incorporates by reference the \"Recommended Standards for Swimming Pool Design and Operation\" (Great Lakes-Upper Mississippi River Board, 1996 ed., DOH-hosted, updated April 2019), Part 2 §§1.0-5.0. Historical: Title 74, Ch. 74:04:08 (general municipal/beach standard) was deleted effective 4/15/2013 per SL 2011 ch 166 §1, never replaced.",
    sourceDocument:
      "Recommended Standards for Swimming Pool Design and Operation (SD DOH, 1996 ed., updated April 2019, official PDF), read via direct text extraction -- the actual source of every numeric figure below, since the ARSD sections only incorporate it by reference and state no numbers of their own",
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes: "§2.8 requires daily operating records \"on forms acceptable to the regulatory agency\" -- not a single prescribed statewide form.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas at South Dakota lodging
establishments (hotels, campgrounds, vacation homes).

*Scope note: South Dakota repealed its general municipal-pool standard in 2013 and never
replaced it. This standard applies only to pools attached to a licensed lodging
establishment — a standalone municipal, HOA, or water-park pool may have no confirmed
state-level chemistry standard at all.*

### Chemistry targets
- **Free chlorine:** starts at 0.5 ppm at pH 7.2 (1.0 ppm with cyanuric acid), rising as
  pH rises — a pH-indexed sliding scale, not a flat number
- **Bromine:** 1.0 ppm below pH 7.8, 2.0 ppm at or above
- **pH:** 7.2 – 8.0
- **Cyanuric acid:** must not exceed 100 mg/L
- **Total alkalinity:** 70 – 150 mg/L
- **Max spa temperature:** 102°F — lower than the 104°F most other states use

### What's not covered
No fecal/vomit/blood protocol exists — this standard predates that model.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the South
Dakota Department of Health's own published standards. Verify against the authoritative
source for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.2, maxValue: 8.0, unit: "mg/L", sourceConfidence: "confirmed", notes: "§1.2.1. NOT named as its own closure trigger in §5.1's enumerated list -- see the UNIFIED_CLOSURE_CHECKLIST EventProtocol and matching ComplianceNote below." },

    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      appliesWhen: "no CYA present",
      minValue: 0.5,
      unit: "mg/L",
      isCurveBased: true,
      curveDescription: "§1.1.1: minimum 0.5 mg/L at pH 7.2, stepping up +0.2 mg/L for each 0.2 pH-unit increase above 7.2 (e.g. 0.7 mg/L at pH 7.4, 0.9 at pH 7.6, up to 1.3 at pH 8.0).",
      relationalRule: "minimumFreeChlorine(pH) = 0.5 + 0.2 * floor((pH - 7.2) / 0.2), no CYA present.",
      sourceConfidence: "confirmed",
      notes: "Unlike Alaska's Table E (curve description only, actual data points unavailable), South Dakota's staircase IS a stated formula -- seeded as confirmed, not gap. DEFAULT_CONDITION_PRIORITY default row.",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      appliesWhen: "CYA present",
      minValue: 1.0,
      unit: "mg/L",
      isCurveBased: true,
      curveDescription: "§1.1.4: minimum 1.0 mg/L at pH 7.2 (isocyanurate/stabilized chlorine), stepping up +0.4 mg/L for each 0.2 pH-unit increase above 7.2 -- double the no-CYA step size, not just a higher starting point.",
      relationalRule: "minimumFreeChlorine(pH) = 1.0 + 0.4 * floor((pH - 7.2) / 0.2), CYA present.",
      sourceConfidence: "confirmed",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "SPA",
      appliesWhen: "no CYA present",
      minValue: 0.5,
      unit: "mg/L",
      isCurveBased: true,
      curveDescription: "Same pH-indexed staircase as pools (§1.1.1) -- the source doesn't split this parameter by body type.",
      relationalRule: "minimumFreeChlorine(pH) = 0.5 + 0.2 * floor((pH - 7.2) / 0.2), no CYA present.",
      sourceConfidence: "confirmed",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "SPA",
      appliesWhen: "CYA present",
      minValue: 1.0,
      unit: "mg/L",
      isCurveBased: true,
      curveDescription: "Same staircase as pools (§1.1.4).",
      relationalRule: "minimumFreeChlorine(pH) = 1.0 + 0.4 * floor((pH - 7.2) / 0.2), CYA present.",
      sourceConfidence: "confirmed",
    },

    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 1.0, unit: "mg/L", sourceConfidence: "confirmed", notes: "§1.1.2: 1.0 mg/L minimum below pH 7.8; 2.0 mg/L at pH 7.8 or higher -- a two-step pH-indexed minimum, seeded here as the lower/more-common band. See relationalRule for the full rule." , relationalRule: "minimumBromine = 1.0 mg/L if pH < 7.8, else 2.0 mg/L." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 1.0, unit: "mg/L", sourceConfidence: "confirmed", notes: "Same two-step pH-indexed minimum as pools -- source doesn't split by body type.", relationalRule: "minimumBromine = 1.0 mg/L if pH < 7.8, else 2.0 mg/L." },

    {
      parameter: "CYANURIC_ACID",
      maxValue: 100,
      unit: "mg/L",
      sourceConfidence: "confirmed",
      notes: "§1.1.4. Stated as a maintenance requirement only -- NOT cross-referenced in §5.1's closure list, see ComplianceNote.",
    },

    {
      parameter: "TOTAL_ALKALINITY",
      minValue: 70,
      maxValue: 150,
      unit: "mg/L",
      sourceConfidence: "confirmed",
      notes: "§1.2.2. \"Should be maintained\" -- softer, non-mandatory language than the \"shall\" used for pH/disinfectant elsewhere in the same standard.",
    },

    {
      parameter: "COMBINED_CHLORINE",
      maxValue: 0.2,
      unit: "mg/L",
      relationalRule: "§1.6/§1.6.1: if combined chlorine exceeds 0.2 mg/L, superchlorinate by raising free chlorine to at least 10x the combined-chlorine reading. A second independent confirmation (after West Virginia's SR-153 table) of this exact 10x-combined-chlorine formula shape.",
      sourceConfidence: "confirmed",
    },

    { parameter: "CLARITY", unit: "", sourceConfidence: "confirmed", notes: "§1.3: a 3-6 inch black-and-white disc must be readily visible at the deepest point -- a visual standard, not an NTU number." },
    { parameter: "BACTERIA", maxValue: 200, unit: "colonies/mL", sourceConfidence: "confirmed", notes: "§1.4.2: standard plate count ceiling, no confirmed coliform permitted. Superchlorinate and retest immediately on failure." },

    { parameter: "TEMPERATURE", bodyOfWaterCategory: "POOL", minValue: 72, maxValue: 85, unit: "°F", sourceConfidence: "confirmed", notes: "§1.7, excludes therapy/spa pools." },
    {
      parameter: "TEMPERATURE",
      bodyOfWaterCategory: "SPA",
      maxValue: 102,
      unit: "°F",
      sourceConfidence: "confirmed",
      notes: "§14.7. A genuine outlier: every other state collected in this dataset that specifies a spa/hot-tub temperature ceiling uses 104°F. Confirmed directly from the current (April 2019-updated) text, not a transcription artifact.",
    },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "at a frequency and at locations established by the regulatory agency (no fixed daily/hourly count stated in the standard itself)",
      isPerformanceBased: true,
      notes: "§2.3: delegated to inspector/agency discretion rather than a stated number -- unlike most other states collected, which give at least a daily minimum.",
    },
    {
      parameter: "BACTERIA",
      cadence: "at least one water sample weekly, submitted to an EPA-certified lab",
      intervalMinutes: 10080,
      notes: "ARSD 44:02:02:22 / 44:02:14:11. Unsafe results must be reported to DOH within 3 days.",
    },
  ],
  eventProtocols: [
    {
      triggerType: "UNIFIED_CLOSURE_CHECKLIST",
      triggerLabel: "Any of §5.1's six enumerated closure grounds",
      closureKind: "ENUMERATED_CHECKLIST",
      reopeningCondition: "Correct the specific condition(s) that triggered closure, then reopen.",
      remediationSteps:
        "§5.1 names six closure grounds: disinfectant residual failure (§1.1), clarity failure (§1.3), inoperable treatment equipment, electrical hazard, absent supervision/lifeguard, and a catch-all \"any condition creating an immediate danger.\" pH (§1.2) and cyanuric acid (§1.1.4) are NOT independently named -- a pool outside the 7.2-8.0 pH range but otherwise dosed to its pH-adjusted chlorine minimum would not, on this text, automatically trigger closure.",
      sourceConfidence: "confirmed",
      notes: "Same shape as Pennsylvania's narrow (bacteriological-only) closure mechanism, just a different specific omission -- equipment/clarity/residual-based here vs. purely bacteriological there.",
    },
    {
      triggerType: "PATHOGEN_LAB_RESULT",
      triggerLabel: "Positive weekly bacteriological sample",
      closureKind: "UNTIL_RETEST_PASSES",
      consecutiveFailuresRequired: 2,
      reopeningCondition: "ARSD 44:02:02:22/44:02:14:11: two consecutive NEGATIVE resamples are required before reopening after a positive bacteriological result -- note this field describes passes required to reopen, not failures required to close (the schema's consecutiveFailuresRequired field is reused here for the closest-fitting number, see notes).",
      sourceConfidence: "confirmed",
      notes: "consecutiveFailuresRequired:2 here represents \"2 consecutive clean resamples to reopen,\" not \"2 failures to trigger closure\" -- the single positive result itself is what triggers closure; the count describes the reopening bar. Flagged in case this field's semantics need reconciling in a future schema pass.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary:
        "South Dakota's chemistry standard applies ONLY to pools attached to a licensed lodging establishment (hotels, campgrounds, vacation homes) -- a standalone municipal pool, HOA pool, water park, or gym pool has no confirmed state-level chemistry regulation at all.",
      detail:
        "This is the load-bearing gap for AquaRunner: most South Dakota commercial pool customers are likely NOT hotel pools, and for those properties there may be no state standard to bind them to, similar in practical effect (though not in legal mechanism) to Idaho's confirmed repeal. Specialty resorts (ARSD 44:02:05) and B&Bs (44:02:06) weren't individually checked but likely follow the same lodging-incorporation pattern -- treat as likely-same-shape, not confirmed.",
    },
    {
      kind: "GAP",
      summary: "No pH-specific or CYA-specific mandatory closure trigger exists in §5.1's enumerated list -- confirmed absent, not a research gap.",
      detail: "The 100 mg/L CYA ceiling (§1.1.4) and the 7.2-8.0 pH range (§1.2.1) are both stated as maintenance/target requirements only, not cross-referenced anywhere in the §5.1 closure list.",
    },
    {
      kind: "GAP",
      summary: "No fecal/vomit/blood contamination protocol exists anywhere in the incorporated 1996 GLUMRB standard or the ARSD lodging chapters.",
      detail:
        "Checked specifically for \"fecal,\" \"vomit,\" \"blood,\" \"diarrhea,\" and \"hyperchlorinat-\" language -- none appears. This document predates the MAHC-derived CT-value protocols (Delaware/Oregon/New York and others) -- South Dakota's only contamination response is the general bacteriological-failure rule (§1.4.2: superchlorinate and retest), with no body-fluid-specific protocol, no CT values, and no blood exemption language.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Tennessee -- Chapter 1200-23-05, September 2024 revision. ★ Genuine outlier: NO
// chemistry-linked closure trigger exists anywhere in the chapter -- every other state
// collected ties an out-of-range reading to some closure mechanism (enumerated checklist,
// two-tier authority, or at minimum a named violation category). Tennessee's only
// mandatory-closure language is a discretionary Commissioner "imminent health hazard"
// declaration; chemistry violations otherwise feed a weighted-point inspection score
// (100 minus violation points, critical items worth 4-5 points) with a 10-calendar-day
// correction window before an uncorrected critical violation forces closure -- a genuinely
// new enforcement shape, not a flat threshold or pure discretion. Also notable: sanitizer
// minimums split on pool TYPE (Type D = spa) rather than CYA presence the way most states
// split; PHMB gets its own codified 30-50 ppm range (uncommon); calcium hardness, testing
// frequency, and the fecal/vomit/blood protocol are all confirmed absent from the chapter,
// not sourcing gaps.
// ---------------------------------------------------------------------------
const TENNESSEE: StateSeed = {
  state: "TN",
  ruleset: {
    stateName: "Tennessee",
    healthDepartmentName: "Tennessee Department of Health -- permits issued through local county health departments; no more specific division named in the rule text",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "Rules of the Tennessee Department of Health, Chapter 1200-23-05, \"Public Swimming Pools\" -- water quality at §1200-23-05-.02(4), permitting/inspection/closure at §1200-23-05-.04",
    sourceDocument:
      "Chapter 1200-23-05, September 2024 revision (Tennessee Secretary of State, official publications PDF), read via direct text extraction -- the authoritative current text; an older tn.gov-hosted May 2000 PDF is superseded",
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "§.04(2)(b) requires inspection results recorded on \"standard departmental forms,\" but that's the inspector's visit record, not an operator-maintained daily chemistry log -- no technician-facing log sheet is named or required.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under Tennessee Chapter
1200-23-05.

### Chemistry targets
- **Free chlorine:** 0.5 – 3.0 ppm (pools), 1.0 – 3.0 ppm (spas)
- **Bromine:** 2.0 – 5.0 ppm (pools), 3.0 – 5.0 ppm (spas)
- **pH:** 7.2 – 7.6
- **Cyanuric acid:** must not exceed 100 ppm
- **Total alkalinity:** 80 – 200 ppm
- **PHMB:** 30 – 50 ppm, where used

### Enforcement — no chemistry-linked closure trigger
Tennessee's only immediate-closure mechanism is a discretionary Commissioner declaration
of an imminent health hazard. Chemistry violations instead feed a weighted-point
inspection score with a 10-day correction window before an uncorrected critical violation
forces closure — no reading itself is a direct closure trigger. No testing frequency and
no fecal/vomit/blood protocol are stated anywhere in the chapter.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Tennessee
Department of Health's own published code. Verify against the authoritative source for
anything compliance-critical.*`,
  },
  chemistryThresholds: [
    {
      parameter: "PH",
      minValue: 7.2,
      maxValue: 7.6,
      unit: "",
      sourceConfidence: "confirmed",
      notes: "§.02(4)(b)1. Tighter top end than the 7.2-7.8 most other states use. No closure trigger tied to this range -- see ComplianceNote.",
    },

    // Tennessee splits sanitizer minimums by pool TYPE (Type D = whirlpools/hot tubs/spas
    // vs. Types A/B/C/E = everyone else), not by CYA presence the way most states in this
    // dataset split -- Type D maps cleanly onto this app's SPA category, A/B/C/E onto POOL.
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 0.5, maxValue: 3.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§.02(4)(c)1(i), Type A/B/C/E pools. Not CYA-branched -- one flat range." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 1.0, maxValue: 3.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§.02(4)(c)1(ii), Type D (whirlpools/hot tubs/spas)." },

    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.0, maxValue: 5.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§.02(4)(c)1(i), Type A/B/C/E pools." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 3.0, maxValue: 5.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§.02(4)(c)1(ii), Type D." },

    {
      parameter: "PHMB",
      minValue: 30,
      maxValue: 50,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "§.02(4)(c)1, all pool types. Tennessee is one of the few states in this dataset to codify PHMB with its own range rather than leaving it an unspecified \"EPA-approved alternative.\"",
    },

    { parameter: "CYANURIC_ACID", maxValue: 100, unit: "ppm", sourceConfidence: "confirmed", notes: "§.02(4)(b)3. \"Shall not exceed 100 ppm\" -- no separate closure-trigger language tied to this ceiling." },
    { parameter: "TOTAL_ALKALINITY", minValue: 80, maxValue: 200, unit: "ppm", sourceConfidence: "confirmed", notes: "§.02(4)(b)2." },

    { parameter: "BACTERIA", appliesWhen: "total coliform, Chromogenic Substrate Test", maxValue: 4, unit: "per 100 mL", sourceConfidence: "confirmed", notes: "§.02(4)(a). Positive/unacceptable above 4 total coliform bacteria per 100 mL." },
    { parameter: "CLARITY", unit: "", sourceConfidence: "confirmed", notes: "§.02(4)(e)1. Qualitative: main drain grating must be clearly distinguishable from the deck edge -- not an NTU number." },
    { parameter: "TEMPERATURE", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "§.02(4)(g). One shared ceiling for every pool type including Type D spas -- not a separate spa-specific number the way most other states in this dataset split it. Seeded unconditional." },
    // No CALCIUM_HARDNESS row -- confirmed absent from §.02(4) entirely, see GAP note below.
  ],
  frequencyRules: [
    // Deliberately empty: §.02(4)(d) only requires that test equipment/reagents be
    // "provided at the pool" for disinfectant, pH, alkalinity, and CYA -- it never states
    // how often they must be used. Confirmed absent, not an unresearched cadence -- see
    // the matching GAP ComplianceNote. Every other state collected in this dataset states
    // at least some frequency language (even a loose "as often as necessary"); Tennessee
    // never does.
  ],
  eventProtocols: [
    {
      triggerType: "SAFETY_HAZARD",
      triggerLabel: "Commissioner declaration of an imminent health hazard",
      closureKind: "AUTHORITY_DISCRETIONARY",
      reopeningCondition:
        "§.04(3)(b): \"Upon declaration of an imminent health hazard by the Commissioner, the facility shall immediately cease operations until authorized to reopen.\" A case-by-case call by the Commissioner, not a rule-defined numeric trigger -- the only immediate-closure mechanism in the entire chapter. Reopen once the Commissioner authorizes.",
      sourceConfidence: "confirmed",
      notes: "Unlike every other state collected so far, no pH/chlorine/CYA reading is itself named as grounds for this declaration or any other closure -- see the WEIGHTED_VIOLATION_SCORE row below for how chemistry violations are actually handled instead.",
    },
    {
      triggerType: "WEIGHTED_VIOLATION_SCORE",
      triggerLabel: "Uncorrected critical violation past the 10-day correction window",
      closureKind: "AUTHORITY_MANDATORY",
      minimumDurationMinutes: 14400,
      reopeningCondition:
        "§.04(2)(c)-(3)(a), citing T.C.A. §68-14-318: each inspection produces a weighted-point score (100 minus violation point values; critical items -- including chemistry readings -- worth 4-5 points, minor items 1-2 points). Critical violations get a 10-calendar-day correction window; closure follows only if the violation remains uncorrected past that window, not automatically the moment a reading is out of range. minimumDurationMinutes represents the 10-day window itself (14,400 minutes), not a water-treatment hold time.",
      sourceConfidence: "confirmed",
      notes:
        "New triggerType -- no existing value captures a cumulative weighted-point inspection score with a fixed correction window before closure. This is a genuinely different enforcement mechanism than every other state's flat threshold, enumerated checklist, or two-tier discretionary/mandatory authority (e.g. Connecticut's) collected in this dataset.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "No chemistry-linked closure trigger exists anywhere in Chapter 1200-23-05 -- confirmed absent, a genuine outlier in this dataset, not a gap in research.",
      detail:
        "Every other state collected ties an out-of-range pH/chlorine/CYA reading to some closure mechanism. Tennessee's only closure paths are the Commissioner's discretionary imminent-hazard declaration and the weighted-point/10-day-window mechanism (see the two EventProtocol rows above) -- neither is a direct reading-to-closure rule the way Delaware's or Georgia's enumerated checklists are.",
    },
    {
      kind: "GAP",
      summary: "Calcium hardness has no numeric standard anywhere in §.02(4) -- confirmed absent, not a missed excerpt.",
    },
    {
      kind: "GAP",
      summary: "No testing frequency (daily, weekly, or otherwise) is stated anywhere in the chapter.",
      detail:
        "§.02(4)(d) only requires that test equipment/reagents be provided at the pool for disinfectant residual, pH, total alkalinity, and cyanuric acid -- it never states a cadence. No FrequencyRule rows seeded rather than inventing one.",
    },
    {
      kind: "GAP",
      summary: "No fecal/vomit/blood contamination protocol exists anywhere in Chapter 1200-23-05.",
      detail:
        "Confirmed via full-text search of the entire chapter (Definitions, Operational Requirements, Design Standards, Permitting/Inspection, Fees, General Provisions, Tables) for \"fecal\", \"vomit\", \"diarrhea\", and \"contamination\" -- zero matches. The only related provision is a general communicable-disease exclusion for symptomatic patrons/staff (§.02(3)(c)) -- a facility-exclusion rule, not a water-remediation CT protocol.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "Type C pools are referenced (in the sanitizer table and a signage rule) but never separately defined in the sections reviewed -- likely defined by exclusion relative to Types A/B, not confirmed.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Texas -- 25 TAC Chapter 265, Subchapter L. First state in this dataset to table ORP
// as a first-class chemistry parameter with its own min/ideal/max band (600-900 mV),
// not just an ancillary automated-controller log field. CYA remediation (§265.193(p))
// is a step-based remedy, not just a closure flag: raise/hold free chlorine at 2.0 ppm
// until CYA drops below 100 ppm, with daily testing until it does. Fecal/vomit/blood
// response is incorporated by reference to a named CDC document (§265.191(h)(3)/(i)(4),
// §265.180(34)) rather than codified with Texas-specific numbers -- seeded here using
// the same CDC-sourced CT figures Delaware/Oregon independently transcribed (since
// Texas's own citation IS that CDC document), but flagged via externalReferenceLabel/
// sourceConfidence:"assumption" rather than "confirmed", since these numbers weren't
// re-derived from the CDC source directly, only borrowed on the reasonable assumption
// it's the same underlying document. No explicit chemistry-based mandatory-closure
// trigger was found in Subchapter L itself -- §265.193(c) only frames it as "must meet
// the table to be open," an implicit requirement, not a stated "shall close" sentence.
// ---------------------------------------------------------------------------
const TEXAS: StateSeed = {
  state: "TX",
  ruleset: {
    stateName: "Texas",
    healthDepartmentName: "Texas Department of State Health Services (DSHS), Environmental and Consumer Safety Section",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "25 Texas Administrative Code (TAC), Part 1, Chapter 265, Subchapter L, \"Public Swimming Pools and Spas\" (§§265.180-265.196) -- water quality at §265.193, fecal/vomit/blood policy requirement at §265.191(h)(3)/(i)(4), CYA remediation at §265.193(p)",
    sourceDocument: "25 TAC Chapter 265, Subchapter L, official current rule text (Texas DSHS, PDF dated 05/03/24), read via direct PDF text extraction",
    recordRetentionMonths: 36,
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "§265.193(l) requires a \"pool or spa log\" (electronic or manual) with specific required fields (date/time, chemical levels, ORP mV, corrective actions, formed-stool/diarrhea incidents), kept on-site or produced within 5 business days, minimum 3-year retention -- no single statewide numbered DSHS form confirmed.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under 25 TAC Chapter 265,
Subchapter L.

### Chemistry targets
- **Free chlorine:** 1.0 – 8.0 ppm without cyanuric acid, 2.0 – 8.0 ppm with (pools);
  2.0 – 8.0 ppm (spas)
- **Bromine:** 3.0 – 10.0 ppm (pools), 4.0 – 10.0 ppm (spas)
- **pH:** 7.0 – 7.8
- **ORP:** 600 – 900 mV — Texas is the first state in AquaRunner's dataset to table this
  as a first-class reading
- **Cyanuric acid:** must not exceed 100 ppm — banned entirely indoors — exceeding it
  triggers a required remediation sequence, not just a closure flag
- **Total alkalinity:** 60 – 180 ppm
- **Calcium hardness:** 150 – 1,000 ppm (pools), 100 – 800 ppm (spas)

### Fecal/vomit/blood response
Texas requires operators to follow the CDC's "Healthy Swimming" fecal-incident guidance by
name, but doesn't restate its own CT values — the current CDC document is the operative
standard.

*This page reflects AquaRunner's built-in rule engine, not a substitute for Texas DSHS's
own published code. Verify against the authoritative source for anything
compliance-critical.*`,
  },
  chemistryThresholds: [
    {
      parameter: "PH",
      minValue: 7.0,
      idealMin: 7.2,
      idealMax: 7.6,
      maxValue: 7.8,
      unit: "",
      sourceConfidence: "confirmed",
      notes: "Figure: 25 TAC §265.193(c). No explicit, separately-stated closure trigger found -- §265.193(c) only requires water quality to \"meet\" this table \"when the pool or spa is open for use,\" an implicit requirement, not a standalone closure sentence.",
    },

    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "no CYA present", minValue: 1.0, idealMin: 2.0, idealMax: 3.0, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Figure: §265.193(c). Not actually CYA-branched in the source (Texas states one flat pool figure) -- appliesWhen set to the DEFAULT_CONDITION_PRIORITY string so this row resolves as the unconditional default." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 2.0, idealMin: 3.0, idealMax: 3.0, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Figure: §265.193(c)." },

    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 3.0, idealMin: 4.0, idealMax: 6.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Figure: §265.193(c)." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 4.0, idealMin: 5.0, idealMax: 5.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Figure: §265.193(c)." },

    { parameter: "COMBINED_CHLORINE", maxValue: 0.4, unit: "ppm", sourceConfidence: "confirmed", notes: "Figure: §265.193(c). Ceiling only, no stated minimum." },

    {
      parameter: "ORP",
      minValue: 600,
      idealMin: 650,
      idealMax: 750,
      maxValue: 900,
      unit: "mV",
      sourceConfidence: "confirmed",
      notes:
        "Figure: §265.193(c). First state in this dataset to table ORP as a first-class parameter with its own min/ideal/max band, not just an ancillary automated-controller log field -- §265.193(h) requires ORP readings to be logged whenever in-line ORP meters are used, timed to the same interval as sanitizer/pH tests.",
    },

    {
      parameter: "CYANURIC_ACID",
      idealMin: 30,
      idealMax: 50,
      maxValue: 100,
      hazardMax: 100,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "Figure: §265.193(c); remediation at §265.193(p). Exceeding 100 ppm triggers a step-based remedy, not just a closure flag: raise/hold free chlorine at 2.0 ppm until CYA drops below 100 ppm, with sanitizer/pH/CYA tested and logged at least daily until it does -- see the CYA_IN_USE EventProtocol below. CYA use is banned outright in any indoor pool, spa, or therapy pool (§265.193(d)) -- same flat prohibition shape as Delaware/Indiana/Iowa/Minnesota/Montana, not Oregon's phased transition model; not modeled as a separate row since the app doesn't track indoor/outdoor per body of water.",
    },

    { parameter: "TOTAL_ALKALINITY", minValue: 60, idealMin: 60, idealMax: 180, unit: "ppm", sourceConfidence: "confirmed", notes: "Figure: §265.193(c). Source states \">180 ppm out of range\" as the practical ceiling -- seeded as idealMax 180 with no separate hard maxValue distinct from that." },

    { parameter: "CALCIUM_HARDNESS", bodyOfWaterCategory: "POOL", minValue: 150, idealMin: 150, idealMax: 400, maxValue: 1000, unit: "ppm", sourceConfidence: "confirmed", notes: "Figure: §265.193(c)." },
    { parameter: "CALCIUM_HARDNESS", bodyOfWaterCategory: "SPA", minValue: 100, idealMin: 150, idealMax: 400, maxValue: 800, unit: "ppm", sourceConfidence: "confirmed", notes: "Figure: §265.193(c). Tighter ceiling than pools." },

    { parameter: "CLARITY", unit: "", sourceConfidence: "confirmed", notes: "§265.193(e): an 8-inch black/Secchi disk on the pool floor at the deepest point must be clearly and immediately visible. A near-identical clarity rule also appears at §265.194(h), tied to visibility of the bottom and submerged suction outlets specifically as an open/closed-for-use gate." },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      facilityAttribute: "Class A or Class B pool/spa",
      cadence: "every 2 hours",
      intervalMinutes: 120,
      notes: "§265.193(o).",
    },
    {
      parameter: "DISINFECTANT_AND_PH",
      facilityAttribute: "Class A or Class B pool/spa, automatic controller in use",
      cadence: "at least 3 times per day, plus a logged controller reading",
      intervalMinutes: 480,
      notes: "§265.193(o).",
    },
    {
      parameter: "DISINFECTANT_AND_PH",
      facilityAttribute: "Class C pool/spa with on-site staff (e.g. lifeguards)",
      cadence: "minimum 3 times per day",
      intervalMinutes: 480,
      notes: "§265.193(o).",
    },
    {
      parameter: "DISINFECTANT_AND_PH",
      facilityAttribute: "Class C pool/spa with on-site staff, automatic control",
      cadence: "minimum once per day, plus a logged controller reading",
      intervalMinutes: 1440,
      notes: "§265.193(o).",
    },
    {
      parameter: "DISINFECTANT_AND_PH",
      facilityAttribute: "Class C pool/spa with no on-site staff",
      cadence: "minimum once per day",
      intervalMinutes: 1440,
      notes: "§265.193(o).",
    },
    {
      parameter: "DISINFECTANT_AND_PH",
      facilityAttribute: "Class C pool/spa with no on-site staff, automatic system can record/transmit mV or free-chlorine and pH data to the certified operator daily",
      cadence: "manual test weekly, plus a logged controller reading at the same time",
      intervalMinutes: 10080,
      notes: "§265.193(o). A remote-monitoring-based frequency reduction -- a new sub-pattern alongside the ARCHITECTURE NOTES adaptive-frequency entries.",
    },
    { parameter: "CYANURIC_ACID", appliesWhen: "if used", cadence: "weekly", intervalMinutes: 10080, notes: "§265.193(o), all pool classes." },
    {
      parameter: "TOTAL_ALKALINITY",
      cadence: "at least once every 10 days, or more often if needed to maintain §265.193(c)/(e) compliance",
      intervalMinutes: 14400,
      isPerformanceBased: true,
      notes: "§265.193(o). Covers alkalinity, calcium hardness, and overall chemical balance (Langelier Saturation Index or equivalent) together -- same adequacy-conditioned shape as California's combined-chlorine rule.",
    },
    { parameter: "CALCIUM_HARDNESS", cadence: "at least once every 10 days, or more often if needed", intervalMinutes: 14400, isPerformanceBased: true, notes: "§265.193(o). Same bundled cadence as TOTAL_ALKALINITY above." },
  ],
  eventProtocols: [
    {
      triggerType: "CYA_IN_USE",
      triggerLabel: "Cyanuric acid exceeds 100 ppm",
      closureKind: "CHEMICAL_TESTING_OBLIGATION",
      reopeningCondition:
        "§265.193(p): not a simple closure -- (1) raise and hold free available chlorine at 2.0 ppm until CYA drops below 100 ppm; (2) test and log sanitizer, pH, and CYA at least daily until CYA is back under 100 ppm; (3) record the exceedance and remediation in the pool/spa log.",
      sourceConfidence: "confirmed",
      notes: "A step-based remedy rather than a flat close/reopen pair -- distinct shape from Iowa's/North Dakota's simple close-at-X/reopen-at-Y CYA pairs.",
    },
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Formed-stool fecal accident or vomit, no CYA present",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 25,
      ctValue: 50,
      ctValueUnit: "ppm*min",
      reopeningCondition: "Raise/maintain free available chlorine at 2.0 ppm for at least 25 minutes before reentry, per the CDC \"Healthy Swimming: Fecal Incident Response Recommendations for Aquatic Staff\" document Texas incorporates by name and reference (§265.180(34), §265.191(h)(3)/(i)(4)).",
      externalReferenceLabel: "CDC \"Healthy Swimming: Fecal Incident Response Recommendations for Aquatic Staff\" (named in 25 TAC §265.180(34))",
      sourceConfidence: "assumption",
      notes:
        "★ Texas's own rule text contains NO CT values, hold times, or ppm targets for this protocol at all -- operators are pointed at the CDC document itself, a genuinely different mechanism from Delaware/Oregon, which transcribe the CDC/MAHC numbers directly into state code. These figures are borrowed from Delaware's/Oregon's independently-sourced CDC numbers on the reasonable assumption Texas cites the same underlying document, not re-derived from the CDC source directly this pass -- hence sourceConfidence: assumption, not confirmed. If CDC guidance is ever revised, Texas's incorporated-by-reference rule updates automatically without a Texas rule change; Delaware's/Oregon's codified numbers would not.",
    },
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Formed-stool fecal accident or vomit, CYA/stabilized chlorine present",
      appliesWhen: "CYA present",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 50,
      ctValue: 100,
      ctValueUnit: "ppm*min",
      reopeningCondition: "Same CDC-incorporated protocol as the no-CYA row, with inactivation time doubled to at least 50 minutes at 2.0 ppm because CYA/stabilized chlorine is present.",
      externalReferenceLabel: "CDC \"Healthy Swimming: Fecal Incident Response Recommendations for Aquatic Staff\" (named in 25 TAC §265.180(34))",
      sourceConfidence: "assumption",
      notes: "Same borrowed-from-Delaware/Oregon sourcing caveat as the no-CYA row above.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal-stool fecal accident",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 765,
      ctValue: 15300,
      ctValueUnit: "ppm*min",
      reopeningCondition: "Raise/maintain free available chlorine at 20.0 ppm for at least 12.75 hours (or equivalent CT), per the CDC document Texas incorporates by reference.",
      externalReferenceLabel: "CDC \"Healthy Swimming: Fecal Incident Response Recommendations for Aquatic Staff\" (named in 25 TAC §265.180(34))",
      sourceConfidence: "assumption",
      notes: "CT=15,300 matches the same CDC/MAHC-derived standard Arkansas, New York, California, Delaware, Indiana, New Hampshire, North Carolina, and Oregon independently converge on -- but still seeded as assumption for Texas specifically, since Texas's own text states no number at all and this is borrowed, not independently re-derived from the CDC source.",
    },
    {
      triggerType: "BLOOD",
      triggerLabel: "Blood contamination -- exemption borrowed from the same incorporated CDC document",
      closureKind: "NO_CLOSURE_REQUIRED",
      reopeningCondition: "No closure required, per the same CDC \"Healthy Swimming\" guidance Texas incorporates by reference for the fecal/vomit protocol -- Delaware/New York/Oregon's independently-transcribed copies of this CDC guidance all state blood contamination of a properly maintained pool does not pose a public health risk to swimmers.",
      externalReferenceLabel: "CDC \"Healthy Swimming: Fecal Incident Response Recommendations for Aquatic Staff\" (named in 25 TAC §265.180(34))",
      sourceConfidence: "assumption",
      notes: "Not independently confirmed in Texas's own rule text (which never mentions blood at all) -- inferred only because Texas's citation is the same CDC document other states transcribe this exemption from. Flag before relying on this for a Texas-specific compliance claim.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "No explicit chemistry-based mandatory-closure trigger (e.g. \"pH below X or above Y triggers closure\") was found anywhere in Subchapter L.",
      detail:
        "§265.193(c) frames it only as water quality \"must meet\" the table \"when the pool or spa is open for use\" -- an implicit requirement, not a standalone closure sentence. The one explicit, named mandatory-closure trigger found in Subchapter L is unrelated to chemistry: §265.185 requires closure \"until corrected\" for a missing/broken/loose drain grate or suction outlet cover (an entrapment-hazard trigger). General enforcement/closure authority for chemistry violations may live in Texas Health & Safety Code's permit suspension/revocation provisions outside Subchapter L -- not reviewed this pass.",
    },
    {
      kind: "ASSUMPTION",
      summary: "All fecal/vomit/blood EventProtocol CT values above are borrowed from Delaware's/Oregon's independently-sourced CDC figures, not re-derived from the CDC \"Healthy Swimming\" document directly this pass.",
      detail: "Texas's own rule text (§265.191(h)(3)/(i)(4), §265.180(34)) names the CDC document by title but states no numbers of its own -- reasonable to assume the same CT figures apply since multiple states independently converge on them (CT=15,300 for diarrheal-stool specifically), but this hasn't been verified against the actual CDC \"Healthy Swimming: Fecal Incident Response Recommendations for Aquatic Staff\" PDF directly.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "No statewide numbered DSHS log-sheet form was confirmed to exist or not exist -- §265.193(l) prescribes required log fields in detail but names no specific fill-in form.",
    },
  ],
};


// ---------------------------------------------------------------------------
// Utah -- R392-302, "Design, Construction and Operation of Public Pools." Notable:
// (1) testing frequency is plan-driven, not a fixed state baseline -- R392-302-29(3)
// requires each facility's own Operation and Maintenance Plan to state its measurement
// cadence; the only fixed number in the rule (4x/day disinfectant/pH/temperature) is a
// post-failed-bacteriological-sample corrective action, not a routine requirement --
// don't seed that 4x/day figure as Utah's baseline cadence. (2) Free chlorine is
// two-dimensional: CYA-present/absent AND a pH band (7.2-7.6 vs. 7.7-7.8), a second
// state (after Michigan) where the app's DEFAULT_CONDITION_PRIORITY tie-break can only
// resolve one axis (CYA) -- the pH>7.6 bands are seeded faithfully but flagged as not
// currently reachable by the app's lookup. (3) No chemistry-based (pH/CYA) immediate-
// closure trigger exists -- only a bacteriological-failure/structural-hazard mechanism.
// (4) Fecal/vomit/blood response is incorporated by reference to a named CDC document
// (R392-302-33(4)) with NO Utah-specific numbers restated and no separate vomit/blood
// treatment at all -- unlike Texas's research, which explicitly recommended borrowing
// Delaware/Oregon's CDC-sourced figures, Utah's own research only speculates those are
// "likely" the same lineage, so no CT/duration values are seeded here, only the
// incorporation-by-reference fact itself plus the local-health-officer alternative-
// protocol escape valve.
// ---------------------------------------------------------------------------
const UTAH: StateSeed = {
  state: "UT",
  ruleset: {
    stateName: "Utah",
    healthDepartmentName:
      "Utah Department of Health and Human Services, Population Health, Environmental Health (state rule) -- enforced day-to-day by local health departments per R392-302-3.",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "Utah Administrative Code, R392-302, \"Design, Construction and Operation of Public Pools\" -- water chemistry at R392-302-25, supervision/testing-plan and record-keeping at R392-302-29, fecal-response incorporation-by-reference at R392-302-33, spa-specific rules at R392-302-37",
    sourceDocument:
      "Utah Admin. Code R392-302-25/-29/-33/-34 (Cornell LII, mirrors the official Utah Administrative Code; cross-checked against the utrules.elaws.us mirror)",
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "No single named state form confirmed -- the rule requires a facility-specific written Operation and Maintenance Plan and ongoing records (R392-302-29(2)-(3)) rather than naming a numbered department form.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under Utah R392-302-25.

### Chemistry targets
- **Free chlorine:** 1.0 ppm minimum (pH 7.2–7.6, no cyanuric acid) up to 5.0 ppm minimum
  (spas, cyanuric acid present, higher pH) — Utah's floor varies by pH band and cyanuric
  acid presence together
- **Bromine:** 4.0 ppm minimum
- **pH:** 7.2 – 7.8
- **Cyanuric acid:** 10 – 100 ppm
- **Total alkalinity:** varies by construction material (100–125 ppm for plaster-lined
  pools)

### Testing frequency
No fixed statewide cadence — each facility's own approved Operation and Maintenance Plan
sets its testing schedule. A 4x/day cadence only applies as a corrective action after a
failed bacteriological sample.

### Fecal/vomit/blood response
Utah requires operators to follow a named CDC document for fecal accidents but states no
numbers of its own — the local health officer may also approve an alternative protocol.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Utah
Department of Health and Human Services' own published code. Verify against the
authoritative source for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.2, maxValue: 7.8, unit: "", sourceConfidence: "confirmed", notes: "R392-302-25. No separate hazard band -- see the GAP ComplianceNote on closure triggers below." },

    // Two-dimensional: CYA-present/absent x pH band (7.2-7.6 vs 7.7-7.8). The lower pH
    // band on each CYA branch uses the exact DEFAULT_CONDITION_PRIORITY strings so the
    // app's tie-break resolves correctly; the upper pH band is a real, separately-stated
    // figure but not reachable by the app's current single-axis lookup -- same limitation
    // class as Michigan's pH-banded chlorine floor and New York's.
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "no CYA present", minValue: 1.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "R392-302-25, non-stabilized, pH 7.2-7.6 band. DEFAULT_CONDITION_PRIORITY default row." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "no CYA present, pH 7.7-7.8", minValue: 2.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "R392-302-25, non-stabilized, pH 7.7-7.8 band. NOT reachable by the app's current lookup -- see ComplianceNote." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "CYA present", minValue: 2.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "R392-302-25, stabilized, pH 7.2-7.6 band. DEFAULT_CONDITION_PRIORITY default row for the CYA-present branch." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "CYA present, pH 7.7-7.8", minValue: 3.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "R392-302-25, stabilized, pH 7.7-7.8 band. NOT reachable by the app's current lookup." },

    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", appliesWhen: "no CYA present", minValue: 2.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "R392-302-25/-37, non-stabilized, pH 7.2-7.6 band -- spas run higher minimums than pools at every band." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", appliesWhen: "no CYA present, pH 7.7-7.8", minValue: 3.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Non-stabilized, pH 7.7-7.8 band. NOT reachable by the app's current lookup." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", appliesWhen: "CYA present", minValue: 3.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Stabilized, pH 7.2-7.6 band." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", appliesWhen: "CYA present, pH 7.7-7.8", minValue: 5.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Stabilized, pH 7.7-7.8 band. NOT reachable by the app's current lookup." },

    {
      parameter: "COMBINED_CHLORINE",
      unit: "ppm",
      relationalRule: "Combined chlorine must not exceed 0.5 ppm above the free chlorine reading; breakpoint chlorination or a partial water exchange is required if exceeded. A delta from free chlorine, not a flat absolute ceiling.",
      sourceConfidence: "confirmed",
      notes: "R392-302-25. No flat maxValue seeded since the real limit is relative to the free-chlorine reading, which this schema doesn't evaluate automatically -- see relationalRule.",
    },

    // Source states one flat 4.0 ppm floor for "all pool types," not split by body type --
    // duplicated onto POOL and SPA per the mandatory BROMINE scoping rule. No ceiling
    // located this pass (unlike Oregon's 8.0 ppm cap) -- see GAP ComplianceNote.
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 4.0, unit: "ppm", sourceConfidence: "confirmed", notes: "R392-302-25. Minimum only -- no ceiling found in the sections reviewed." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 4.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Same undifferentiated floor as pools." },

    { parameter: "CYANURIC_ACID", minValue: 10, maxValue: 100, unit: "ppm", sourceConfidence: "confirmed", notes: "R392-302-25. Floor and ceiling both stated -- same shape as West Virginia/Massachusetts, not a pure ceiling." },

    // Alkalinity is three-way split by construction material x body type (plaster-lined
    // pool 100-125, plaster-lined spa 80-150, other approved materials 125-150) -- not a
    // CYA branch, so no DEFAULT_CONDITION_PRIORITY string applies. Per the mandatory rule,
    // picking the pool figure (plaster-lined, the most common construction type) as the
    // unconditional default; the other two bands are flagged via ComplianceNote rather than
    // silently dropped.
    { parameter: "TOTAL_ALKALINITY", minValue: 100, maxValue: 125, unit: "ppm", sourceConfidence: "assumption", notes: "R392-302-25, plaster-lined pool figure, used as the unconditional default. Plaster-lined spa (80-150 ppm) and other approved construction materials (125-150 ppm) are real, separately-stated bands not surfaced by this row -- see ComplianceNote." },

    { parameter: "CALCIUM_HARDNESS", minValue: 200, unit: "ppm", sourceConfidence: "confirmed", notes: "R392-302-25. Minimum only, no stated ceiling." },
    { parameter: "SATURATION_INDEX", minValue: -0.3, maxValue: 0.3, unit: "", sourceConfidence: "confirmed", notes: "R392-302-25, Langelier Saturation Index." },
    { parameter: "CLARITY", unit: "", sourceConfidence: "confirmed", notes: "R392-302-25. Qualitative: the drain grate/cover in the deepest part must be readily visible, or a 6-inch black disk placed there must be visible -- not an NTU number." },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "POOL", minValue: 78, idealMin: 82, idealMax: 86, unit: "°F", sourceConfidence: "confirmed", notes: "R392-302-25. 78°F minimum, 82-86°F target range." },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "R392-302-25/-37." },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "whatever measurement frequency the facility's own written Operation and Maintenance Plan states -- no fixed state baseline",
      isPerformanceBased: true,
      notes:
        "R392-302-29(3). Genuinely different from most other states collected: Utah's rule doesn't set a flat 'test N times per day' number at all, it requires each facility's approved plan to state its own cadence. Don't treat the 4x/day figure below as the baseline -- it's a post-failure corrective measure only.",
    },
    {
      parameter: "DISINFECTANT_AND_PH",
      appliesWhen: "corrective action after a failed bacteriological sample, imposed by the local health department",
      cadence: "4 times per day",
      intervalMinutes: 360,
      notes:
        "R392-302-29(4)(a). A remedial measure triggered by a failed sample, not a standing requirement -- an alternative option (R392-302-29(4)(b)) lets the facility instead read flow-rate gauges 4 times daily during the same corrective period.",
    },
    {
      parameter: "BACTERIAL_SAMPLE",
      cadence: "monthly at minimum, more often if required by the local health officer",
      intervalMinutes: 43200,
      notes: "R392-302-25(6)(a).",
    },
  ],
  eventProtocols: [
    {
      triggerType: "PATHOGEN_LAB_RESULT",
      triggerLabel: "Bacteriological sample exceeds 200 bacteria/mL or returns a positive coliform result",
      closureKind: "INDETERMINATE_LAB_RETEST",
      reopeningCondition:
        "R392-302-25(6)(d)-(e): a failed sample requires resampling; the local health department may additionally impose the 4x/day corrective monitoring described in the DISINFECTANT_AND_PH FrequencyRule above. Utah's rule doesn't explicitly frame this as a closure order the way most other states' bacteriological triggers do -- it's closer to a required-resample-plus-possible-escalated-monitoring mechanism, seeded under this closureKind as the nearest fit, not a confirmed 'closed until retest passes' rule.",
      sourceConfidence: "confirmed",
      notes: "Broad structural-hazard authority also exists at R392-302-3(1) (\"dangerous, unsafe, unsanitary, or a nuisance or menace to life, health or property\") but isn't tied to specific pH/chlorine/CYA numbers -- not modeled as its own row, see the GAP ComplianceNote on closure triggers.",
    },
    {
      triggerType: "FECAL_OR_VOMIT_OR_BLOOD",
      triggerLabel: "Fecal matter released into the pool -- incorporated by reference to a named CDC document",
      closureKind: "UNTIL_RETEST_PASSES",
      externalReferenceLabel: "CDC \"Fecal Accident Response Recommendations for Aquatic Staff,\" released June 22, 2018 (incorporated by reference via R392-302-33(4))",
      reopeningCondition:
        "R392-302-33(4): \"The operator shall respond to all discovered releases of fecal matter into a public pool in accordance with\" the named CDC document. Utah's own rule text states no CT value, hold time, pH/temperature pre-treatment condition, formed-vs-diarrheal-stool distinction, cascading-closure-to-shared-filtration rule, or blood exemption -- it only names the CDC document and delegates entirely to it. No separate vomit or blood provision exists in Utah's own text at all.",
      remediationSteps:
        "R392-302-33(4) also lets the local health officer approve an alternative fecal-response protocol if the operator demonstrates \"equivalent protection\" through other operational/engineering controls -- a local-discretion escape valve not seen in states (Delaware/Oregon/New York) that wrote a full protocol directly into their own code.",
      sourceConfidence: "gap",
      notes:
        "No ctValue/minimumDurationMinutes seeded here, unlike Texas's entry -- Texas's own source research explicitly recommended populating the CDC-sourced CT figures as a reasonable stand-in; Utah's research only speculates those are \"likely\" the same underlying CDC document lineage, without a matching recommendation to seed borrowed numbers. Treat this as a genuine gap requiring the actual CDC document text, not a state-confirmed figure.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "No bromine maximum ceiling was located anywhere in the sections reviewed -- only the 4.0 ppm floor.",
      detail: "Unlike Oregon's 8.0 ppm bromine cap, no upper bound for Utah was found this pass.",
    },
    {
      kind: "GAP",
      summary: "No chemistry-based (pH/chlorine/CYA) immediate-closure trigger exists in the sections reviewed -- Utah has no 'imminent health hazard' enumerated list the way Delaware/Georgia/Oregon do.",
      detail: "The only codified consequences found are bacteriological (see the PATHOGEN_LAB_RESULT EventProtocol) and a broad, non-numeric structural-hazard authority at R392-302-3(1). Don't assume an out-of-range pH or CYA reading forces closure in Utah the way it would in most other states in this dataset.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Total alkalinity is genuinely split three ways by construction material and body type (plaster-lined pool 100-125 ppm, plaster-lined spa 80-150 ppm, other approved materials 125-150 ppm) -- the seeded TOTAL_ALKALINITY row uses only the plaster-lined-pool figure as the unconditional default, since this app doesn't track construction material per body of water.",
      detail: "A spa or non-plaster pool's true alkalinity target differs from the 100-125 ppm figure the app will surface -- same limitation class as Maine's/North Dakota's chemical-conditional alkalinity bands.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Free chlorine's pH>7.6 bands (2.0/3.0/3.0/5.0 ppm depending on CYA and body type) are real, separately-stated figures but not reachable by the app's current findThreshold() lookup, which only resolves a CYA-present/absent axis via DEFAULT_CONDITION_PRIORITY, not a pH-band axis.",
      detail: "Same class of limitation as Michigan's and New York's pH-banded chlorine floors -- a reading whose actual pH sits in the 7.7-7.8 band gets compared against the lower band's floor instead of the correct higher one.",
    },
    {
      kind: "GAP",
      summary: "The fecal/vomit/blood CT protocol is incorporated by reference to a CDC document Utah's own code never restates -- see the FECAL_OR_VOMIT_OR_BLOOD EventProtocol. No numbers were borrowed from another state's transcription of that same CDC lineage, since Utah's own research only speculates (not confirms) they're identical.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Vermont -- structural outlier: no single "public swimming pool" code. Pool/spa
// provisions live inside the Licensed Lodging Establishments rule (13-023 Code Vt. R.
// 13-140-023-X, §18.0, eff. 1/1/2018) -- seeded here as the default, broadest-applicable
// case per the source's own recommendation. A separate, older 1988 standalone Spas/Hot
// Tubs rule (13-027) gives different numbers for freestanding spas outside a lodging
// establishment -- not merged in here, flagged via ComplianceNote instead. CYA, total
// alkalinity, and calcium hardness are confirmed absent from BOTH the Lodging and
// Children's Camp rules (confirmed via direct correspondence with VDH's Food & Lodging
// program, not just silence in the text) -- VDH points operators to CDC's MAHC for
// non-binding guidance, not a Vermont-specific number; do not seed those industry
// reference figures as if they were enforceable here. Vomiting is routed to the heavier
// diarrheal-stool procedure, not the lighter formed-stool track most other states use.
// Blood-in-water is a genuine open question -- Vermont's rule only addresses blood
// spills on hard surfaces/decking, never blood in the water itself, so this is seeded
// as neither exempted nor an equal trigger, just unaddressed.
// ---------------------------------------------------------------------------
const VERMONT: StateSeed = {
  state: "VT",
  ruleset: {
    stateName: "Vermont",
    healthDepartmentName: "Vermont Department of Health, Food & Lodging Program (Environmental Health)",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "Regulation for Licensed Lodging Establishments, 13-023 Code Vt. R. 13-140-023-X, §18.0 \"Swimming Pools, Recreational Water Facilities (RWFs), and Hot Tubs\" -- effective 1/1/2018. Secondary/overlapping: 13-027 Code Vt. R. 13-140-027-X, Vermont Health Regulations Ch. 5, Subch. 17, \"Public Spas and Hot Tubs\" (1988), applies to standalone spas outside a lodging establishment -- not merged into the figures below, see ComplianceNote.",
    sourceDocument:
      "Regulation for Licensed Lodging Establishments, effective 1/1/2018 (Vermont Department of Health, official PDF), read via direct PDF text extraction; supplemented by direct correspondence with VDH's Food & Lodging program (FoodLodging@vermont.gov, 802-863-7220) confirming the CYA/alkalinity/hardness gap extends to the Children's Camp rule too",
    recordRetentionMonths: 12,
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "§18.10.1 requires a daily operational log (date, time, tester initials, disinfectant residual, pH, hot-tub temperature) kept on-site 1 year, plus a separate fecal/vomiting accident log (§18.10.2) and a standing written fecal/vomit contamination response plan -- no numbered state form found for any of the three.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under Vermont's Licensed
Lodging Establishments rule (13-023 Code Vt. R. 13-140-023-X, §18.0).

### Chemistry targets
- **Free chlorine:** 1.0 – 5.0 ppm (pools/RWFs), 2.9 – 5.0 ppm (hot tubs)
- **Bromine:** 1.0 – 5.0 ppm (pools/RWFs), 2.0 – 5.0 ppm (hot tubs)
- **pH:** 7.0 – 8.0

### What Vermont's code doesn't specify
No numeric cyanuric acid, total alkalinity, or calcium hardness standard exists in either
the Lodging or Children's Camp rule — confirmed directly with VDH's Food & Lodging
program, not inferred from silence. No chemistry-specific closure trigger exists either,
only a general Imminent Health Hazard catch-all.

### Fecal/vomit response
Formed stool: close 30–60 minutes with free chlorine at 2.0 ppm. Diarrheal stool, and
vomiting (routed to the same, heavier procedure): 20.0 ppm for 8 hours. Hot tubs require
complete draining for any incident rather than an in-water hold. Vermont's rule doesn't
address blood in the water specifically.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Vermont
Department of Health's own published code. Verify against the authoritative source for
anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.0, maxValue: 8.0, unit: "", sourceConfidence: "confirmed", notes: "§18.5.2. Same range for pools, RWFs, and hot tubs -- one unconditional row." },

    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, maxValue: 5.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§18.5.1.1, pools/RWFs. Not CYA-branched -- CYA isn't regulated in Vermont at all, so no appliesWhen condition is needed." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 2.9, maxValue: 5.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§18.5.1.1, hot tubs." },

    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 1.0, maxValue: 5.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§18.5.1.2, pools/RWFs." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 2.0, maxValue: 5.0, unit: "ppm", sourceConfidence: "confirmed", notes: "§18.5.1.2, hot tubs." },

    {
      parameter: "CYANURIC_ACID",
      unit: "ppm",
      sourceConfidence: "gap",
      notes:
        "NOT FOUND -- confirmed absent from the Lodging rule AND the Children's Camp rule (confirmed directly with VDH's Food & Lodging program, not inferred from silence). VDH points operators to CDC's Model Aquatic Health Code for non-binding guidance, not a Vermont-specific number. Seeded as range:null rather than the MAHC/industry reference figures (~30-50 ppm target, 100 ppm max) the source explicitly warns are non-binding context only, not a Vermont requirement.",
    },
    {
      parameter: "TOTAL_ALKALINITY",
      unit: "ppm",
      sourceConfidence: "gap",
      notes: "NOT FOUND -- same shape as cyanuric acid, confirmed absent from both rules via direct VDH correspondence. Seeded as range:null, not the ~60-180 ppm industry reference figure.",
    },

    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "§18.5.7, hot tub max temperature." },
    { parameter: "CLARITY", unit: "", sourceConfidence: "confirmed", notes: "§18.5.4. Black disc (6\" diameter) visible at deepest point, or main drain/hot-tub bottom clearly visible -- a visual standard, not an NTU number." },
    // No CALCIUM_HARDNESS row -- confirmed absent from both rules, same shape as CYA/
    // alkalinity, see the matching GAP ComplianceNote below.
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "at least once daily when the pool/RWF/hot tub is available for guest use, or more often if necessary to maintain water quality",
      intervalMinutes: 1440,
      notes: "§18.10.1. A stated daily baseline plus an adequacy-based escalation clause, not a fixed multiple-times-per-day cadence like most other states -- isPerformanceBased left false since a concrete baseline number (daily) is stated.",
    },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", cadence: "at least once daily", intervalMinutes: 1440, notes: "§18.10.1, hot tub temperature." },
    // No frequency stated for alkalinity/hardness/CYA -- consistent with those fields not
    // existing in the rule at all.
  ],
  eventProtocols: [
    {
      triggerType: "SAFETY_HAZARD",
      triggerLabel: "Imminent Health Hazard -- general non-enumerated catch-all",
      closureKind: "AUTHORITY_MANDATORY",
      reopeningCondition:
        "§4.13/§7.0: \"a fire, significant flooding, sewage backup, infestation, misuse of poisonous or toxic materials, or any other condition that could endanger the health and safety of guests\" -- the licensee must discontinue operation of the affected area immediately and notify the Department within 24 hours (§7.1-7.2). An out-of-range pH or chlorine reading would presumably qualify under this catch-all, but no specific chemistry value is itself named as a closure trigger anywhere in the Lodging rule.",
      sourceConfidence: "confirmed",
      notes: "Unlike Delaware's/Oregon's enumerated checklists or Georgia's ten-item list, Vermont never names a specific chemistry value as a closure trigger -- confirmed absent as a specific rule, not a research gap. See the matching GAP ComplianceNote below.",
    },
    {
      triggerType: "FECAL_FORMED",
      triggerLabel: "Formed-stool fecal accident, pools/RWFs",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 30,
      reopeningCondition:
        "§18.6.1: evacuate guests, remove material with net/scoop, raise disinfectant to 2.0 ppm with pH between 7.2 and 7.8. Closure duration is explicitly NOT tied to a fixed CT value -- \"closure times can vary since the decontamination process takes from 30 to 60 minutes\" (§18.6.1.1), a stated time window rather than a computed CT target.",
      sourceConfidence: "confirmed",
      notes: "No ctValue seeded -- the source explicitly states this is a time-window standard, not a CT-based one, unlike most other states' formed-stool protocols.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Diarrheal-stool fecal accident, or vomiting (§18.7 routes vomit to this same, heavier procedure)",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 480,
      ctValue: 9600,
      ctValueUnit: "ppm*min",
      reopeningCondition:
        "§18.6.2: raise disinfectant to 20.0 ppm for at least 8 hours (pH 7.2-7.8), or use the table's equivalent options -- 1.0 ppm/6.5 days, 10.0 ppm/16 hours, 20.0 ppm/8 hours (a three-point CT table). Vacuuming the fecal material is explicitly prohibited (§18.6.2.2). Filter must be backwashed and NOT returned through the filter; medium replaced if necessary (§18.6.2.4).",
      sourceConfidence: "confirmed",
      notes:
        "Vermont does not give vomit its own lighter formed-stool-style protocol the way Delaware/Oregon do -- §18.7 explicitly routes vomiting to this same diarrheal-stool procedure, treated at the higher 20 ppm/8-hour standard across the board. ctValue is a direct multiplication of the stated 20 ppm x 480 minutes, not an independently stated CT figure.",
    },
    {
      triggerType: "FECAL_OR_VOMIT",
      triggerLabel: "Fecal or vomiting accident in a hot tub specifically",
      appliesWhen: "hot tub",
      closureKind: "AUTHORITY_MANDATORY",
      reopeningCondition:
        "§18.9: a fecal or vomiting incident in a hot tub requires complete draining (not a CT-based in-water disinfection option), manufacturer-spec disinfection, and either disinfecting or replacing the filter medium before refilling -- no alternative \"raise disinfectant and hold\" path is offered for hot tubs the way it is for pools/RWFs.",
      sourceConfidence: "confirmed",
      notes: "A structurally different mechanism than the pools/RWFs protocols above -- drain-and-refill rather than a hold time.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary:
        "Cyanuric acid, total alkalinity, and calcium hardness are confirmed absent from both the Lodging Establishment rule AND the Children's Camp rule -- not a gap in research, confirmed directly with VDH's Food & Lodging program.",
      detail:
        "None of the three are listed in either rule's required daily tests or closure criteria. Operators are expected to follow manufacturer specs and general good practice; VDH points to CDC's Model Aquatic Health Code (MAHC) for additional guidance rather than setting its own numbers. Industry/MAHC-typical reference values (CYA 30-50 ppm target/100 ppm max, alkalinity 60-180 ppm, hardness 150-400 ppm) are explicitly non-regulatory and were NOT seeded as ChemistryThreshold values.",
    },
    {
      kind: "ASSUMPTION",
      summary:
        "Seeded from the Licensed Lodging Establishments rule as the default/broadest-applicable case -- an older 1988 standalone Spas and Hot Tubs rule (13-027, Ch. 5 Subch. 17) gives different, stricter numbers (e.g. pH 7.2-7.8, free chlorine 2-5 ppm, alkalinity/hardness ranges) for freestanding spas not part of a lodging establishment.",
      detail:
        "Whether the 1988 rule has been formally superseded for lodging-establishment spas, or genuinely still governs freestanding ones in parallel, was not resolved -- Cornell LII lists it as current but the two rules weren't cross-referenced against each other in primary source text. A freestanding commercial spa customer (not part of a hotel/motel/inn) may actually be bound by the stricter 1988 figures instead of the ones seeded here.",
    },
    {
      kind: "GAP",
      summary: "No chemistry-specific mandatory closure trigger exists in the Lodging rule -- only the generic, non-enumerated Imminent Health Hazard catch-all (see the SAFETY_HAZARD EventProtocol above).",
      detail: "Confirmed absent as a specific rule, not a research gap -- unlike Delaware/Oregon/Georgia, Vermont never names pH or a chlorine reading as its own closure condition.",
    },
    {
      kind: "GAP",
      summary: "Blood contamination of pool water is a genuine open question -- Vermont's rule has no blood-in-water provision at all, neither an exemption (like New York/Delaware/Oregon) nor treatment as an equal trigger (like Washington).",
      detail:
        "§18.8's \"Body fluid spills\" provision only covers blood on equipment or hard surfaces/decking (1:10 bleach solution, 10-minute contact, PPE) -- it says nothing about blood in the water itself. Don't assume Vermont grants the same blood exemption found in NY/DE/OR; this is unaddressed, not a confirmed policy either way. No BLOOD EventProtocol row seeded since neither closure requirement nor exemption is actually stated.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "A standing written fecal/vomit contamination response plan is required on file, beyond the per-incident log itself -- a document-maintenance requirement, not a chemistry reading or closure trigger, so not modeled as its own schema row.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "Test kits must measure disinfectant across a 0.5-20 ppm range and pH in 0.2-unit increments; hot tubs additionally require a thermometer accurate to +/-2°F -- equipment-capability requirements, not modeled as schema rows.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "Non-lodging, non-camp public pools (municipal, HOA-owned-and-operated, standalone commercial pools not part of a lodging establishment) aren't clearly covered by either rule reviewed here.",
      detail: "Check local ordinances and confirm current interpretation directly with VDH Food & Lodging (FoodLodging@vermont.gov, 802-863-7220) before treating this seed as applicable to that facility type.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Virginia -- 12VAC5-460, last amended 10/17/2019, confirmed current through
// 6/16/2025. One of the thinnest codes collected (second only to Pennsylvania's
// shape): free chlorine floor of 0.5 ppm with NO stated ceiling, pH floor of 7.2
// with NO stated ceiling, and -- a genuine drafting quirk, not a transcription
// error -- the section titled "Alkalinity" (§290) sets no ppm range at all; its
// entire operative text just restates the pH floor ("hydrogen-ion concentration
// should be maintained at 7.2 or above"). No bromine clause, no cyanuric acid
// standard, no calcium hardness standard, no closure-trigger section, no testing-
// frequency requirement, and no fecal/vomit/blood protocol exist anywhere in the
// chapter -- all confirmed absent, not sourcing gaps. There IS a named official
// log form (LHS-183).
// ---------------------------------------------------------------------------
const VIRGINIA: StateSeed = {
  state: "VA",
  ruleset: {
    stateName: "Virginia",
    healthDepartmentName: "Virginia Department of Health (VDH)",
    isSupported: true,
    jurisdictionLevel: "STATE",
    officialCitation:
      "12VAC5-460, \"Regulations Governing Tourist Establishment Swimming Pools and Other Public Pools\" -- chemical testing equipment at §260, disinfection at §280, \"alkalinity\" (title/content mismatch, see notes) at §290, filtration/water clarity at §300, operating records at §270",
    sourceDocument:
      "12VAC5-460, last amended Virginia Register Vol. 36, Issue 1, effective 10/17/2019; text confirmed current through 6/16/2025",
    recordRetentionMonths: 12,
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Swimming Pool Operators Weekly Report, form LHS-183",
    logSheetSourceNotes:
      "Confirmed from the chapter's own forms index (name/number only, form content/layout not pulled this pass). A separate \"Swimming Pool Inspection Form\" (LHS-182) is inspector-side, not operator-side.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under Virginia 12VAC5-460.

### Chemistry targets
- **Free chlorine:** 0.5 ppm minimum — no stated ceiling
- **pH:** 7.2 minimum — no stated ceiling

### What Virginia's code doesn't specify
This is one of the thinnest codes in AquaRunner's dataset: no bromine, cyanuric acid, or
calcium hardness standard exists, and the section titled "Alkalinity" only restates the
pH floor rather than setting a total-alkalinity ppm range. No closure trigger, no testing
frequency, and no fecal/vomit/blood protocol exist anywhere in the chapter — all confirmed
absent, not gaps in this research.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Virginia
Department of Health's own published code. Verify against the authoritative source for
anything compliance-critical.*`,
  },
  chemistryThresholds: [
    {
      parameter: "PH",
      minValue: 7.2,
      unit: "",
      sourceConfidence: "confirmed",
      notes:
        "§290. NOT FOUND: no stated ceiling anywhere in the codified text -- floor only. §290 is literally titled \"Alkalinity\" but its entire operative text reads \"The hydrogen-ion concentration should be maintained at 7.2 or above,\" a restatement of the pH floor, not a total-alkalinity ppm range -- see the TOTAL_ALKALINITY GAP note below. §260 separately requires test equipment capable of reading 6.8-8.0, a kit-capability range, not necessarily the operative bather-time band.",
    },

    // Source gives one flat floor with no pool/spa split (the chapter is written for
    // pools only, doesn't address spas/hot tubs at all) -- duplicated onto explicit
    // POOL and SPA rows per the mandatory FREE_CHLORINE scoping rule.
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      minValue: 0.5,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "§280: \"at all points throughout the swimming pool water when there are bathers present.\" NOT FOUND: no stated ceiling -- §280 states only a floor. §260 separately requires test-kit capability of 0.0-1.0 ppm, narrower than the 0-10 ppm kit range most other states in this dataset specify, and not obviously sufficient to read a shock-level residual.",
    },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "SPA",
      minValue: 0.5,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "Same undifferentiated §280 floor as pools -- the chapter doesn't separately address spas/hot tubs at all, it's written for pools only.",
    },

    { parameter: "CLARITY", unit: "", sourceConfidence: "confirmed", notes: "§300: a six-inch black/white quadrant disc on the pool bottom at the deepest point must be visible from the deck at up to 10 yards horizontal distance, at all times the pool is open -- a visibility-test standard, not an NTU turbidity number." },

    // No BROMINE, CYANURIC_ACID, TOTAL_ALKALINITY (numeric), or CALCIUM_HARDNESS rows --
    // all four confirmed absent from the entire chapter, not a missed excerpt. See the
    // matching GAP ComplianceNotes below.
  ],
  frequencyRules: [
    // Deliberately empty: §270 (Operating Records) requires pH, free chlorine residual,
    // water clarity, and cleanliness to be logged and kept on file for one year, but
    // states no cadence at all -- no "daily," "twice daily," or "every N hours" language
    // anywhere in the chapter. Confirmed absent, not an unresearched cadence -- see the
    // matching GAP ComplianceNote.
  ],
  eventProtocols: [],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "The section titled \"Alkalinity\" (§290) sets no total-alkalinity ppm range at all -- a genuine drafting quirk, not a transcription error.",
      detail:
        "§290's entire operative text is \"The hydrogen-ion concentration should be maintained at 7.2 or above,\" a restatement of the pH floor already seeded on the PH row. There is no ppm alkalinity standard anywhere in the chapter. No TOTAL_ALKALINITY ChemistryThreshold row is seeded -- don't infer a range from the section title.",
    },
    {
      kind: "GAP",
      summary: "Bromine, cyanuric acid, and calcium hardness have no standard anywhere in the chapter -- confirmed absent, not sourcing gaps.",
      detail: "§280 (disinfection) addresses only chlorination, with no alternative-disinfectant clause. Cyanuric acid and calcium hardness are not addressed anywhere in 12VAC5-460 at all.",
    },
    {
      kind: "GAP",
      summary: "No mandatory-closure trigger section exists anywhere in the chapter -- confirmed absent, not a research gap.",
      detail:
        "§270 requires readings to be logged and kept on file for one year, but nothing in Part I or Part II ties an out-of-range reading to a mandatory-closure mechanism the way most other states in this dataset do. Don't infer a closure rule from the chemistry floor alone.",
    },
    {
      kind: "GAP",
      summary: "No testing frequency is stated anywhere in the chapter.",
      detail: "§270 requires records to be kept but never states how often testing must occur. No FrequencyRule rows seeded rather than inventing a cadence.",
    },
    {
      kind: "GAP",
      summary: "No fecal/vomit/blood contamination protocol exists anywhere in 12VAC5-460 -- confirmed absent, not unresearched.",
      detail:
        "A genuinely thin, largely design/construction-focused regulation (dating to a 1962-authorized base rule per §290's own citation, last touched in 2019) with no MAHC-style event-protocol section at all -- closer in shape to Pennsylvania's minimal chapter than to the fully-built-out MAHC-derived states (Delaware, Oregon, etc.). No CT value, no CDC cross-reference.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "Whether a pH ceiling, chlorine maximum, testing cadence, or closure trigger exists in non-codified VDH practice guidance (bulletins, the LHS-183 form's own printed instructions) wasn't confirmed this pass -- only the codified regulation text was reviewed.",
      detail: "Some states' actual enforcement runs on non-codified department bulletins beyond the administrative code itself; worth a follow-up direct contact with VDH before treating Virginia's ruleset as a complete picture of real-world enforcement.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Washington (state) -- WAC 246-260, "Water Recreation Facilities." Outlier: the entire
// fecal/vomit/blood rule is a single blanket sentence (WAC 246-260-111(4)(b)(i)) -- close
// the affected pool "when contaminated with feces, blood, vomit, sewage, or other
// hazardous or unknown material until the area is clean, disinfected, and free of the
// hazardous material." No formed-stool/diarrheal-stool distinction, no CT value, no
// pH/temperature precondition -- and blood is grouped with feces/vomit as an EQUAL
// closure trigger, the opposite of the NO_CLOSURE_REQUIRED blood exemption independently
// confirmed in New York/Delaware/Oregon. Combined chlorine is capped at 50% of free
// chlorine (relational, not a flat ppm) -- a second, independently-shaped example of this
// pattern alongside Alaska's FAC/TAC ratio and Arkansas's Combined = Total - Free rule.
// No total alkalinity or calcium hardness standard exists anywhere in the chapter --
// confirmed absent, not even a Langelier-index fallback the way Delaware/Hawaii have.
// ---------------------------------------------------------------------------
const WASHINGTON: StateSeed = {
  state: "WA",
  ruleset: {
    stateName: "Washington",
    healthDepartmentName: "Washington State Department of Health (DOH), Environmental Public Health Division -- Water Recreation Facilities program",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "Washington Administrative Code, Chapter 246-260 WAC, \"Water Recreation Facilities\" -- chemistry at WAC 246-260-111 and Appendix A/WAC 246-260-999 (Tables 111.1-111.3), monitoring/recordkeeping at WAC 246-260-121, closure authority at WAC 246-260-131(11)",
    sourceDocument: "Chapter 246-260 WAC, full text (Washington DOH, PDF), read via direct text extraction",
    recordRetentionMonths: 36,
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "Monitoring records must be kept 3 years (longer than most states collected, which cluster around 1 year), but no specific numbered state form is named in the sections reviewed.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under WAC 246-260.

### Chemistry targets
- **Free chlorine:** 1.5 ppm minimum without cyanuric acid, 2.0 ppm with (pools);
  3.0 – 3.5 ppm minimum (spas)
- **Bromine:** 2.5 ppm minimum (pools), 4.0 ppm minimum (spas)
- **pH:** 7.2 – 8.0 — this exact range is also the closure trigger
- **Cyanuric acid:** must not exceed 90 ppm
- **Combined chlorine:** must not exceed 50% of the free chlorine reading

### What Washington's code doesn't specify
No total alkalinity or calcium hardness standard exists anywhere in the chapter.

### Fecal/vomit/blood response
Washington's rule is a single blanket sentence: close the affected pool until clean,
disinfected, and free of hazardous material — no specific chlorine target or hold time.
Blood is grouped with feces and vomit as an equal closure trigger, not exempted.

### Equipment / gauge readings
Every visit also requires a flow meter reading, sourced from the state's own
record-retention requirement (chemical quantities, flow rates, and contamination
incidents kept for three years), not a named daily log-sheet field.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the
Washington State Department of Health's own published code. Verify against the
authoritative source for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.2, maxValue: 8.0, unit: "", sourceConfidence: "confirmed", notes: "Table 111.1/111.2. No separate enumerated closure band -- WAC 246-260-131(11) makes any Table 111.2 excursion (including this range) itself the closure trigger; see the CHEMISTRY_HAZARD_THRESHOLD EventProtocol below." },

    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "no CYA present", minValue: 1.5, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Table 111.1/111.2, pools not using cyanurate. DEFAULT_CONDITION_PRIORITY default row. Max also capped by manufacturer's recommendation where lower -- not separately modeled." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "CYA present", minValue: 2.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Table 111.1/111.2, pools using a cyanurate compound." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", appliesWhen: "no CYA present", minValue: 3.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Table 111.1/111.2, spas & wading pools not using cyanurate." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", appliesWhen: "CYA present", minValue: 3.5, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Table 111.1/111.2, spas & wading pools using cyanurate." },

    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.5, unit: "ppm", sourceConfidence: "confirmed", notes: "Table 111.1/111.2. No maximum stated." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 4.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Table 111.1/111.2. No maximum stated." },

    {
      parameter: "COMBINED_CHLORINE",
      unit: "ppm",
      relationalRule: "Combined chlorine may not exceed 50% of the free chlorine reading (Table 111.2) -- a relational cap, not a flat ppm ceiling. Second independent example of this relational-rule shape in this dataset, alongside Alaska's FAC > 0.5xTAC and Arkansas's Combined = Total - Free.",
      sourceConfidence: "confirmed",
    },

    { parameter: "CYANURIC_ACID", minValue: 0, maxValue: 90, unit: "ppm", sourceConfidence: "confirmed", notes: "Table 111.1/111.2." },

    { parameter: "TURBIDITY", maxValue: 0.5, unit: "T.U.", sourceConfidence: "confirmed", notes: "Table 111.2. May rise to 1.0 T.U. at peak use, but must return to 0.5 within 6 hours; not a required routine analysis, only a standard." },
    { parameter: "CLARITY", unit: "", sourceConfidence: "confirmed", notes: "Table 111.2: main drain and pool bottom must be visible at all times -- a visual standard, not an NTU number, kept distinct from the TURBIDITY row above." },

    { parameter: "TEMPERATURE", maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "Table 111.2. Thermometer required above 95°F. Source doesn't scope this to spas specifically -- seeded unconditional, same as Michigan's/Minnesota's/Oregon's TEMPERATURE rows." },
    { parameter: "OZONE", appliesWhen: "atmospheric, supplemental only", maxValue: 0.05, unit: "ppm", sourceConfidence: "confirmed", notes: "Table 111.2." },
    { parameter: "COPPER", appliesWhen: "copper/silver ionizer, supplemental only", maxValue: 1.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Table 111.2." },
    { parameter: "SILVER", appliesWhen: "copper/silver ionizer, supplemental only", maxValue: 0.05, unit: "ppm", sourceConfidence: "confirmed", notes: "Table 111.2." },

    { parameter: "BACTERIA", appliesWhen: "heterotrophic plate count", maxValue: 200, unit: "bacteria/mL", sourceConfidence: "confirmed", notes: "§111(2), two consecutive tests. Numerically identical to Delaware's HPC ceiling." },
    { parameter: "BACTERIA", appliesWhen: "total coliform, membrane filter method", maxValue: 1, unit: "per 100mL (average, two consecutive tests)", sourceConfidence: "confirmed", notes: "§111(2). An MPN-method alternative (2.2 per 100mL) also exists in the source but isn't separately modeled as its own row." },

    // No TOTAL_ALKALINITY or CALCIUM_HARDNESS row -- both confirmed absent from Table
    // 111.2, not a research gap. The 0-300 ppm figure appearing elsewhere in the rule
    // (Table 111.3) is a TEST-KIT ACCURACY range, not a regulatory target -- deliberately
    // not seeded as one. See the matching GAP ComplianceNote below.
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "frequently enough, but at least once every twenty-four hours",
      intervalMinutes: 1440,
      notes: "§121(3). Notably looser than most other states collected (several require hourly-to-4-hourly checks while open) -- Washington's floor is a daily minimum with no stated open-hours cadence.",
    },
    { parameter: "TOTAL_ALKALINITY", cadence: "at least weekly", intervalMinutes: 10080, notes: "§121(3). Cadence is stated even though no numeric alkalinity target exists -- see the matching GAP ComplianceNote." },
    { parameter: "CYANURIC_ACID", appliesWhen: "if used", cadence: "at least weekly", intervalMinutes: 10080, notes: "§121(3)." },
    { parameter: "TEMPERATURE", appliesWhen: "pool exceeds 95°F", cadence: "at least once every 24 hours", intervalMinutes: 1440, notes: "§121(3)." },
  ],
  eventProtocols: [
    {
      triggerType: "CHEMISTRY_HAZARD_THRESHOLD",
      triggerLabel: "Any noncompliance with WAC 246-260-111 water quality/operation requirements",
      closureKind: "AUTHORITY_MANDATORY",
      reopeningCondition:
        "§131(11): owners \"shall close the facility when the facility presents an unhealthful, unsafe, or unsanitary condition,\" expressly including any noncompliance with §131 or WAC 246-260-111 -- meaning any Table 111.2 excursion (pH outside 7.2-8.0, CYA over 90 ppm, disinfectant below minimum, etc.) is itself the closure trigger, with no separate, stricter threshold defined for closure vs. routine correction. No enumerated list the way Georgia's ten-item or Oregon's twenty-item checklists are -- a single blanket rule instead.",
      sourceConfidence: "confirmed",
      notes: "Same routine-range-is-the-closure-trigger shape as Kentucky/Massachusetts/Michigan/Nebraska, but expressed as one general blanket sentence rather than a per-parameter or enumerated-list mechanism.",
    },
    {
      triggerType: "FECAL_OR_VOMIT_OR_BLOOD",
      triggerLabel: "Feces, blood, vomit, sewage, or other hazardous/unknown material in the pool",
      closureKind: "UNTIL_RETEST_PASSES",
      reopeningCondition:
        "WAC 246-260-111(4)(b)(i), quoted in full: close the affected pool \"when contaminated with feces, blood, vomit, sewage, or other hazardous or unknown material until the area is clean, disinfected, and free of the hazardous material.\" No formed-stool/diarrheal-stool distinction, no hyperchlorination CT value, no pH/temperature precondition, and no stated hold time -- reopen once the area is visibly clean and disinfected, not once a specific chemistry target is reached and held.",
      sourceConfidence: "confirmed",
      notes:
        "★ Blood is explicitly grouped with feces/vomit as an EQUAL closure trigger here -- the opposite of the NO_CLOSURE_REQUIRED blood exemption independently confirmed in New York, Delaware, and Oregon. Don't apply another state's CT-value shape to Washington; this rule is a flat 'close until visibly clean and disinfected,' full stop. No shared-filtration cascading-closure language found in the sections reviewed -- cascadesToSharedFiltration deliberately left unset rather than assumed true.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "No numeric standard exists for total alkalinity or calcium hardness anywhere in Chapter 246-260 -- confirmed absent, not a research gap.",
      detail:
        "The strongest 'nothing to find' case collected in this dataset, since even Delaware and Hawaii have a Langelier-index fallback for alkalinity/hardness and Washington has neither. The 0-300 ppm figure that appears elsewhere in the rule (Table 111.3) is a test-kit ACCURACY range, not a regulatory target, and is deliberately not seeded as one. A weekly TOTAL_ALKALINITY FrequencyRule is still seeded per §121(3) even though no matching ChemistryThreshold range exists.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "Owners must separately notify the department of any drowning, near-drowning, death, serious injury, or serious illness within 48 hours of becoming aware (§121(1)).",
      detail: "A distinct incident-reporting duty, not a water-chemistry rule or closure trigger -- not modeled as a schema row. Worth carrying into the data model if AquaRunner ever tracks incident reports alongside chemistry logs.",
    },
  ],
  equipmentReadingRequirements: [
    {
      parameter: "FLOW_METER",
      notes: "Sourced from the record-retention requirement (chemical quantities, flow rates, and contamination incidents kept for three years) rather than a named daily log-sheet field.",
    },
  ],
};

// ---------------------------------------------------------------------------
// West Virginia -- 64CSR16, "Recreational Water Facilities," effective 4/18/2007.
// ★ This state's research was corrected mid-session: an earlier pass wrongly concluded
// WV had no pH closure trigger and no fecal/vomit/blood protocol, because it only found
// §64-16-5/7/8 and never located §64-16-13 (the actual closure section) or the official
// SR-153 appendix (Tables 64-16 A/B/C). Both gaps are now filled from primary sources
// (Cornell LII for §64-16-13, direct pdftotext extraction of the SR-153 PDF for the
// chemistry table and fecal/vomit/blood cleanup procedures) -- this seed reflects the
// corrected research, not the original wrong claims. Notable patterns: cyanuric acid has
// both a floor AND ceiling (10-100 mg/L), one of the only states in this dataset with a
// CYA minimum; a super-chlorination trigger at 10x the combined-chlorine reading once
// combined chlorine hits 0.2 mg/L (the same formula shape once retracted for Maryland,
// confirmed real here); a general water-temperature ceiling of 105°F, a genuine outlier
// vs. the 104°F almost every other state uses; and blood is neither exempted nor treated
// as equal-severity to fecal/vomit -- WV requires closure for blood the same as
// fecal/vomit (§13.1.h) but explicitly routes it to the LIGHTER formed-stool cleanup
// procedure rather than the heavier diarrheal one, a fourth distinct blood-handling
// pattern in this dataset.
// ---------------------------------------------------------------------------
const WEST_VIRGINIA: StateSeed = {
  state: "WV",
  ruleset: {
    stateName: "West Virginia",
    healthDepartmentName: "West Virginia Bureau for Public Health, Office of Environmental Health Services (OEHS) -- day-to-day permitting/inspection delegated to local health departments",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "West Virginia Code of State Rules, Title 64, Series 16 (\"64CSR16\"), \"Recreational Water Facilities\" -- definitions/scope at §64-16-2, water quality at §64-16-7, testing/records at §64-16-8, inspections at §64-16-5, closure triggers at §64-16-13",
    sourceDocument:
      "64CSR16 rule text (Cornell Law LII, cross-checked against §64-16-13 directly) plus SR-153, \"Recreational Water Facility Tables\" (WV DHHR, official, mirrored by Cabell-Huntington Health Department), read via direct pdftotext extraction -- SR-153 is the more granular source and is used for every chemistry figure below",
    recordRetentionMonths: 12,
    logSheetSource: "STATE_PROVIDED",
    logSheetSourceLabel: "Form ER-32, \"Recreational Water Facility Weekly Operational Report\" + Form SR-153, \"Recreational Water Facility Tables\"",
    logSheetSourceNotes:
      "ER-32 is a weekly-report cadence, not a daily-sheet-per-visit shape like most other states. SR-153 isn't just a form -- it's a three-part reference appendix (Table 64-16 A closure requirements, Table 64-16 B lifeguard-count matrix, Table 64-16 C water quality standards) operators use directly. Form SG-49 is the operating-permit application, not a log sheet.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under West Virginia 64CSR16
and its SR-153 appendix tables.

### Chemistry targets
- **Free chlorine:** 1.0 – 5.0 ppm (pools and spas)
- **Bromine:** 2.0 – 5.0 ppm (pools and spas)
- **pH:** 7.2 – 7.8 — this exact range is also the mandatory closure trigger
- **Cyanuric acid:** 10 – 100 mg/L — one of the few states with a stated minimum, not
  just a ceiling
- **Total alkalinity:** 60 – 180 mg/L
- **Max general water temperature:** 105°F — an outlier vs. the 104°F most states use

### Closure triggers
Eight enumerated conditions force closure, including free chlorine below 1.0 mg/L, pH
outside 7.2–7.8, free bromine below 2.0 mg/L, equipment failure, and a fecal accident,
blood, or vomitus in the water.

### Fecal/vomit/blood response
Formed stool, blood, or vomit: 2 mg/L free chlorine for 25 minutes — blood gets this same
lighter procedure, not exempted and not treated as more severe. Diarrheal stool: one of
four CT-equivalent options (5 mg/L/32hr up to 20 mg/L/8hr).

*This page reflects AquaRunner's built-in rule engine, not a substitute for the West
Virginia Bureau for Public Health's own published rules. Verify against the authoritative
source for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    {
      parameter: "PH",
      minValue: 7.2,
      idealMin: 7.5,
      idealMax: 7.5,
      maxValue: 7.8,
      hazardMin: 7.2,
      hazardMax: 7.8,
      unit: "",
      sourceConfidence: "confirmed",
      notes:
        "SR-153 Table C: min 7.2, ideal 7.5, max 7.8. §64-16-13.1.b-c names pH >7.8 or <7.2 as two of eight enumerated closure triggers -- the routine range doubles as the closure trigger, so hazardMin/Max mirror minValue/maxValue. This corrects the original (wrong) research pass, which concluded WV had no pH closure trigger at all because it never located §64-16-13.",
    },

    // Source gives one flat, undifferentiated range (no separate pool/spa split) --
    // duplicated onto explicit POOL and SPA rows per the mandatory scoping rule.
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, idealMin: 2.0, idealMax: 3.0, maxValue: 5.0, hazardMin: 1.0, unit: "mg/L", sourceConfidence: "confirmed", notes: "SR-153 Table C. §64-16-13.1.a names free chlorine <1.0 mg/L as a closure trigger -- hazardMin mirrors minValue." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 1.0, idealMin: 2.0, idealMax: 3.0, maxValue: 5.0, hazardMin: 1.0, unit: "mg/L", sourceConfidence: "confirmed", notes: "Same undifferentiated SR-153 standard as pools -- WV's own table doesn't split this parameter by body type." },

    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.0, idealMin: 2.0, idealMax: 3.0, maxValue: 5.0, hazardMin: 2.0, unit: "mg/L", sourceConfidence: "confirmed", notes: "SR-153 Table C. §64-16-13.1.f names free bromine <2.0 mg/L as a closure trigger -- hazardMin mirrors minValue." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 2.0, idealMin: 2.0, idealMax: 3.0, maxValue: 5.0, hazardMin: 2.0, unit: "mg/L", sourceConfidence: "confirmed", notes: "Same undifferentiated SR-153 standard as pools." },

    {
      parameter: "COMBINED_CHLORINE",
      maxValue: 0.5,
      unit: "mg/L",
      relationalRule:
        "SR-153 Table C, section F: required super-chlorination is triggered whenever combined chlorine reaches 0.2 mg/L or more, dosed at 10x the combined-chlorine reading, performed while the facility is not in use. The same 10x-combined-chlorine formula shape once retracted for Maryland (a wrong secondary source there), now confirmed real and primary-sourced for West Virginia.",
      sourceConfidence: "confirmed",
      notes: "Previously marked NOT FOUND in the earlier (wrong) research pass -- it's in SR-153 Table C, not §64-16-7 itself.",
    },

    {
      parameter: "CYANURIC_ACID",
      minValue: 10,
      idealMin: 30,
      idealMax: 50,
      maxValue: 100,
      unit: "mg/L",
      sourceConfidence: "confirmed",
      notes:
        "SR-153 Table C: min 10, ideal 30-50, max 100 mg/L -- a floor AND a ceiling, one of the only states in this dataset with a stated CYA minimum, not just a cap. Stabilizer \"is not needed for indoor facilities and should not be used in hot water facilities\" (guidance, not a numeric indoor ban the way Delaware/Indiana ban it outright) -- not modeled as a separate row since the app doesn't track indoor/outdoor per body of water. SR-153 also notes CYA \"may titrate as Alkalinity\" -- a measurement-interference caveat, not a numeric adjustment, not modeled.",
    },

    {
      parameter: "TOTAL_ALKALINITY",
      minValue: 60,
      idealMin: 80,
      idealMax: 120,
      maxValue: 180,
      unit: "mg/L",
      sourceConfidence: "confirmed",
      notes: "SR-153 Table C: min 60, max 180 mg/L as CaCO3. Two acceptable ideal bands are stated (80-100 or 120) -- seeded here as 80-120, the union of both, rather than picking just one arbitrarily.",
    },
    {
      parameter: "CALCIUM_HARDNESS",
      minValue: 50,
      idealMin: 125,
      idealMax: 125,
      maxValue: 800,
      unit: "mg/L",
      sourceConfidence: "confirmed",
      notes: "SR-153 Table C: min 50, ideal 125, max 800 mg/L as CaCO3. Previously marked NOT FOUND in the earlier (wrong) research pass -- it's in SR-153 Table C, not §64-16-7 itself.",
    },

    { parameter: "TDS", minValue: 300, maxValue: 2000, unit: "mg/L", sourceConfidence: "confirmed", notes: "SR-153 Table C." },
    { parameter: "COPPER", appliesWhen: "copper-based algaecide, non-chelated", maxValue: 0.3, unit: "mg/L", sourceConfidence: "confirmed", notes: "SR-153 Table C, section E." },
    { parameter: "COPPER", appliesWhen: "copper-based algaecide, chelated", maxValue: 3.0, unit: "mg/L", sourceConfidence: "confirmed", notes: "SR-153 Table C, section E." },
    { parameter: "SILVER", appliesWhen: "silver-based algaecide", maxValue: 3.0, unit: "mg/L", sourceConfidence: "confirmed", notes: "SR-153 Table C, section E. Precipitates with cyanuric acid -- a cross-chemical interaction warning noted in the source, not a hard numeric rule, not separately modeled." },
    { parameter: "QUATERNARY_AMMONIUM", maxValue: 0, unit: "mg/L", sourceConfidence: "confirmed", notes: "SR-153 Table C, section E: not permitted in West Virginia public recreational water facilities at all -- same maxValue:0 convention used for Alaska's/Maine's outright chemical bans." },
    { parameter: "IRON", maxValue: 0.2, unit: "mg/L", sourceConfidence: "confirmed", notes: "SR-153 Table C." },
    { parameter: "MANGANESE", maxValue: 0.05, unit: "mg/L", sourceConfidence: "confirmed", notes: "SR-153 Table C." },

    { parameter: "CLARITY", unit: "", sourceConfidence: "confirmed", notes: "SR-153 Table C, section H / §64-16-7.5.a. No NTU figure -- main drain, or a 6-inch black disk on the deepest-point bottom, must be visible from the adjacent deck. Water-clarity failure closes only the affected area, not the whole facility (SR-153 Table A item F), per §64-16-13." },

    { parameter: "TEMPERATURE", maxValue: 105, unit: "°F", sourceConfidence: "confirmed", notes: "SR-153 Table C, general ceiling. A genuine outlier -- every other state collected in this dataset that specifies a general/spa temperature ceiling uses 104°F. Confirmed directly from SR-153, not a transcription slip toward the more common number." },
    { parameter: "TEMPERATURE", appliesWhen: "artificially heated indoor facility", minValue: 75, maxValue: 90, unit: "°F", sourceConfidence: "confirmed", notes: "SR-153 Table C." },
    {
      parameter: "TEMPERATURE",
      appliesWhen: "indoor air temperature, excluding hot-water facilities",
      unit: "°F",
      relationalRule: "Indoor air temperature must be maintained between (water temperature - 2°F) and (water temperature + 8°F) -- a relational range keyed to the water reading itself, not a flat number.",
      sourceConfidence: "confirmed",
      notes: "SR-153 Table C.",
    },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "not less than twice daily",
      intervalMinutes: 720,
      notes: "§64-16-8 (bathing beaches excepted), recorded and submitted on weekly summaries to the Commissioner via Form ER-32. Test kits must use the DPD method for chlorine; test strips/ORP may supplement but cannot replace the required readings. Reagents replaced at the start of each season or whenever found defective, 1-year maximum shelf life.",
    },
    // No TOTAL_ALKALINITY/CYANURIC_ACID frequency row -- §64-16-8 requires approved test
    // equipment for both to be on hand but never states a testing cadence for either, see
    // the matching GAP ComplianceNote below.
  ],
  eventProtocols: [
    {
      triggerType: "UNIFIED_CLOSURE_CHECKLIST",
      triggerLabel: "Any of §64-16-13.1's eight enumerated closure conditions",
      closureKind: "ENUMERATED_CHECKLIST",
      reopeningCondition: "Correct the specific condition(s) that triggered closure, then reopen. §64-16-13.4 requires a written record of every closure event (date, description, corrective action) regardless of category.",
      remediationSteps:
        "§64-16-13.1(a)-(h), verbatim: (a) free chlorine <1.0 mg/L; (b) pH >7.8; (c) pH <7.2; (d) inadequate lifeguards or lifesaving equipment (count scales with patron load x water surface area per Table 64-16 B); (e) an accident causing a lifeguard to leave station, or resulting in discharge of body fluids into the water; (f) free bromine <2.0 mg/L; (g) failure of the circulation pump or disinfectant feed equipment (SR-153 adds: also close if main drain covers are missing, loose, or broken); (h) a fecal accident occurs, or blood or vomitus is released into the water.",
      sourceConfidence: "confirmed",
      notes:
        "This is the corrected closure list -- the original research pass cited §64-16-5.4 (which doesn't contain a closure list at all) and concluded pH and fecal/vomit/blood had no closure trigger. Both (b)/(c) and (h) directly contradict that. Same flat enumerated-checklist shape as Delaware/Georgia/Illinois.",
    },
    {
      triggerType: "CHEMISTRY_HAZARD_THRESHOLD",
      triggerLabel: "Combined chlorine reaches 0.2 mg/L or more",
      closureKind: "DESCEND_BELOW_CEILING",
      reopeningCondition: "SR-153 Table C, section F: super-chlorinate to 10x the combined-chlorine reading, performed while the facility is not in use. May reopen once free chlorine drops back below 5.0 mg/L -- the same descending-below-a-ceiling reopening shape as Florida's breakpoint-chlorination rule.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "FECAL_OR_VOMIT_OR_BLOOD",
      triggerLabel: "Formed stool, visible blood, or vomit discharged into the water -- Cleanup Procedure A",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 25,
      ctValue: 50,
      ctValueUnit: "mg/L*min",
      reopeningCondition:
        "SR-153 Table A, item I: evacuate all patrons from contaminated water, no reentry until decontamination is complete. Raise/maintain free chlorine at 2 mg/L, adjust pH to 7.2-7.5, maintain for at least 25 minutes, filtration running throughout.",
      remediationSteps:
        "Removal via net/scoop only -- vacuuming stool or vomitus from the water is explicitly not recommended. Dispose of material sanitarily; clean and disinfect the net/scoop (leaving it immersed in the pool during disinfection is one acceptable method).",
      sourceConfidence: "confirmed",
      notes:
        "★ Blood is grouped into this SAME (lighter) procedure as formed stool and vomit, not exempted (unlike NY/DE/OR's 'does not pose a public health risk' language) and not treated as an equal-severity trigger requiring the heavier diarrheal protocol either (unlike Washington). West Virginia requires closure for blood the same as fecal/vomit (§64-16-13.1.h) but explicitly assigns it this lighter 2 mg/L/25 min procedure -- a fourth distinct blood-handling pattern in this dataset.",
    },
    {
      triggerType: "FECAL_DIARRHEAL",
      triggerLabel: "Loose/diarrheal stool -- Cleanup Procedure B",
      closureKind: "FIXED_DURATION",
      minimumDurationMinutes: 1920,
      ctValue: 9600,
      ctValueUnit: "mg/L*min",
      reopeningCondition:
        "SR-153 Table A, item I: same evacuation/removal as Cleanup Procedure A. Raise chlorine to pH 7.2-7.5 and one of four equivalent CT options: 5 mg/L for 32 hours (seeded here), 10 mg/L for 16 hours, 15 mg/L for 12 hours, or 20 mg/L for 8 hours. Filtration running throughout; backwash or replace filter media afterward; reduce free chlorine to below 5 mg/L before reentry.",
      sourceConfidence: "confirmed",
      notes:
        "Three of the four stated options compute to CT=9,600 mg/L*min (5/32, 10/16, 20/8); the 15 mg/L/12 hr option computes to 10,800, not 9,600 -- a real internal inconsistency in WV's own published table, seeded faithfully rather than 'corrected' toward a uniform number. No separate CYA-present doubling clause is stated in this table, unlike Delaware/Oregon/New York.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "Total alkalinity and cyanuric acid testing frequency isn't explicitly stated -- §64-16-8 only requires approved test equipment for both to be on hand.",
      detail: "No FrequencyRule row seeded for either rather than inventing a cadence.",
    },
    {
      kind: "ASSUMPTION",
      summary: "64CSR3 and 46CSR1 (cross-referenced in §64-16-7 for \"additional\" chemical/bacteriological standards) weren't pulled directly this pass.",
      detail: "SR-153 Table C likely already supersedes the need for this (it's a complete, granular chemistry table on its own), but that isn't fully confirmed.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "A two-tier qualified-operator requirement, defined by response time rather than visit count: a \"Qualified Water Facility Operator\" must hold a Certified Pool Operator certification; an \"Available Qualified Water Facility Operator\" must be reachable by phone within 30 minutes, on-site within 60 minutes, and physically visit the facility at least once per week (§64-16-2).",
      detail: "A staffing/response-time requirement, not a chemistry reading or closure trigger -- not modeled as a schema row, same treatment as Georgia's operator-visit-cadence note.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "Table 64-16 B is a lifeguard-count matrix (patron count x water surface area) referenced by §64-16-13.1.d -- not transcribed into a schema row this pass.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Wisconsin -- Wis. Admin. Code ch. ATCP 76 (renumbered from DHS 172, effective
// 9/24/2025). Regulated by DATCP (Dept. of Agriculture, Trade and Consumer
// Protection), not a health department -- a second confirmed non-health-dept
// regulator in this dataset, alongside Wyoming. Genuine two-tier gap, independently
// verified against two sources: cyanuric acid's routine operating ceiling is 30 ppm,
// but the mandatory-closure trigger doesn't fire until CYA exceeds 300 ppm -- a 10x
// gap, wider than any other state's operating-ceiling/closure-trigger spread
// collected. Don't "correct" 30 ppm toward the more common 100-150 ppm range other
// states use -- it's real. CYA is also flatly banned at indoor pools/therapy
// pools/whirlpools effective 9/24/2025 (a recent rule change, not longstanding).
// The fecal/vomit/blood rule incorporates CDC guidance by reference (§76.31(1))
// rather than codifying its own CT values -- same shape as Texas/Utah's
// CDC-incorporation pattern, quoted directly rather than borrowing another state's
// numbers as Wisconsin's own.
// ---------------------------------------------------------------------------
const WISCONSIN: StateSeed = {
  state: "WI",
  ruleset: {
    stateName: "Wisconsin",
    healthDepartmentName:
      "Wisconsin Department of Agriculture, Trade and Consumer Protection (DATCP), Bureau of Food and Recreational Businesses -- enforcement locally delegated to agent (county/municipal) health departments in most jurisdictions.",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "Wis. Admin. Code ch. ATCP 76, \"Safety, Maintenance, and Operation of Public Pools and Water Attractions\" (created under CR 22-021, effective 9/24/2025, renumbered from DHS 172) -- disinfectant/sanitizer residuals at 76.14, water quality/clarity at 76.16, test kits at 76.17, testing frequency at 76.18, water supply/temperature at 76.19, closure criteria at 76.30, fecal/vomit/blood response at 76.31. Construction/design standards (76.34-76.38, formerly SPS 390) not reviewed.",
    sourceDocument:
      "Wis. Admin. Code ch. ATCP 76, full chapter PDF (Wisconsin Legislature, official), read via direct text extraction (pdftotext); the 30 ppm/300 ppm CYA figures and the 9/24/2025 indoor ban date were independently re-confirmed against the Legislature's own HTML text for ATCP 76.14.",
    recordRetentionMonths: 12,
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "No single statewide DATCP-issued PDF form was found -- 76.32 requires reports \"on forms provided by the department,\" but in practice agent health departments issue their own monthly report forms (e.g. South Milwaukee/St Francis Health Dept.'s \"Monthly Report on Public Pool Operation,\" which cites Chapter DATCP 76 directly) -- content requirements are codified, the specific form isn't, same shape as Delaware.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under Wis. Admin. Code ch.
ATCP 76 (effective 9/24/2025).

### Chemistry targets
- **Free chlorine:** 1.0 ppm minimum without cyanuric acid, 2.0 ppm with (swimming/
  activity pools); higher minimums for wading and therapy pools
- **Bromine:** 3.0 ppm minimum (pools), 4.0 ppm minimum (wading/therapy)
- **pH:** 7.2 – 7.8 (closure band: 6.8 – 8.0)
- **Cyanuric acid:** 30 ppm routine operating ceiling, but closure doesn't trigger until
  above 300 ppm — a real 10x gap between the two, not a typo. Banned entirely at indoor,
  therapy, and whirlpool venues.
- **Total alkalinity:** 60 – 180 ppm

### Fecal/vomit/blood response
Wisconsin requires operators to follow published CDC guidance directly for any fecal
accident, vomit, or blood incident, rather than codifying its own CT values — closure
itself is a separate "immediate danger to health or safety" trigger.

*This page reflects AquaRunner's built-in rule engine, not a substitute for Wisconsin
DATCP's own published code. Verify against the authoritative source for anything
compliance-critical.*`,
  },
  chemistryThresholds: [
    {
      parameter: "PH",
      minValue: 7.2,
      maxValue: 7.8,
      hazardMin: 6.8,
      hazardMax: 8.0,
      unit: "",
      sourceConfidence: "confirmed",
      notes:
        "76.14(5)(c) routine range; 76.30(1)(c) closure band is 6.8 to >=8.0 -- note this closure band is NOT symmetric with the 7.2-7.8 operating range the way most other states' closure bands mirror their target exactly (Wisconsin's upper closure trigger sits tighter than a naive +/-0.2 read would suggest).",
    },

    // Table A splits FREE_CHLORINE three ways by pool subtype (swimming/activity,
    // wading, whirlpool/exercise/therapy) AND by stabilizer presence within each --
    // this app only tracks POOL/SPA/WADING_POOL, so swimming/activity maps to POOL,
    // whirlpool/exercise/therapy maps to SPA, and wading pools get their own
    // WADING_POOL-scoped rows (not resolved by the app's current POOL/SPA-only
    // chlorineFamilyThreshold lookup, seeded for completeness -- see ComplianceNote).
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "no CYA present", minValue: 1.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "76.14 Table A, swimming/activity pools, no stabilizer. DEFAULT_CONDITION_PRIORITY default row." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", appliesWhen: "CYA present", minValue: 2.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "76.14 Table A, swimming/activity pools, with stabilizer." },
    {
      parameter: "FREE_CHLORINE",
      disinfectionMethod: "CHLORINE",
      bodyOfWaterCategory: "POOL",
      appliesWhen: "electronic monitoring device in use",
      minValue: 1.0,
      maxValue: 10.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes: "76.14 Table A -- 1.0 ppm minimum applies regardless of stabilizer presence when an electronic monitoring device is used, a facility-equipment condition distinct from the CYA branch above. Not the DEFAULT_CONDITION_PRIORITY row (that string isn't in the priority list), so this variant isn't automatically surfaced by the app -- see ComplianceNote.",
    },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "WADING_POOL", appliesWhen: "no CYA present", minValue: 2.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "76.14 Table A, wading pools, no stabilizer." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "WADING_POOL", appliesWhen: "CYA present", minValue: 4.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "76.14 Table A, wading pools, with stabilizer." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", appliesWhen: "no CYA present", minValue: 3.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "76.14 Table A, whirlpool/exercise/therapy pools, no stabilizer -- mapped to this app's SPA category." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", appliesWhen: "CYA present", minValue: 6.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "76.14 Table A, whirlpool/exercise/therapy pools, with stabilizer." },

    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 3.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "76.14(5)(g), swimming/activity pools." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "WADING_POOL", minValue: 4.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "76.14(5)(g), wading pools." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 4.0, maxValue: 10.0, unit: "ppm", sourceConfidence: "confirmed", notes: "76.14(5)(g), whirlpool/exercise/therapy pools." },

    {
      parameter: "CYANURIC_ACID",
      maxValue: 30,
      hazardMax: 300,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "76.14(2)(b)1. (30 ppm routine operating ceiling) and 76.14(2)(b)2./76.30(1)(j) (closure trigger above 300 ppm) -- a genuine 10x two-tier gap, independently verified against the Wisconsin Legislature's own HTML text as well as the PDF, not a transcription artifact. Same range applies to all pool types (no separate wading/whirlpool figure stated) -- one unconditional row.",
    },

    { parameter: "TOTAL_ALKALINITY", minValue: 60, maxValue: 180, unit: "ppm", sourceConfidence: "confirmed", notes: "76.14(5)(d), unless the operator demonstrates an alternate balanced-water level to the department." },

    { parameter: "CLARITY", unit: "", sourceConfidence: "confirmed", notes: "76.16(2). Main drain grating and its cover pattern must be readily visible from the pool deck -- a visibility standard, not an NTU number." },

    { parameter: "TEMPERATURE", bodyOfWaterCategory: "POOL", indoorOutdoor: "indoor", minValue: 70, maxValue: 90, unit: "°F", sourceConfidence: "confirmed", notes: "76.19(4)(b)1." },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "POOL", indoorOutdoor: "outdoor", minValue: 65, unit: "°F", sourceConfidence: "confirmed", notes: "76.19(4)(b)2. No stated maximum for outdoor pools." },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", minValue: 90, maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "76.19(4)(c), whirlpools -- source states \"greater than 90°F,\" seeded as minValue:90 (an inclusive approximation of an exclusive floor); max 104°F." },

    { parameter: "ORP", appliesWhen: "if used as controller", minValue: 650, maxValue: 900, unit: "mV", sourceConfidence: "confirmed", notes: "76.14(6)(a). Readings outside this band require manual test-kit confirmation -- doesn't waive manual testing." },
    // No CALCIUM_HARDNESS row -- confirmed absent from ch. ATCP 76 entirely, see GAP
    // ComplianceNote below.
  ],
  frequencyRules: [
    { parameter: "DISINFECTANT_AND_PH", cadence: "daily before opening, plus at least one more time during peak patron load", intervalMinutes: 720, notes: "76.18, standard (non-whirlpool/therapy/exercise) pools -- a firm 2x/day minimum, not an adequacy-based standard." },
    { parameter: "COMBINED_CHLORINE", appliesWhen: "chlorine used", cadence: "at least twice weekly", intervalMinutes: 5040, notes: "76.18, standard pools." },
    { parameter: "TOTAL_ALKALINITY", cadence: "at least weekly", intervalMinutes: 10080, notes: "76.18." },
    { parameter: "CYANURIC_ACID", appliesWhen: "if used", cadence: "at least weekly", intervalMinutes: 10080, notes: "76.18." },
    {
      parameter: "DISINFECTANT_AND_PH",
      facilityAttribute: "whirlpool/therapy/exercise pool",
      cadence: "at least 4 times daily, two of which must fall during peak patron load",
      intervalMinutes: 360,
      notes: "76.18. Tighter cadence than standard pools.",
    },
    { parameter: "COMBINED_CHLORINE", facilityAttribute: "whirlpool/therapy/exercise pool", appliesWhen: "chlorine used", cadence: "at least daily", intervalMinutes: 1440, notes: "76.18 -- tighter than standard pools' twice-weekly cadence." },
    {
      parameter: "DISINFECTANT_AND_PH",
      facilityAttribute: "electronic monitoring device in use",
      cadence: "manual test at least once daily even with automated control",
      intervalMinutes: 1440,
      notes: "76.18. Automation reduces neither the alkalinity/CYA cadence nor the duty to spot-check manually.",
    },
  ],
  eventProtocols: [
    {
      triggerType: "UNIFIED_CLOSURE_CHECKLIST",
      triggerLabel: "Any of 76.30(1)'s ten enumerated closure criteria",
      closureKind: "ENUMERATED_CHECKLIST",
      reopeningCondition: "Correct the specific condition(s) that triggered closure, then reopen.",
      remediationSteps:
        "76.30(1): hazardous substance/object or any condition creating immediate danger including fecal accidents; failure to meet 76.16 water quality; failure to meet 76.14 disinfectant residuals or the 6.8/>=8.0 pH band; nonoperational recirculation pump, filter, or feeder; insufficient lifeguards/attendants; absent responsible supervisor; nonfunctional emergency phone; pool under maintenance/repair; gate/door missing self-closing/latching hardware (unless actively staffed); cyanuric acid above 300 ppm.",
      sourceConfidence: "confirmed",
      notes: "Same flat enumerated-checklist shape as Delaware/Georgia.",
    },
    {
      triggerType: "CYA_IN_USE",
      triggerLabel: "Cyanuric acid exceeds 300 ppm",
      closureKind: "CHEMISTRY_HAZARD_THRESHOLD",
      reopeningCondition: "76.14(2)(b)2./76.30(1)(j): closure required once CYA exceeds 300 ppm -- reopen once CYA is brought back to 300 ppm or below. Distinct from the 30 ppm routine operating ceiling, which is a standing violation but not itself a closure trigger.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "CYA_IN_USE",
      triggerLabel: "Cyanuric acid use at an indoor pool, therapy pool, or whirlpool",
      appliesWhen: "indoor pool, therapy pool, or whirlpool, effective 9/24/2025",
      closureKind: "AUTHORITY_MANDATORY",
      reopeningCondition: "76.14(2)(a): \"Cyanuric acid-containing disinfectant or sanitizer may not be used at an indoor pool, therapy pool, or whirlpool, beginning September 24, 2025.\" A flat, immediate, universal ban for this category -- not a phase-out window like Oregon's 4-year transition for new/altered construction. A recent (2025) rule change, not longstanding.",
      sourceConfidence: "confirmed",
    },
    {
      triggerType: "FECAL_OR_VOMIT_OR_BLOOD",
      triggerLabel: "Fecal accident, vomit, or blood incident",
      closureKind: "UNTIL_RETEST_PASSES",
      externalReferenceLabel: "CDC guidelines for fecal accident, vomit, and blood incidents in pools used for swimming (named in 76.31(1))",
      reopeningCondition:
        "76.31(1), quoted in full: \"In responding to a fecal accident, vomit, and blood incident, the operator shall follow the guidelines for a fecal accident, vomit, and blood incident in pools used for swimming published by the United States centers for disease control and prevention.\" Wisconsin's own text does not restate CDC's numbers -- a direct incorporation by reference, not a codified CT table. Closure itself is separately triggered as an \"immediate danger to health or safety\" under 76.30(1)(a).",
      remediationSteps:
        "76.31(2) requires a specific documentation package regardless of the CDC-sourced numeric target: date/time of the event; chemical readings (free chlorine or bromine, CYA, pH) both at the time of the event and again after cleanup/before reopening; whether the stool was formed or loose; procedures followed; patron count at the time; and total duration from occurrence to resolution.",
      sourceConfidence: "confirmed",
      notes:
        "Same CDC-incorporation-by-reference shape as Texas/Utah, quoted directly from Wisconsin's own text rather than borrowing another state's CT numbers as Wisconsin's own. No blood-specific exemption is stated one way or the other in Wisconsin's own text -- the operative standard is \"follow the CDC guidance,\" so Wisconsin's practical answer likely matches the CDC document's own low-risk treatment of blood (as independently codified by New York/Delaware/Oregon), but that inference comes from the CDC document, not Wisconsin's regulatory text itself. Don't seed a BLOOD/NO_CLOSURE_REQUIRED row for Wisconsin on that inference alone.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "Calcium hardness has no numeric standard anywhere in ch. ATCP 76 -- confirmed absent, not a research gap.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Cyanuric acid is flatly banned at indoor pools, therapy pools, and whirlpools effective 9/24/2025 (76.14(2)(a)), but the app's CYANURIC_ACID lookup (lib/compliance.ts) is always unconditional, so this indoor-category ban can't currently be distinguished from the 30/300 ppm routine figures seeded above.",
      detail: "Same class of limitation as DC's/Montana's/Rhode Island's indoor-outdoor or facility-subtype CYA-scoping gaps -- a real accuracy gap for Wisconsin indoor/therapy/whirlpool facilities specifically. Properly fixing this means tracking body-of-water-scoped bans separately from ranges, a real code change out of scope for a data-seeding pass.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Wisconsin's FREE_CHLORINE/BROMINE Table A splits pool subtype three ways (swimming/activity, wading, whirlpool/exercise/therapy); this app only tracks POOL/SPA/WADING_POOL, so whirlpool/exercise/therapy was mapped onto SPA and wading pools onto the WADING_POOL category.",
      detail: "The app's current chlorineFamilyThreshold/activeReadingFields lookups only resolve POOL or SPA (a body's type maps to \"SPA\" only when BodyOfWaterType is literally SPA, everything else including WADING_POOL maps to \"POOL\") -- so the WADING_POOL-scoped rows seeded above aren't automatically surfaced by current app logic for a body configured as a wading pool. Seeded for completeness and future use, not because the app resolves them today.",
    },
    {
      kind: "ASSUMPTION",
      summary: "The \"electronic monitoring device in use\" 1.0 ppm chlorine floor (76.14 Table A) is a real conditional the app can't currently branch on -- it isn't one of DEFAULT_CONDITION_PRIORITY's tie-break strings, so the app's automatic lookup resolves to the CYA-presence-based rows instead, never this equipment-based one.",
    },
    {
      kind: "OUT_OF_SCOPE",
      summary: "ATCP 76.34-76.38 (construction/design standards, formerly SPS 390) was not reviewed this pass -- only 76.14-76.31 (operation).",
    },
  ],
};

// ---------------------------------------------------------------------------
// Wyoming -- WY Admin. Code, Agency 010 (Dept. of Agriculture), Sub-Agency 0008.
// Regulated by the Wyoming Department of Agriculture, Consumer Health Services
// Division -- not a health department, the same non-health-dept pattern as
// Michigan/Kansas/New Hampshire (a second confirmation alongside Wisconsin of
// state pool authority sitting outside a health agency). CYA is banned in
// indoor pools/spas AND in brominated pools/spas without prior approval --
// broader than the usual indoor-only ban. Total alkalinity's IDEAL band (not
// its min/max) depends on sanitizer type -- a second independent confirmation
// of Arkansas's sanitizer-conditional-range pattern. Closure is a blanket
// rule: any of the ~10 listed §1(a) parameters out of range independently
// requires immediate closure. No fecal/vomit/blood protocol exists anywhere
// in the rule's 7 chapters -- confirmed via the official table of contents,
// same confirmed-absence shape as Pennsylvania.
// ---------------------------------------------------------------------------
const WYOMING: StateSeed = {
  state: "WY",
  ruleset: {
    stateName: "Wyoming",
    healthDepartmentName:
      "Wyoming Department of Agriculture (WDA), Consumer Health Services (CHS) Division -- not a health department. Administers the Wyoming Swimming Pool and Spa Health and Safety Act.",
    isSupported: true,
    jurisdictionLevel: "STATE",
    countyName: null,
    officialCitation:
      "Wyoming Administrative Code, Agency 010 (Dept. of Agriculture), Sub-Agency 0008 (Public Swimming Pools) -- chemistry/testing at Chapter 5, \"Water Quality, Test Kits, Record Keeping\" (Reference No. 010.0008.5.10092003); definitions/operator/record requirements at Chapter 1.",
    sourceDocument:
      "Chapter 5: Water Quality, Test Kits, Record Keeping (Wyoming Dept. of Agriculture, official PDF), read via direct pdftotext extraction; Chapter 1: General Provisions (official PDF); table of contents for all 7 chapters (official PDF)",
    logSheetSource: "BUILT_FROM_CODE",
    logSheetSourceNotes:
      "Chapter 1 §10(a) specifies exactly what a record must contain and how long to keep it, but WDA's own pools page (checked directly) lists only a Plan Review Worksheet, a Variance Request form, and a CPO brochure -- no downloadable water-quality log form.",
    referenceContent: `AquaRunner enforces the following for commercial pools/spas under Wyoming Chapter 5
(Water Quality, Test Kits, Record Keeping).

### Chemistry targets
- **Free chlorine:** 1.0 – 8.0 ppm (pools), 2.0 – 8.0 ppm (spas)
- **Bromine:** 2.5 – 12.0 ppm (pools), 4.5 – 12.0 ppm (spas)
- **pH:** 7.0 – 7.8
- **Cyanuric acid:** must not exceed 100 ppm — banned in indoor pools/spas and in
  brominated pools/spas without prior approval
- **Total alkalinity:** 60 – 180 ppm
- **Calcium hardness:** 150 – 1,000 ppm

### Closure triggers
A blanket rule: if testing shows any Chapter 5 parameter out of range, the operator must
immediately close, reopening only once a retest confirms compliance.

### What Wyoming's code doesn't specify
No fecal/vomit/blood contamination protocol exists anywhere in the rule's 7 chapters —
confirmed absent via the official table of contents, not a research gap.

*This page reflects AquaRunner's built-in rule engine, not a substitute for the Wyoming
Department of Agriculture's own published rules. Verify against the authoritative source
for anything compliance-critical.*`,
  },
  chemistryThresholds: [
    { parameter: "PH", minValue: 7.0, idealMin: 7.4, idealMax: 7.6, maxValue: 7.8, unit: "", sourceConfidence: "confirmed", notes: "Chapter 5 §1(a). Same range for pools and spas -- one unconditional row." },

    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "POOL", minValue: 1.0, idealMin: 2.0, idealMax: 3.0, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Chapter 5 §1(a). Not CYA-branched in the source -- one flat range. The 8.0 ppm maximum is the code's own stated figure, not derived from a product-label deferral." },
    { parameter: "FREE_CHLORINE", disinfectionMethod: "CHLORINE", bodyOfWaterCategory: "SPA", minValue: 2.0, idealMin: 3.0, idealMax: 5.0, maxValue: 8.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Chapter 5 §1(a)." },

    { parameter: "COMBINED_CHLORINE", maxValue: 0.5, unit: "ppm", sourceConfidence: "confirmed", notes: "Chapter 5 §1(a). Ceiling only, no stated minimum." },

    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "POOL", minValue: 2.5, idealMin: 2.5, idealMax: 6.0, maxValue: 12.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Chapter 5 §1(a)." },
    { parameter: "BROMINE", disinfectionMethod: "BROMINE", bodyOfWaterCategory: "SPA", minValue: 4.5, idealMin: 5.5, idealMax: 7.5, maxValue: 12.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Chapter 5 §1(a)." },

    {
      parameter: "CYANURIC_ACID",
      idealMin: 10.0,
      idealMax: 40.0,
      maxValue: 100.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "Chapter 5 §1(a). May not be used in indoor pools/spas, OR in brominated pools/spas, without prior regulatory approval -- broader than the indoor-only ban seen in Delaware/Indiana/Iowa/Minnesota/Montana, extending the default prohibition to brominated installations too. Not modeled as a separate row since the app doesn't track indoor/outdoor or disinfection-restriction axes -- see ComplianceNote.",
    },

    {
      parameter: "TOTAL_ALKALINITY",
      minValue: 60.0,
      maxValue: 180.0,
      unit: "ppm",
      sourceConfidence: "confirmed",
      notes:
        "Chapter 5 §1(a). Min (60) and max (180) are fixed regardless of sanitizer, but the IDEAL sub-range depends on sanitizer type (80-100 ppm for calcium/lithium/sodium hypochlorite vs. 100-120 ppm for sodium dichlor/chlorine gas/bromine) -- a second independent confirmation of Arkansas's sanitizer-conditional-range pattern. This app doesn't track disinfectant chemical sub-type (only CHLORINE/BROMINE via disinfectionMethod), so no idealMin/idealMax is set here rather than picking one branch silently -- see ComplianceNote.",
    },

    { parameter: "CALCIUM_HARDNESS", minValue: 150.0, idealMin: 200.0, idealMax: 400.0, maxValue: 1000.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Chapter 5 §1(a). Source gives a maximum RANGE (500-1000) rather than one number -- seeded using the upper bound (1000) as the outer ceiling." },
    { parameter: "TDS", minValue: 300.0, idealMin: 1000.0, idealMax: 2000.0, maxValue: 5000.0, unit: "ppm", sourceConfidence: "confirmed", notes: "Chapter 5 §1(a)." },

    { parameter: "TEMPERATURE", bodyOfWaterCategory: "POOL", idealMin: 78, idealMax: 82, maxValue: 98, unit: "°F", sourceConfidence: "confirmed", notes: "Chapter 5 §1(a). No stated minimum (N/A in the source)." },
    { parameter: "TEMPERATURE", bodyOfWaterCategory: "SPA", idealMax: 102, maxValue: 104, unit: "°F", sourceConfidence: "confirmed", notes: "Chapter 5 §1(a). No stated minimum (N/A in the source)." },

    { parameter: "ORP", appliesWhen: "optional, supplemental", minValue: 650, unit: "mV", sourceConfidence: "confirmed", notes: "Chapter 5 §1(a). Minimum only, explicitly optional/supplemental -- not a required reading." },
  ],
  frequencyRules: [
    {
      parameter: "DISINFECTANT_AND_PH",
      cadence: "once prior to opening, every 4 hours during operation, and once prior to closing",
      intervalMinutes: 240,
      notes: "Chapter 5 §2(a)(i)-(iii). Also covers water clarity and temperature on the same cadence.",
    },
    { parameter: "TOTAL_ALKALINITY", cadence: "at least once each week the pool is open", intervalMinutes: 10080, notes: "Chapter 5 §2(c)." },
    { parameter: "CALCIUM_HARDNESS", cadence: "at least once each week the pool is open", intervalMinutes: 10080, notes: "Chapter 5 §2(c)." },
    { parameter: "CYANURIC_ACID", appliesWhen: "if used", cadence: "each month the pool is open", intervalMinutes: 43200, notes: "Chapter 5 §2(d)." },
  ],
  eventProtocols: [
    {
      triggerType: "RED_STATUS_ANY_PARAMETER",
      triggerLabel: "Any Chapter 5 §1(a) chemistry parameter out of its min/max band",
      closureKind: "UNTIL_RETEST_PASSES",
      reopeningCondition:
        "Chapter 5 §2(b): if testing shows the water out of compliance with ANY parameter listed in §1(a) -- not just pH/chlorine specifically -- \"the operator shall immediately close the pool, spa or similar installation,\" reopening only once retesting confirms compliance (§2(b)(i)). A blanket rule tied directly to the entire §1(a) table, broader than states with an enumerated closure checklist (Georgia, Delaware) or a two-tier discretionary/mandatory authority (Connecticut) -- any one of the ~10 listed parameters drifting out of range is independently sufficient to require closure.",
      sourceConfidence: "confirmed",
      notes: "Same broad any-parameter-triggers-closure shape as Rhode Island's §4.6.2(A) rule -- a second confirmation of this pattern.",
    },
  ],
  complianceNotes: [
    {
      kind: "GAP",
      summary: "No fecal/vomit/blood contamination protocol exists anywhere in Wyoming's public-pool rule.",
      detail:
        "The rule spans only 7 chapters (general/definitions; licensing/inspection; structural design; sanitary facilities/chemical feed equipment; water quality/testing/records; lifeguards/lifesaving equipment; bathhouses) -- confirmed against the official table of contents, not a partial-read miss. None of the 7 contains a bodily-fluid contamination or CT-value remediation protocol. Same confirmed-absence shape as Pennsylvania, not the MAHC-derived protocol found in most other states in this dataset.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Cyanuric acid is banned in indoor pools/spas AND in brominated pools/spas without prior regulatory approval -- broader than the indoor-only ban most other states use -- but this app's CYANURIC_ACID lookup is always unconditional, so this restriction can't currently be distinguished from the 100 ppm ceiling seeded above.",
      detail: "Same class of limitation as DC's/Montana's/Rhode Island's indoor-outdoor or body-type CYA-restriction gaps. Properly fixing this means tracking body-of-water-scoped and disinfection-method-scoped bans separately from ranges, a real code change out of scope for a data-seeding pass.",
    },
    {
      kind: "ASSUMPTION",
      summary: "Total alkalinity's ideal sub-range depends on sanitizer type (80-100 ppm for hypochlorites vs. 100-120 ppm for dichlor/gas/bromine) -- no idealMin/idealMax was seeded on the TOTAL_ALKALINITY row since the app doesn't track disinfectant chemical sub-type, only the fixed 60-180 ppm outer bound is set.",
      detail: "A second independent confirmation of Arkansas's sanitizer-conditional-range pattern (ARCHITECTURE NOTES item 1) -- unlike Arkansas, Wyoming only varies the ideal band this way; the min (60) and max (180) stay fixed regardless of sanitizer.",
    },
  ],
};

export const ALL_STATES: StateSeed[] = [
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
  NEW_MEXICO,
  NEW_YORK,
  GEORGIA,
  HAWAII,
  DELAWARE,
  DISTRICT_OF_COLUMBIA,
  IDAHO,
  ILLINOIS,
  INDIANA,
  IOWA,
  KANSAS,
  KENTUCKY,
  LOUISIANA,
  MAINE,
  MASSACHUSETTS,
  MICHIGAN,
  MINNESOTA,
  MISSISSIPPI,
  MISSOURI,
  MONTANA,
  NEBRASKA,
  NEW_HAMPSHIRE,
  NEW_JERSEY,
  NORTH_CAROLINA,
  NORTH_DAKOTA,
  OHIO,
  OKLAHOMA,
  OREGON,
  PENNSYLVANIA,
  RHODE_ISLAND,
  SOUTH_CAROLINA,
  SOUTH_DAKOTA,
  TENNESSEE,
  TEXAS,
  UTAH,
  VERMONT,
  VIRGINIA,
  WASHINGTON,
  WEST_VIRGINIA,
  WISCONSIN,
  WYOMING,
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
