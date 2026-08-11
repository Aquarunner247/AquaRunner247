import { prisma } from "@/lib/prisma";
import type { ComplianceRuleset, ChemistryThreshold, FrequencyRule, EventProtocol, DisinfectionMethod } from "@/generated/prisma/client";

/** Shown wherever no state-specific department name is known/configured yet. */
export const GENERIC_HEALTH_DEPARTMENT_LABEL = "your state/local health department";

/** Fallback cadence for accounts with no *active* ruleset (unsupported state, or none
 * linked yet). Applied uniformly regardless of compliance-active status -- this is a
 * testing-cadence practicality (CYA doesn't shift quickly), not a gated compliance
 * feature, so it isn't hidden by isComplianceActive the way hazard/target numbers are. */
export const DEFAULT_CYA_TEST_FREQUENCY_DAYS = 30;

/** A ComplianceRuleset with the child rows the app actually reads. See
 * COMPLIANCE_RULESET_NOTES.md -- ChemistryThreshold/FrequencyRule/EventProtocol hold
 * many rows per state now (per parameter x body-type x method), not flat fields. */
export type ComplianceRulesetWithRules = ComplianceRuleset & {
  chemistryThresholds: ChemistryThreshold[];
  frequencyRules: FrequencyRule[];
  eventProtocols: EventProtocol[];
};

/**
 * Loads the ComplianceRuleset linked to an organization, if any, with the child rows
 * needed to derive chemistry thresholds/frequency/fee. A null return covers two cases
 * identically: the org hasn't been assigned a ruleset yet, or its state's ruleset exists
 * but isSupported is false. Both mean "no compliance features" to every caller here --
 * see isComplianceActive.
 */
export async function getOrganizationRuleset(organizationId: string): Promise<ComplianceRulesetWithRules | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      complianceRuleset: {
        include: { chemistryThresholds: true, frequencyRules: true, eventProtocols: true },
      },
    },
  });
  return org?.complianceRuleset ?? null;
}

/**
 * Whether this account should be treated as having commercial pools at all -- the signal
 * that decides whether to show compliance UI (vs. treating it as residential-only).
 * `hasCommercialPools` is only ever set once, at signup, with no way to edit it afterward
 * except the Settings page -- so it drifts out of sync the moment an account that signed
 * up "no" (or predates the question entirely) later adds a commercial customer. Real
 * Property data is the actual ground truth every other commercial/residential feature in
 * the app already keys off of, so it overrides a stale/unset flag rather than the other
 * way around.
 */
export async function organizationHasCommercialPools(organizationId: string, storedFlag: boolean | null): Promise<boolean> {
  if (storedFlag) return true;
  const commercialProperty = await prisma.property.findFirst({
    where: { organizationId, propertyType: "COMMERCIAL" },
    select: { id: true },
  });
  return commercialProperty != null;
}

/** True only when a ruleset is linked AND fully built out -- the single gate every
 * compliance-feature check (QR log hazard banners, closure-risk dashboard alerts, the
 * chemistry rule engine) should go through, per multi-state-compliance-spec.md's
 * isSupported gating. Callers must check this before calling activeChemistryThresholds --
 * an unsupported/unlinked account gets those features hidden entirely, never silently
 * computed with Nevada's numbers. */
export function isComplianceActive(ruleset: ComplianceRulesetWithRules | null): ruleset is ComplianceRulesetWithRules {
  return ruleset != null && ruleset.isSupported;
}

/** True when this state's own frequency rules require testing more than once per day for
 * at least one parameter (any FrequencyRule with intervalMinutes under a day) -- the
 * signal the weekly route scheduler uses to decide whether a property can legitimately be
 * booked on more than one stop for the same weekday. A property in a state like Rhode
 * Island (every 2 hours) or Georgia (3x/day) genuinely needs multiple same-day visits;
 * the route scheduler's default "already scheduled this weekday" exclusion assumed that
 * never happens, which doesn't hold for those states. Gated behind isComplianceActive the
 * same as every other compliance-derived check -- an unsupported/unlinked account never
 * unlocks this based on incomplete data. */
export function requiresMultipleDailyVisits(ruleset: ComplianceRulesetWithRules | null): boolean {
  if (!isComplianceActive(ruleset)) return false;
  return ruleset.frequencyRules.some((r) => r.intervalMinutes != null && r.intervalMinutes > 0 && r.intervalMinutes < 1440);
}

/** The name to show in UI copy -- the real department name once known, otherwise a
 * generic label. Never hardcode "SNHD" or a department name directly in a component. */
