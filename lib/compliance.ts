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

function toNum(v: unknown, fallback: number): number {
  return v == null ? fallback : Number(v);
}

function findThreshold(
  thresholds: ChemistryThreshold[],
  parameter: string,
  bodyOfWaterCategory?: string | null,
): ChemistryThreshold | undefined {
  return thresholds.find((t) => t.parameter === parameter && (bodyOfWaterCategory === undefined || t.bodyOfWaterCategory === bodyOfWaterCategory));
}

/**
 * Chemistry target/hazard thresholds as plain numbers (Prisma Decimals aren't directly
 * comparable). Only call this once isComplianceActive(ruleset) is true -- callers gate on
 * that first, so this never runs for an unsupported/unlinked account.
 *
 * Derives the app's four consumed parameters (chlorine pool/spa, pH, alkalinity, CYA)
 * from the ChemistryThreshold rows rather than reading flat fields -- see
 * COMPLIANCE_RULESET_NOTES.md's "Migrating Nevada off the flat fields" section. The
 * per-field fallbacks are a defensive last resort for an isSupported:true state missing
 * one of these specific rows (a data-entry gap), not a way to apply Nevada's numbers to a
 * state that was never actually built out -- every other pattern captured in
 * state-compliance-data.md (curves, relational rules, event protocols) lives on these
 * same rows but isn't read here, since the app doesn't evaluate those yet.
 */
export function activeChemistryThresholds(ruleset: ComplianceRulesetWithRules) {
  const chlorinePool = findThreshold(ruleset.chemistryThresholds, "FREE_CHLORINE", "POOL");
  const chlorineSpa = findThreshold(ruleset.chemistryThresholds, "FREE_CHLORINE", "SPA");
  const ph = findThreshold(ruleset.chemistryThresholds, "PH", null);
  const alkalinity = findThreshold(ruleset.chemistryThresholds, "TOTAL_ALKALINITY", null);
  const cya = findThreshold(ruleset.chemistryThresholds, "CYANURIC_ACID", null);
  const feeProtocol = ruleset.eventProtocols.find((e) => e.feeAmount != null);

  return {
    freeChlorineMinPoolPpm: toNum(chlorinePool?.minValue, 2),
    freeChlorineMinSpaPpm: toNum(chlorineSpa?.minValue, 3),
    freeChlorineMaxPpm: toNum(chlorinePool?.maxValue ?? chlorineSpa?.maxValue, 10),
    phTargetMin: toNum(ph?.idealMin, 7.2),
    phTargetMax: toNum(ph?.idealMax, 7.8),
    phHazardMin: toNum(ph?.hazardMin, 6.5),
    phHazardMax: toNum(ph?.hazardMax, 8.0),
    alkalinityTargetMinPpm: toNum(alkalinity?.idealMin, 60),
    alkalinityTargetMaxPpm: toNum(alkalinity?.idealMax, 180),
    cyaTargetMinPpm: toNum(cya?.idealMin, 30),
    cyaTargetMaxPpm: toNum(cya?.idealMax, 50),
    cyaHazardMaxPpm: toNum(cya?.hazardMax, 100),
    closureFeeAmount: feeProtocol?.feeAmount != null ? Number(feeProtocol.feeAmount) : null,
    closureFeeNote: feeProtocol?.feeNote ?? null,
  };
}
