"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { isValidStateCode } from "@/lib/us-states";

async function requireAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");
  return appUser;
}

export async function updateBusinessIdentity(formData: FormData) {
  const appUser = await requireAdmin();

  const businessName = String(formData.get("businessName") ?? "").trim();
  const businessPhone = String(formData.get("businessPhone") ?? "").trim();

  await prisma.organization.update({
    where: { id: appUser.organizationId },
    data: {
      businessName: businessName || null,
      businessPhone: businessPhone || null,
    },
  });

  revalidatePath("/dashboard/settings");
}

export async function updateComplianceProfile(formData: FormData) {
  const appUser = await requireAdmin();

  const stateRaw = String(formData.get("state") ?? "").trim().toUpperCase();
  const state = isValidStateCode(stateRaw) ? stateRaw : null;
  const hasCommercialPoolsRaw = String(formData.get("hasCommercialPools") ?? "").trim();
  const hasCommercialPools = hasCommercialPoolsRaw === "true" ? true : hasCommercialPoolsRaw === "false" ? false : null;

  const ruleset = state ? await prisma.complianceRuleset.findUnique({ where: { state }, select: { id: true } }) : null;

  await prisma.organization.update({
    where: { id: appUser.organizationId },
    data: {
      state,
      hasCommercialPools,
      complianceRulesetId: ruleset?.id ?? null,
    },
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/compliance");
  revalidatePath("/dashboard");
  // Saving the compliance profile from Settings is specifically about picking a state to
  // see compliance rules for -- send the admin straight to the page that shows them,
  // rather than leaving them on Settings to navigate there themselves.
  redirect("/dashboard/compliance");
}

/**
 * Narrower than updateComplianceProfile -- only touches `state`, leaving
 * hasCommercialPools untouched. Used by the state selector on the Compliance page itself
 * (ComplianceStateSelect), which has no hasCommercialPools field on it; reusing
 * updateComplianceProfile there would silently null out hasCommercialPools on every
 * state change since FormData.get("hasCommercialPools") would come back empty.
 */
export async function updateComplianceState(formData: FormData) {
  const appUser = await requireAdmin();

  const stateRaw = String(formData.get("state") ?? "").trim().toUpperCase();
  const state = isValidStateCode(stateRaw) ? stateRaw : null;
  const ruleset = state ? await prisma.complianceRuleset.findUnique({ where: { state }, select: { id: true } }) : null;

  await prisma.organization.update({
    where: { id: appUser.organizationId },
    data: {
      state,
      complianceRulesetId: ruleset?.id ?? null,
    },
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/compliance");
  revalidatePath("/dashboard");
}