export function healthDepartmentLabel(ruleset: ComplianceRulesetWithRules | null): string {
  return ruleset?.healthDepartmentName || GENERIC_HEALTH_DEPARTMENT_LABEL;
}

/** How often CYA needs re-testing, in days. Applies to every account uniformly (see the
 * const's doc comment) -- independent of isComplianceActive. Reads FrequencyRule's
 * intervalMinutes (the schema's single canonical cadence field, see
 * COMPLIANCE_RULESET_NOTES.md) rather than a dedicated flat field. */
export function cyaTestFrequencyDays(ruleset: ComplianceRulesetWithRules | null): number {
  const rule = ruleset?.frequencyRules.find((r) => r.parameter === "CYANURIC_ACID" && !r.isPerformanceBased);
  if (rule?.intervalMinutes) return Math.round(rule.intervalMinutes / (60 * 24));
  return DEFAULT_CYA_TEST_FREQUENCY_DAYS;
}

function toNumOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

/**
 * Picks the right ChemistryThreshold row for a parameter x body-type, handling states
 * that have more than one row for the same combination (a conditional variant plus a
 * default, e.g. Arkansas's spa chlorine "if stabilizer used" row alongside its normal
 * one). Prefers the unconditional (appliesWhen: null) row. If every match is
 * conditional -- a state whose rule genuinely always depends on something the app
 * doesn't track yet (Arkansas's alkalinity depends on whether CYA is in use, which
 * isn't tracked per account/property) -- falls back to `preferredAppliesWhen` if given,
 * otherwise the first match. This tie-break is a deliberate, documented simplification
 * (see COMPLIANCE_RULESET_NOTES.md), not a data gap -- the underlying data isn't lost,
 * just not fully condition-aware yet.
 */
function findThreshold(
  thresholds: ChemistryThreshold[],
  parameter: string,
  bodyOfWaterCategory: string | null,
  preferredAppliesWhen?: string | string[],
): ChemistryThreshold | undefined {
  const matches = thresholds.filter((t) => t.parameter === parameter && t.bodyOfWaterCategory === bodyOfWaterCategory);
  if (matches.length <= 1) return matches[0];
  const unconditional = matches.find((t) => t.appliesWhen == null);
  if (unconditional) return unconditional;
  const preferredList = preferredAppliesWhen == null ? [] : Array.isArray(preferredAppliesWhen) ? preferredAppliesWhen : [preferredAppliesWhen];
  for (const preferred of preferredList) {
    const match = matches.find((t) => t.appliesWhen === preferred);
    if (match) return match;
  }
  return matches[0];
}

/**
 * Ordered tie-break priority for FREE_CHLORINE lookups when a state has more than one
 * conditional row and no unconditional default (findThreshold tries these in order,
 * first match wins, before ever falling back to array order). Each entry is the
 * documented default variant for one state's specific condition family -- picking the
 * more common/permissive real-world case, same convention as alkalinity's
 * "unstabilized sanitizer (no CYA present)" default below:
 * - "no CYA present" (California, Georgia, New Mexico): defaults to the non-CYA chlorine
 *   floor when the app doesn't yet track per-account CYA use.
 * - "without a supplemental oxidizer" (Colorado): defaults to the floor most facilities
 *   actually operate under, since supplemental oxidizers aren't universal equipment.
 * - "pH <= 7.8" (New York): New York's chlorine minimum is genuinely pH-dependent
 *   (0.6 mg/L below pH 7.8, 1.5 mg/L from 7.8-8.2) -- a two-band version of the same
 *   curve/table-lookup pattern Alaska's Table E has, which this app's one-flat-target
 *   model can't represent natively. Defaulting to the lower, far-more-common band is a
 *   real simplification, not just a missing-data null: a reading whose actual pH sits in
 *   the 7.8-8.2 band gets compared against the LOWER band's 0.6 mg/L floor instead of the
 *   correct 1.5 mg/L floor, so a reading between 0.6-1.5 mg/L at high pH could be
 *   under-flagged as compliant when New York's own rule requires 1.5 mg/L at that pH.
 *   Flagged via a ComplianceNote on New York's seed record -- do not treat this the same
 *   as a clean "the state just doesn't have this rule" null.
 */
const DEFAULT_CONDITION_PRIORITY = ["no CYA present", "without a supplemental oxidizer", "pH <= 7.8"];

