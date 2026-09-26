import type { OrganizationPlanStatus, PlanTier } from "@/generated/prisma/client";

/**
 * Pure tier-gating logic, kept Prisma-free (like lib/dosing-units.ts and
 * lib/route-ordering.ts) so it's unit-testable without a live database --
 * lib/plan-tiers.ts re-exports everything here and adds the one Prisma-touching lookup
 * (getOrgPlanAccess) on top.
 */

/** Staff seats (User rows: ADMIN/OFFICE/TECHNICIAN) included per tier, matching the
 * pricing cards on the landing page -- see app/dashboard/users/actions.ts, which counts
 * only the User table against this. Customer portal logins (CustomerUser) are a separate
 * model entirely and never count against a seat limit, no matter how many a customer has.
 * `null` means unlimited (Enterprise is volume-priced/custom, set manually by a platform
 * admin). */
export const PLAN_TIER_USER_LIMITS: Record<PlanTier, number | null> = {
  SERVICE: 5,
  WHITE_LABEL: 10,
  ENTERPRISE: null,
  /// AquaRunner Compliance (app/cpo) -- up to 2 seats (e.g. a CPO plus a backup), added
  /// via app/cpo/(app)/users/page.tsx. No OFFICE/TECHNICIAN concept for this product --
  /// every seat is ADMIN.
  COMPLIANCE: 2,
};

export type OrgPlanFields = { planStatus: OrganizationPlanStatus; planTier: PlanTier | null };

/**
 * COMPLIANCE (app/cpo) is the one tier that isn't the pool-service product at all -- it
 * has no routes, dispatch, dosing, or phone-agent concept, so features built around those
 * stay inert for it automatically wherever this is checked. Every other tier, including a
 * null/untiered legacy org (which predates COMPLIANCE existing as a product), gets the
 * full pool-service feature set: nothing is gated by price anymore, only by which product
 * an org is actually on. See AquaRunner_Marketing_Pricing_Conversation_Notes.docx --
 * "AI dosing should not be hidden just to force an upgrade."
 */
export function isComplianceTier(org: OrgPlanFields): boolean {
  return org.planTier === "COMPLIANCE";
}

/** Untiered orgs (pre-tier accounts, or a dev-path signup with no Stripe price configured)
 * fall back to the Service limit -- the safest default until a tier is actually chosen,
 * since every pre-COMPLIANCE-era org was a pool-service org, never a Compliance one. */
export function userLimitFor(org: OrgPlanFields): number | null {
  if (org.planStatus === "COMPED") return null;
  return PLAN_TIER_USER_LIMITS[org.planTier ?? "SERVICE"];
}
