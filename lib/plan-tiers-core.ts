import type { OrganizationPlanStatus, PlanTier } from "@/generated/prisma/client";

/**
 * Pure tier-gating logic, kept Prisma-free (like lib/dosing-units.ts and
 * lib/route-ordering.ts) so it's unit-testable without a live database --
 * lib/plan-tiers.ts re-exports everything here and adds the one Prisma-touching lookup
 * (getOrgPlanAccess) on top.
 */

/** Seats included per tier, matching the pricing cards on the landing page. `null` means
 * unlimited (Enterprise is volume-priced/custom, set manually by a platform admin). */
export const PLAN_TIER_USER_LIMITS: Record<PlanTier, number | null> = {
  SOLO: 1,
  STARTER: 5,
  PRO: 10,
  ENTERPRISE: null,
  /// AquaRunner Compliance (app/cpo) -- up to 2 seats (e.g. a CPO plus a backup), added
  /// via app/cpo/(app)/users/page.tsx. No OFFICE/TECHNICIAN concept for this product --
  /// every seat is ADMIN.
  COMPLIANCE: 2,
};

export type OrgPlanFields = { planStatus: OrganizationPlanStatus; planTier: PlanTier | null };

/**
 * COMPED orgs (see the "Comp" action on /platform-admin) bypass every tier limit and
 * Pro-feature gate below -- that status is the one mechanism for giving an org free,
 * unrestricted access outside of Stripe entirely, regardless of what planTier (if any)
 * they're also tagged with.
 *
 * SOLO is included here -- unlike STARTER, that tier's own pricing-page copy promises
 * "every feature, nothing held back for the price" (a one-person operator gets the full
 * app; STARTER's higher user limit is the actual difference PRO is priced against).
 *
 * COMPLIANCE is deliberately never included here -- that product (app/cpo) has no
 * concept of Pro features at all, so leaving it out of this OR-chain makes every
 * existing Pro-gated feature (dosing recommendations, route optimization) inert for it
 * automatically, with no separate gating logic needed anywhere else.
 */
export function hasProAccess(org: OrgPlanFields): boolean {
  return org.planStatus === "COMPED" || org.planTier === "SOLO" || org.planTier === "PRO" || org.planTier === "ENTERPRISE";
}

/** Untiered orgs (pre-tier accounts, or a dev-path signup with no Stripe price configured)
 * fall back to the Starter limit -- the safest default until a tier is actually chosen. */
export function userLimitFor(org: OrgPlanFields): number | null {
  if (org.planStatus === "COMPED") return null;
  return PLAN_TIER_USER_LIMITS[org.planTier ?? "STARTER"];
}
