import type { PlanTier } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { PLAN_TIER_USER_LIMITS, hasProAccess, userLimitFor, type OrgPlanFields } from "@/lib/plan-tiers-core";

export { PLAN_TIER_USER_LIMITS, hasProAccess, userLimitFor, type OrgPlanFields };

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
