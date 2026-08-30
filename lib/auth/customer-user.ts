import type { User as SupabaseUser } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import type { CustomerUser } from "@/generated/prisma/client";

export async function getCustomerUserForAuthUser(supabaseUser: SupabaseUser): Promise<CustomerUser | null> {
  if (supabaseUser.id) {
    const byAuth = await prisma.customerUser.findUnique({
      where: { authUserId: supabaseUser.id },
    });
    if (byAuth) return byAuth;
  }

  const email = supabaseUser.email?.toLowerCase();
  if (!email) return null;

  return prisma.customerUser.findUnique({
    where: { email },
  });
}

export type CustomerPortalAccessState =
  | { status: "none" }
  | { status: "converted" }
  | { status: "blocked" }
  | { status: "active"; customerUser: CustomerUser };

/** Distinguishes "no CustomerUser row at all" from the two ways an existing one can be
 * blocked -- relationshipEndedAt/inactive (not yet converted, needs /portal/subscribe) vs.
 * already converted to a standalone org (their real home is /cpo now, under a new User
 * login). The org's *current* planStatus is checked live here rather than batch-flipping
 * CustomerUser.active on cancellation, so access blocks immediately and un-blocks
 * automatically on reactivation with no reconciliation step. */
export async function getCustomerPortalAccessState(supabaseUser: SupabaseUser): Promise<CustomerPortalAccessState> {
  const where = supabaseUser.id ? { authUserId: supabaseUser.id } : undefined;
  const email = supabaseUser.email?.toLowerCase();

  const customerUser = where
    ? await prisma.customerUser.findUnique({
        where,
        include: { customer: { include: { organization: { select: { planStatus: true } } } } },
      })
    : null;

  const record =
    customerUser ??
    (email
      ? await prisma.customerUser.findUnique({
          where: { email },
          include: { customer: { include: { organization: { select: { planStatus: true } } } } },
        })
      : null);

  if (!record) return { status: "none" };

  if (record.customer.convertedToOrganizationId) return { status: "converted" };

  const blocked = !record.active || record.customer.relationshipEndedAt != null || record.customer.organization.planStatus === "CANCELED";
  if (blocked) return { status: "blocked" };

  const { id, customerId, authUserId, email: recordEmail, name, active, createdAt, updatedAt, seenTourPages } = record;
  return {
    status: "active",
    customerUser: { id, customerId, authUserId, email: recordEmail, name, active, createdAt, updatedAt, seenTourPages },
  };
}
