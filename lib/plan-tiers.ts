import type { OrganizationPlanStatus, PlanTier } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/** Seats included per tier, matching the pricing cards on the landing page. `null` means
 * unlimited (Enterprise is volume-priced/custom, set manually by a platform admin). */
export const PLAN_TIER_USER_LIMITS: Record<PlanTier, number | null> = {
  STARTER: 10,
  PRO: 25,
  ENTERPRISE: null,
};

type OrgPlanFields = { planStatus: OrganizationPlanStatus; planTier: PlanTier | null };

/**
 * COMPED orgs (see the "Comp" action on /platform-admin) bypass every tier limit and
 * Pro-feature gate below -- that status is the one mechanism for giving an org free,
 * unrestricted access outside of Stripe entirely, regardless of what planTier (if any)
 * they're also tagged with.
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
