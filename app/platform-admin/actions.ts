"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { requirePlatformAdmin } from "@/lib/auth/require-platform-admin";

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
