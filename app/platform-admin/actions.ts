"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { requirePlatformAdmin } from "@/lib/auth/require-platform-admin";
import type { PlanTier } from "@/generated/prisma/client";

const VALID_PLAN_TIERS: PlanTier[] = ["STARTER", "PRO", "ENTERPRISE"];

/** The only way an org becomes ENTERPRISE (no self-serve Stripe price exists for it -- see
 * lib/stripe.ts) or gets a manual tier correction outside of what Stripe Checkout/the
 * billing portal set. Deliberately independent of planStatus/Stripe -- e.g. a COMPED org
 * can still be tagged with the tier its comp is meant to match, for accurate reporting. */
export async function setOrganizationPlanTier(formData: FormData) {
  await requirePlatformAdmin();
  const organizationId = String(formData.get("organizationId") ?? "").trim();
  const planTierRaw = String(formData.get("planTier") ?? "").trim();
  if (!organizationId || !VALID_PLAN_TIERS.includes(planTierRaw as PlanTier)) return;

  await prisma.organization.update({
    where: { id: organizationId },
    data: { planTier: planTierRaw as PlanTier },
  });

  revalidatePath("/platform-admin");
}

export async function compOrganization(formData: FormData) {
  await requirePlatformAdmin();
  const organizationId = String(formData.get("organizationId") ?? "").trim();
  if (!organizationId) return;

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeSubscriptionId: true },
  });
  if (!organization) return;

  if (organization.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(organization.stripeSubscriptionId);
    } catch (err) {
      console.error("[platform-admin] failed to cancel Stripe subscription while comping:", err);
    }
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: { planStatus: "COMPED" },
  });

  revalidatePath("/platform-admin");
}

export async function cancelOrganization(formData: FormData) {
  await requirePlatformAdmin();
  const organizationId = String(formData.get("organizationId") ?? "").trim();
  if (!organizationId) return;

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { stripeSubscriptionId: true },
  });
  if (!organization) return;

  if (organization.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(organization.stripeSubscriptionId);
    } catch (err) {
      console.error("[platform-admin] failed to cancel Stripe subscription:", err);
    }
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: { planStatus: "CANCELED" },
  });

  revalidatePath("/platform-admin");
}
