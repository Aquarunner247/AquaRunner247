import type { OrganizationPlanStatus, PlanTier } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

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

type OrgPlanFields = { planStatus: OrganizationPlanStatus; planTier: PlanTier | null };

/**
 * COMPED orgs (see the "Comp" action on /platform-admin) bypass every tier limit and
 * Pro-feature gate below -- that status is the one mechanism for giving an org free,
 * unrestricted access outside of Stripe entirely, regardless of what planTier (if any)
 * they're also tagged with.
 *
 * COMPLIANCE is deliberately never included here -- that product (app/cpo) has no
 * concept of Pro features at all, so leaving it out of this OR-chain makes every
 * existing Pro-gated feature (dosing recommendations, route optimization) inert for it
 * automatically, with no separate gating logic needed anywhere else.
 */
export function hasProAccess(org: OrgPlanFields): boolean {
  return org.planStatus === "COMPED" || org.planTier === "PRO" || org.planTier === "ENTERPRISE";
}

/** Untiered orgs (pre-tier accounts, or a dev-path signup with no Stripe price configured)
 * fall back to the Starter limit -- the safest default until a tier is actually chosen. */
export function userLimitFor(org: OrgPlanFields): number | null {
  if (org.planStatus === "COMPED") return null;
  return PLAN_TIER_USER_LIMITS[org.planTier ?? "STARTER"];
}

export type OrgPlanAccess = {
  planTier: PlanTier | null;
  proAccess: boolean;
  userLimit: number | null;
};

/** Single lookup for gating a page/action by organizationId -- callers that already have
 * the org row loaded (e.g. with planStatus/planTier already selected) should call
 * hasProAccess/userLimitFor directly instead of re-querying via this. */
export async function getOrgPlanAccess(organizationId: string): Promise<OrgPlanAccess> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { planStatus: true, planTier: true },
  });
  if (!org) return { planTier: null, proAccess: false, userLimit: PLAN_TIER_USER_LIMITS.STARTER };
  return { planTier: org.planTier, proAccess: hasProAccess(org), userLimit: userLimitFor(org) };
}
