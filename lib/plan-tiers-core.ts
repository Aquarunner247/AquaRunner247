import type { OrganizationPlanStatus, PlanTier } from "@/generated/prisma/client";

/**
 * Pure tier-gating logic, kept Prisma-free (like lib/dosing-units.ts and
 * lib/route-ordering.ts) so it's unit-testable without a live database --
 * lib/plan-tiers.ts re-exports everything here and adds the one Prisma-touching lookup
 * (getOrgPlanAccess) on top.
 */

/** Dollars per month for each staff seat beyond the ones a plan includes. Advertised on the
 * pricing cards and pinned to them by lib/__tests__/plan-seats-match-pricing.test.ts. */
export const EXTRA_SEAT_PRICE_USD = 15;

/** Staff seats (User rows: ADMIN/OFFICE/TECHNICIAN) bundled into each tier's own price,
 * matching the pricing cards on the landing page (pinned by
 * lib/__tests__/plan-seats-match-pricing.test.ts, because the two used to be able to drift
 * apart silently). Customer portal logins (CustomerUser) are a separate model entirely and
 * never count toward a seat number, no matter how many a customer has.
 *
 * This is an INCLUDED count, not a cap: on the pool-service tiers an admin may go past it and
 * pay EXTRA_SEAT_PRICE_USD per seat per month. `null` means unlimited and never billed
 * (Enterprise is volume-priced/custom, set by hand by a platform admin).
 *
 * COMPLIANCE is the exception and stays a hard cap -- see hardSeatCapFor. */
export const PLAN_TIER_INCLUDED_SEATS: Record<PlanTier, number | null> = {
  SERVICE: 3,
  WHITE_LABEL: 5,
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

/**
 * White-label branding -- the logo and brand colors a customer sees on the portal and in
 * the welcome email that creates their login -- is the one thing the $149 White Label tier
 * actually sells, so Service must not have it. ENTERPRISE is included because its pricing
 * card is "everything in White Label, plus".
 *
 * COMPED orgs get it too, for the same reason userLimitFor waives the seat cap for them:
 * comping is a platform admin deliberately handing out a full account, not a paid tier.
 * An untiered org (planTier null) does NOT get it -- those fall back to Service
 * everywhere else, and a platform admin who wants one branded can set its tier.
 */
export function hasWhiteLabelBranding(org: OrgPlanFields): boolean {
  if (org.planStatus === "COMPED") return true;
  return org.planTier === "WHITE_LABEL" || org.planTier === "ENTERPRISE";
}

/** Untiered orgs (pre-tier accounts, or a dev-path signup with no Stripe price configured)
 * fall back to Service everywhere -- the safest default until a tier is actually chosen,
 * since every pre-COMPLIANCE-era org was a pool-service org, never a Compliance one. */
function effectiveTier(org: OrgPlanFields): PlanTier {
  return org.planTier ?? "SERVICE";
}

/**
 * Seats included in what the org already pays. `null` means unlimited, so nothing is ever
 * billable: Enterprise by its pricing card, and COMPED because comping is a platform admin
 * deliberately handing out a full account rather than a paid tier.
 */
export function includedSeatsFor(org: OrgPlanFields): number | null {
  if (org.planStatus === "COMPED") return null;
  return PLAN_TIER_INCLUDED_SEATS[effectiveTier(org)];
}

/**
 * A ceiling that cannot be bought past, as opposed to the included count that can.
 *
 * Only AquaRunner Compliance has one. It is a $19/month product sold to a property with an
 * in-house CPO, so a $15 third seat would be most of another subscription -- selling extra
 * seats there would be close to selling a second copy of the product at a discount. Every
 * pool-service tier returns null: going past the included count is a billing event, not a wall.
 */
export function hardSeatCapFor(org: OrgPlanFields): number | null {
  if (org.planStatus === "COMPED") return null;
  return effectiveTier(org) === "COMPLIANCE" ? PLAN_TIER_INCLUDED_SEATS.COMPLIANCE : null;
}

/** Whether this org can add a seat beyond its included count by paying for it. */
export function allowsExtraSeats(org: OrgPlanFields): boolean {
  return hardSeatCapFor(org) === null && includedSeatsFor(org) !== null;
}

/**
 * How many of the org's currently active staff are billable as extra seats. Zero whenever the
 * org is unlimited, and zero while headcount is at or under the included count.
 *
 * This is computed from the live active-user count rather than accumulated by add/remove, so a
 * seat that was deleted outside the normal path, or a sync that failed halfway, self-corrects
 * the next time anything recomputes it.
 */
export function billableSeatsFor(org: OrgPlanFields, activeStaffCount: number): number {
  const included = includedSeatsFor(org);
  if (included === null) return 0;
  return Math.max(0, activeStaffCount - included);
}

/** What adding one more active staff user would mean for this org. */
export type SeatOutcome =
  /** Covered by the plan already -- no charge, no confirmation. */
  | "included"
  /** Allowed, but adds EXTRA_SEAT_PRICE_USD per month. Requires explicit confirmation. */
  | "billable"
  /** Refused -- the tier has a hard ceiling and it is already reached. */
  | "blocked";

export function outcomeOfAddingSeat(org: OrgPlanFields, activeStaffCount: number): SeatOutcome {
  const cap = hardSeatCapFor(org);
  if (cap !== null) return activeStaffCount >= cap ? "blocked" : "included";
  const included = includedSeatsFor(org);
  if (included === null) return "included";
  return activeStaffCount >= included ? "billable" : "included";
}