export type ChlorineFamilyThreshold = {
  /** Which VisitWaterReading column this threshold actually validates -- freeChlorinePpm
   * for chlorine, brominePpm for bromine. Never both; see BodyOfWater.disinfectionMethod's
   * doc comment for why a body of water only ever uses one at a time. */
  key: "freeChlorinePpm" | "brominePpm";
  label: string;
  unit: string;
  min: number | null;
  max: number | null;
};

/** CDC (Model Aquatic Health Code / Healthy Swimming) recognized practical upper limit for
 * free available chlorine in pools and spas. Applied ONLY when a state's own regulation
 * defines a floor but is silent on a ceiling (e.g. Hawaii: "minimum 0.6 ppm", no stated
 * max) -- the underlying ChemistryThreshold row still faithfully records the state has no
 * legal max; this is an app-level safety fallback layered on top of that, not a rewrite of
 * the sourced data. Deliberately NOT applied to Bromine -- its commonly cited practical
 * ceiling differs from chlorine's and isn't a number this app states as fact. */
const CDC_FREE_CHLORINE_MAX_PPM = 10;

/**
 * The hard floor/ceiling for whichever disinfectant this SPECIFIC body of water actually
 * uses -- disinfectionMethod is set per body of water, not per organization (one account
 * can have a chlorine pool and a bromine spa at the same property), so this must be
 * called per body/per reading, never precomputed once for a whole account the way
 * activeChemistryThresholds's other fields safely are. Returns null when this state's
 * data has no row at all for the selected method/body-type combination (e.g. Georgia has
 * no BROMINE row -- a body of water there configured for bromine gets no chlorine-family
 * threshold at all, a real signal the disinfectionMethod is probably misconfigured for
 * that state, not a fallback to chlorine's numbers).
 */
export function chlorineFamilyThreshold(
  ruleset: ComplianceRulesetWithRules,
  bodyOfWaterType: string,
  disinfectionMethod: DisinfectionMethod,
): ChlorineFamilyThreshold | null {
  const bodyCategory = bodyOfWaterType === "SPA" ? "SPA" : "POOL";
  const parameter = disinfectionMethod === "BROMINE" ? "BROMINE" : "FREE_CHLORINE";
  const threshold = findThreshold(ruleset.chemistryThresholds, parameter, bodyCategory, DEFAULT_CONDITION_PRIORITY);
  if (!threshold) return null;
  const realMax = toNumOrNull(threshold.maxValue);
  return {
    key: parameter === "BROMINE" ? "brominePpm" : "freeChlorinePpm",
    label: parameter === "BROMINE" ? "Bromine" : "Free Chlorine",
    unit: threshold.unit || "ppm",
    min: toNumOrNull(threshold.minValue),
    max: realMax ?? (parameter === "FREE_CHLORINE" ? CDC_FREE_CHLORINE_MAX_PPM : null),
  };
}

/**
 * Chemistry target/hazard thresholds as plain numbers or null (Prisma Decimals aren't
 * directly comparable). Only call this once isComplianceActive(ruleset) is true --
 * callers gate on that first, so this never runs for an unsupported/unlinked account.
 *
 * Derives pH/alkalinity/CYA from this state's OWN ChemistryThreshold rows -- see
 * COMPLIANCE_RULESET_NOTES.md's "Migrating Nevada off the flat fields" section. Every
 * field can genuinely be `null`: a state's regulation may simply not define a hazard
 * tier, a minimum, or a target sub-range for a given parameter (Arizona has no hazard
 * tier on anything; Arkansas's CYA has no hazard cap at all). `null` here means "this
 * state doesn't have this rule," and callers must treat it that way -- never fall back to
 * a hardcoded number. Falling back to this SAME row's outer min/max when there's no
 * separate ideal sub-range (most non-Nevada states don't distinguish the two) is safe,
 * since it's still this state's own data.
 *
 * Does NOT include chlorine/bromine -- that's disinfectionMethod-dependent per body of
 * water, not a single per-account value the way pH/alkalinity/CYA are. Call
 * chlorineFamilyThreshold separately, per body of water, per reading.
 */
