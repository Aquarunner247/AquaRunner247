import { prisma } from "@/lib/prisma";
import type { ComplianceRuleset, ChemistryThreshold, FrequencyRule, EventProtocol } from "@/generated/prisma/client";

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
  preferredAppliesWhen?: string,
): ChemistryThreshold | undefined {
  const matches = thresholds.filter((t) => t.parameter === parameter && t.bodyOfWaterCategory === bodyOfWaterCategory);
  if (matches.length <= 1) return matches[0];
  const unconditional = matches.find((t) => t.appliesWhen == null);
  if (unconditional) return unconditional;
  if (preferredAppliesWhen) {
    const preferred = matches.find((t) => t.appliesWhen === preferredAppliesWhen);
    if (preferred) return preferred;
  }
  return matches[0];
}

/**
 * Chemistry target/hazard thresholds as plain numbers or null (Prisma Decimals aren't
 * directly comparable). Only call this once isComplianceActive(ruleset) is true --
 * callers gate on that first, so this never runs for an unsupported/unlinked account.
 *
 * Derives the app's four consumed parameters (chlorine pool/spa, pH, alkalinity, CYA)
 * from this state's OWN ChemistryThreshold rows -- see COMPLIANCE_RULESET_NOTES.md's
 * "Migrating Nevada off the flat fields" section. Every field can genuinely be `null`:
 * a state's regulation may simply not define a hazard tier, a minimum, or a target sub-
 * range for a given parameter (Arizona has no hazard tier on anything; Arkansas's CYA
 * has no hazard cap at all). `null` here means "this state doesn't have this rule," and
 * callers must treat it that way -- never fall back to a hardcoded number (that would
 * silently apply one state's numbers to another, exactly what this schema exists to
 * avoid). Falling back to this SAME row's outer min/max when there's no separate ideal
 * sub-range (most non-Nevada states don't distinguish the two) is safe, since it's still
 * this state's own data.
 */
export function activeChemistryThresholds(ruleset: ComplianceRulesetWithRules) {
  const chlorinePool = findThreshold(ruleset.chemistryThresholds, "FREE_CHLORINE", "POOL");
  const chlorineSpa = findThreshold(ruleset.chemistryThresholds, "FREE_CHLORINE", "SPA");
  const ph = findThreshold(ruleset.chemistryThresholds, "PH", null);
  // Arkansas's alkalinity always depends on sanitizer/CYA use with no unconditional
  // default -- the app doesn't track that per account yet, so "unstabilized (no CYA)"
  // is the documented default tie-break (see findThreshold's doc comment).
  const alkalinity = findThreshold(ruleset.chemistryThresholds, "TOTAL_ALKALINITY", null, "unstabilized sanitizer (no CYA present)");
  const cya = findThreshold(ruleset.chemistryThresholds, "CYANURIC_ACID", null);
  const feeProtocol = ruleset.eventProtocols.find((e) => e.feeAmount != null);

  return {
    freeChlorineMinPoolPpm: toNumOrNull(chlorinePool?.minValue),
    freeChlorineMinSpaPpm: toNumOrNull(chlorineSpa?.minValue),
    freeChlorineMaxPpm: toNumOrNull(chlorinePool?.maxValue ?? chlorineSpa?.maxValue),
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
