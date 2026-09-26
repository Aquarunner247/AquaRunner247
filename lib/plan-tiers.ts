import type { PlanTier } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { PLAN_TIER_USER_LIMITS, isComplianceTier, userLimitFor, type OrgPlanFields } from "@/lib/plan-tiers-core";

export { PLAN_TIER_USER_LIMITS, isComplianceTier, userLimitFor, type OrgPlanFields };

export type OrgPlanAccess = {
  planTier: PlanTier | null;
  userLimit: number | null;
};

/** Single lookup for gating a page/action by organizationId -- callers that already have
 * the org row loaded (e.g. with planStatus/planTier already selected) should call
 * isComplianceTier/userLimitFor directly instead of re-querying via this. */
export async function getOrgPlanAccess(organizationId: string): Promise<OrgPlanAccess> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { planStatus: true, planTier: true },
  });
  if (!org) return { planTier: null, userLimit: PLAN_TIER_USER_LIMITS.SERVICE };
  return { planTier: org.planTier, userLimit: userLimitFor(org) };
}