export function activeChemistryThresholds(ruleset: ComplianceRulesetWithRules) {
  const ph = findThreshold(ruleset.chemistryThresholds, "PH", null);
  // Arkansas's alkalinity always depends on sanitizer/CYA use with no unconditional
  // default -- the app doesn't track that per account yet, so "unstabilized (no CYA)"
  // is the documented default tie-break (see findThreshold's doc comment).
  const alkalinity = findThreshold(ruleset.chemistryThresholds, "TOTAL_ALKALINITY", null, "unstabilized sanitizer (no CYA present)");
  const cya = findThreshold(ruleset.chemistryThresholds, "CYANURIC_ACID", null);
  const feeProtocol = ruleset.eventProtocols.find((e) => e.feeAmount != null);

  return {
    phTargetMin: toNumOrNull(ph?.idealMin ?? ph?.minValue),
    phTargetMax: toNumOrNull(ph?.idealMax ?? ph?.maxValue),
    phHazardMin: toNumOrNull(ph?.hazardMin),
    phHazardMax: toNumOrNull(ph?.hazardMax),
    alkalinityTargetMinPpm: toNumOrNull(alkalinity?.idealMin ?? alkalinity?.minValue),
    alkalinityTargetMaxPpm: toNumOrNull(alkalinity?.idealMax ?? alkalinity?.maxValue),
    cyaTargetMinPpm: toNumOrNull(cya?.idealMin ?? cya?.minValue),
    cyaTargetMaxPpm: toNumOrNull(cya?.idealMax ?? cya?.maxValue),
    cyaHazardMaxPpm: toNumOrNull(cya?.hazardMax),
    closureFeeAmount: feeProtocol?.feeAmount != null ? Number(feeProtocol.feeAmount) : null,
    closureFeeNote: feeProtocol?.feeNote ?? null,
  };
}

export type ReadingFieldKey = "freeChlorinePpm" | "brominePpm" | "ph" | "alkalinityPpm" | "cyanuricAcidPpm" | "temperatureF";

export type ReadingFieldSpec = {
  key: ReadingFieldKey;
  label: string;
  unitLabel: string;
  required: boolean;
  /** Ideal/target range for the visit form's zone gauge -- null means this state's data
   * doesn't define one (still shown/required if applicable, just without a colored zone). */
  zoneMin: number | null;
  zoneMax: number | null;
};

/** The field set every commercial visit form showed before per-state field lists existed
 * (Free Chlorine, pH, Total Alkalinity, Cyanuric Acid, Temperature) -- used only when
 * compliance isn't active for this account (unsupported state, or none linked yet), so
 * those accounts see no behavior change. Never used for a live/supported state; those
 * always derive their own list from their own ChemistryThreshold rows below. */
function fallbackReadingFields(bodyOfWaterType: string): ReadingFieldSpec[] {
  return [
    { key: "freeChlorinePpm", label: "Free Chlorine", unitLabel: "ppm", required: true, zoneMin: bodyOfWaterType === "SPA" ? 3 : 2, zoneMax: 10 },
    { key: "ph", label: "pH", unitLabel: "", required: true, zoneMin: 7.2, zoneMax: 7.6 },
    { key: "alkalinityPpm", label: "Total Alkalinity", unitLabel: "ppm", required: true, zoneMin: 60, zoneMax: 120 },
    { key: "cyanuricAcidPpm", label: "Cyanuric Acid", unitLabel: "ppm", required: true, zoneMin: 0, zoneMax: 40 },
    { key: "temperatureF", label: "Water Temperature", unitLabel: "°F", required: true, zoneMin: 80, zoneMax: 104 },
  ];
}

/**
 * The actual field list a technician's visit form should show for THIS body of water --
 * derived entirely from the org's own linked ComplianceRuleset, per state, per body
 * type, per this body's own configured disinfectionMethod. A parameter shows at all only
 * when this state's own data defines a threshold for it (never a generic pool-industry
 * checklist) -- e.g. California/New Mexico/New York have no TOTAL_ALKALINITY row at all,
 * so their technicians don't see an Alkalinity field; Hawaii has no CYANURIC_ACID row, so
 * no CYA field. Falls back to the old fixed field set when compliance isn't active for
 * this account, so unsupported-state/no-state accounts see no behavior change.
 *
 * Free Chlorine and Bromine are mutually exclusive, not both shown -- a body of water
 * uses one disinfectant at a time (see BodyOfWater.disinfectionMethod's doc comment).
 * If this body's disinfectionMethod is BROMINE but the state's data has no BROMINE row
 * for this body type, no chlorine-family field shows at all -- a real, visible signal
 * that this state doesn't actually support bromine for this body type, worth the admin
 * correcting the body's disinfectionMethod rather than silently guessing.
 */
