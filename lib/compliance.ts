import { prisma } from "@/lib/prisma";
import type { ComplianceRuleset } from "@/generated/prisma/client";

/** Shown wherever no state-specific department name is known/configured yet. */
export const GENERIC_HEALTH_DEPARTMENT_LABEL = "your state/local health department";

/** Fallback cadence for accounts with no *active* ruleset (unsupported state, or none
 * linked yet). Applied uniformly regardless of compliance-active status -- this is a
 * testing-cadence practicality (CYA doesn't shift quickly), not a gated compliance
 * feature, so it isn't hidden by isComplianceActive the way hazard/target numbers are. */
export const DEFAULT_CYA_TEST_FREQUENCY_DAYS = 30;

/**
 * Loads the ComplianceRuleset linked to an organization, if any. A null return covers two
 * cases identically: the org hasn't been assigned a ruleset yet, or its state's ruleset
 * exists but isSupported is false. Both mean "no compliance features" to every caller here
 * -- see isComplianceActive.
 */
export async function getOrganizationRuleset(organizationId: string): Promise<ComplianceRuleset | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { complianceRuleset: true },
  });
  return org?.complianceRuleset ?? null;
}

/** True only when a ruleset is linked AND fully built out -- the single gate every
 * compliance-feature check (QR log hazard banners, closure-risk dashboard alerts, the
 * chemistry rule engine) should go through, per multi-state-compliance-spec.md's
 * isSupported gating. Callers must check this before calling activeChemistryThresholds --
 * an unsupported/unlinked account gets those features hidden entirely, never silently
 * computed with Nevada's numbers. */
export function isComplianceActive(ruleset: ComplianceRuleset | null): ruleset is ComplianceRuleset {
  return ruleset != null && ruleset.isSupported;
}

/** The name to show in UI copy -- the real department name once known, otherwise a
 * generic label. Never hardcode "SNHD" or a department name directly in a component. */
export function healthDepartmentLabel(ruleset: ComplianceRuleset | null): string {
  return ruleset?.healthDepartmentName || GENERIC_HEALTH_DEPARTMENT_LABEL;
}

/** How often CYA needs re-testing, in days. Applies to every account uniformly (see the
 * const's doc comment) -- independent of isComplianceActive. */
export function cyaTestFrequencyDays(ruleset: ComplianceRuleset | null): number {
  return ruleset?.cyaTestFrequencyDays ?? DEFAULT_CYA_TEST_FREQUENCY_DAYS;
}

function toNum(v: unknown, fallback: number): number {
  return v == null ? fallback : Number(v);
}

/**
 * Chemistry target/hazard thresholds as plain numbers (Prisma Decimals aren't directly
 * comparable). Only call this once isComplianceActive(ruleset) is true -- callers gate on
 * that first, so this never runs for an unsupported/unlinked account. The per-field
 * fallbacks here are a defensive last resort for an isSupported:true row with an
 * incomplete field (a data-entry gap), not a way to apply Nevada's numbers to a state that
 * was never actually built out.
 */
export function activeChemistryThresholds(ruleset: ComplianceRuleset) {
  return {
    freeChlorineMinPoolPpm: toNum(ruleset.freeChlorineMinPoolPpm, 2),
    freeChlorineMinSpaPpm: toNum(ruleset.freeChlorineMinSpaPpm, 3),
    freeChlorineMaxPpm: toNum(ruleset.freeChlorineMaxPpm, 10),
    phTargetMin: toNum(ruleset.phTargetMin, 7.2),
    phTargetMax: toNum(ruleset.phTargetMax, 7.8),
    phHazardMin: toNum(ruleset.phHazardMin, 6.5),
    phHazardMax: toNum(ruleset.phHazardMax, 8.0),
    alkalinityTargetMinPpm: toNum(ruleset.alkalinityTargetMinPpm, 60),
    alkalinityTargetMaxPpm: toNum(ruleset.alkalinityTargetMaxPpm, 180),
    cyaTargetMinPpm: toNum(ruleset.cyaTargetMinPpm, 30),
    cyaTargetMaxPpm: toNum(ruleset.cyaTargetMaxPpm, 50),
    cyaHazardMaxPpm: toNum(ruleset.cyaHazardMaxPpm, 100),
    closureFeeAmount: ruleset.closureFeeAmount != null ? Number(ruleset.closureFeeAmount) : null,
    closureFeeNote: ruleset.closureFeeNote ?? null,
  };
}
