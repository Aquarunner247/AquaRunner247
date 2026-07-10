"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { stripe } from "@/lib/stripe";

export async function openBillingPortal() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const organization = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { stripeCustomerId: true },
  });
  if (!organization?.stripeCustomerId) redirect("/dashboard/billing?error=no-customer");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  let portalUrl: string;
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: organization.stripeCustomerId,
      return_url: `${appUrl}/dashboard/billing`,
    });
    portalUrl = session.url;
  } catch (err) {
    console.error("[billing] failed to create portal session:", err);
    redirect("/dashboard/billing?error=portal-error");
  }

  redirect(portalUrl);
}