export function activeReadingFields(
  ruleset: ComplianceRulesetWithRules | null,
  bodyOfWaterType: string,
  disinfectionMethod: DisinfectionMethod,
  cyaRequired: boolean,
): ReadingFieldSpec[] {
  if (!isComplianceActive(ruleset)) {
    return fallbackReadingFields(bodyOfWaterType);
  }

  const bodyCategory = bodyOfWaterType === "SPA" ? "SPA" : "POOL";
  const fields: ReadingFieldSpec[] = [];

  const chlorineFamilyParameter = disinfectionMethod === "BROMINE" ? "BROMINE" : "FREE_CHLORINE";
  const chlorineFamily = findThreshold(ruleset.chemistryThresholds, chlorineFamilyParameter, bodyCategory, DEFAULT_CONDITION_PRIORITY);
  if (chlorineFamily) {
    const zoneMin = toNumOrNull(chlorineFamily.idealMin ?? chlorineFamily.minValue);
    const zoneMax = toNumOrNull(chlorineFamily.idealMax ?? chlorineFamily.maxValue);
    fields.push({
      key: chlorineFamilyParameter === "BROMINE" ? "brominePpm" : "freeChlorinePpm",
      label: chlorineFamilyParameter === "BROMINE" ? "Bromine" : "Free Chlorine",
      unitLabel: chlorineFamily.unit || "ppm",
      required: zoneMin != null || zoneMax != null,
      zoneMin,
      zoneMax,
    });
  }

  const ph = findThreshold(ruleset.chemistryThresholds, "PH", null);
  if (ph) {
    const zoneMin = toNumOrNull(ph.idealMin ?? ph.minValue);
    const zoneMax = toNumOrNull(ph.idealMax ?? ph.maxValue);
    fields.push({
      key: "ph",
      label: "pH",
      unitLabel: "",
      required: zoneMin != null || zoneMax != null,
      zoneMin,
      zoneMax,
    });
  }

  // Same documented default tie-break as activeChemistryThresholds above.
  const alkalinity = findThreshold(ruleset.chemistryThresholds, "TOTAL_ALKALINITY", null, "unstabilized sanitizer (no CYA present)");
  if (alkalinity) {
    const zoneMin = toNumOrNull(alkalinity.idealMin ?? alkalinity.minValue);
    const zoneMax = toNumOrNull(alkalinity.idealMax ?? alkalinity.maxValue);
    fields.push({
      key: "alkalinityPpm",
      label: "Total Alkalinity",
      unitLabel: alkalinity.unit || "ppm",
      // Hawaii has a TOTAL_ALKALINITY row (monthly testing is required) but no numeric
      // target at all -- a confirmed, permanent gap in the actual regulation, not missing
      // data (see state-compliance-data.md). Requiring a value here with nothing to
      // validate it against would block visit completion for no real reason, so this
      // stays optional whenever the row itself has no bounds, same principle as
      // Temperature below.
      required: zoneMin != null || zoneMax != null,
      zoneMin,
      zoneMax,
    });
  }

  const cya = findThreshold(ruleset.chemistryThresholds, "CYANURIC_ACID", null);
  if (cya) {
    const zoneMin = toNumOrNull(cya.idealMin ?? cya.minValue);
    const zoneMax = toNumOrNull(cya.idealMax ?? cya.maxValue);
    const unit = cya.unit || "ppm";
    // New Mexico's unconditional CYA row (matched here) is a "banned indoors" marker
    // with no bounds of its own -- its real numeric range is scoped to "outdoor pools/
    // spray pads only", a body-subtype distinction (indoor/outdoor) this app doesn't
    // track per body of water yet, same limitation class as Maryland's wading-pool FC
    // floor. Falling back to not-required/no-zone here is a safe default (never blocks
    // completion on an unverifiable number), not a precise rendering of NM's actual rule.
    const hasBounds = zoneMin != null || zoneMax != null;
    fields.push({
      key: "cyanuricAcidPpm",
      label: "Cyanuric Acid",
      unitLabel: cyaRequired && hasBounds ? unit : `${unit}, checked in the last ${cyaTestFrequencyDays(ruleset)} days`,
      required: hasBounds && cyaRequired,
      zoneMin,
      zoneMax,
    });
  }

  const temperature = findThreshold(ruleset.chemistryThresholds, "TEMPERATURE", null);
  if (temperature) {
    fields.push({
      key: "temperatureF",
      label: "Water Temperature",
      unitLabel: temperature.unit || "°F",
      // No state's source data frames temperature as a pass/fail requirement, just an
      // operating range -- shown when the state tracks it at all, never blocking.
      required: false,
      zoneMin: toNumOrNull(temperature.idealMin ?? temperature.minValue),
      zoneMax: toNumOrNull(temperature.idealMax ?? temperature.maxValue),
    });
  }

  return fields;
}
