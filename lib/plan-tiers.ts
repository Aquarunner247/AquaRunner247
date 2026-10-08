import type { PlanTier } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  EXTRA_SEAT_PRICE_USD,
  PLAN_TIER_INCLUDED_SEATS,
  allowsExtraSeats,
  billableSeatsFor,
  hardSeatCapFor,
  hasWhiteLabelBranding,
  includedSeatsFor,
  isComplianceTier,
  outcomeOfAddingSeat,
  type OrgPlanFields,
  type SeatOutcome,
} from "@/lib/plan-tiers-core";

export {
  EXTRA_SEAT_PRICE_USD,
  PLAN_TIER_INCLUDED_SEATS,
  allowsExtraSeats,
  billableSeatsFor,
  hardSeatCapFor,
  hasWhiteLabelBranding,
  includedSeatsFor,
  isComplianceTier,
  outcomeOfAddingSeat,
  type OrgPlanFields,
  type SeatOutcome,
};

export type OrgPlanAccess = {
  planTier: PlanTier | null;
};

/** Single lookup for gating a page/action by organizationId -- callers that already have
 * the org row loaded (e.g. with planStatus/planTier already selected) should call
 * isComplianceTier/includedSeatsFor directly instead of re-querying via this. */
export async function getOrgPlanAccess(organizationId: string): Promise<OrgPlanAccess> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { planTier: true },
  });
  return { planTier: org?.planTier ?? null };
}
