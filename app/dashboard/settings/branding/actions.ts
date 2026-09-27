"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import {
  validateOrgBranding,
  validateWelcomeEmailSettings,
  validateServiceSummaryCcEmail,
  BrandingValidationError,
} from "@/lib/mail/validate-branding";
import { uploadBrandingLogo, removeBrandingLogo, LogoUploadError } from "@/lib/mail/branding-logo";
import { hasWhiteLabelBranding } from "@/lib/plan-tiers";

async function requireAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");
  return appUser;
}

/** The logo and color actions below are White Label only. The welcome-email and service
 * summary settings on the same page are not -- those are ordinary operational settings
 * every tier needs, so they only go through requireAdmin. Checked server-side because the
 * form hiding these sections is just a UI affordance. */
async function requireBrandingAccess() {
  const appUser = await requireAdmin();
  const org = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { planStatus: true, planTier: true },
  });
  if (!org || !hasWhiteLabelBranding(org)) redirect(`${PAGE_PATH}?error=${encodeURIComponent(UPGRADE_MESSAGE)}`);
  return appUser;
}

const PAGE_PATH = "/dashboard/settings/branding";
const UPGRADE_MESSAGE = "Custom branding is part of the White Label plan.";

export async function updateBranding(formData: FormData) {
  const appUser = await requireBrandingAccess();

  const primaryColor = String(formData.get("primaryColor") ?? "").trim() || null;
  const headerColor = String(formData.get("headerColor") ?? "").trim() || null;

  let validated;
  try {
    validated = validateOrgBranding({ primaryColor, headerColor });
  } catch (err) {
    if (err instanceof BrandingValidationError) {
      redirect(`${PAGE_PATH}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await prisma.organization.update({
    where: { id: appUser.organizationId },
    data: {
      brandingPrimaryColor: validated.primaryColor,
      brandingHeaderColor: validated.headerColor,
      brandingUpdatedAt: new Date(),
      brandingUpdatedBy: appUser.id,
    },
  });

  revalidatePath(PAGE_PATH);
  redirect(`${PAGE_PATH}?saved=1`);
}

export async function uploadLogo(formData: FormData) {
  const appUser = await requireBrandingAccess();
  const file = formData.get("logoFile");
  if (!(file instanceof File)) {
    redirect(`${PAGE_PATH}?error=${encodeURIComponent("Choose a file to upload.")}`);
  }

  let logoUrl: string;
  try {
    logoUrl = await uploadBrandingLogo(appUser.organizationId, file);
  } catch (err) {
    if (err instanceof LogoUploadError) {
      redirect(`${PAGE_PATH}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await prisma.organization.update({
    where: { id: appUser.organizationId },
    data: { brandingLogoUrl: logoUrl, brandingUpdatedAt: new Date(), brandingUpdatedBy: appUser.id },
  });

  revalidatePath(PAGE_PATH);
  redirect(`${PAGE_PATH}?saved=1`);
}

export async function removeLogo() {
  const appUser = await requireBrandingAccess();

  await removeBrandingLogo(appUser.organizationId);

  await prisma.organization.update({
    where: { id: appUser.organizationId },
    data: { brandingLogoUrl: null, brandingUpdatedAt: new Date(), brandingUpdatedBy: appUser.id },
  });

  revalidatePath(PAGE_PATH);
  redirect(`${PAGE_PATH}?saved=1`);
}

export async function updateWelcomeEmailSettings(formData: FormData) {
  const appUser = await requireAdmin();

  const enabled = formData.get("welcomeEmailEnabled") != null;
  const supportEmail = String(formData.get("supportEmail") ?? "").trim() || null;
  const supportPhone = String(formData.get("supportPhone") ?? "").trim() || null;
  const introText = String(formData.get("introText") ?? "").trim() || null;

  let validated;
  try {
    validated = validateWelcomeEmailSettings({ supportEmail, supportPhone, introText });
  } catch (err) {
    if (err instanceof BrandingValidationError) {
      redirect(`${PAGE_PATH}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await prisma.organization.update({
    where: { id: appUser.organizationId },
    data: {
      welcomeEmailEnabled: enabled,
      welcomeEmailSupportEmail: validated.supportEmail,
      welcomeEmailSupportPhone: validated.supportPhone,
      welcomeEmailIntroText: validated.introText,
      brandingUpdatedAt: new Date(),
      brandingUpdatedBy: appUser.id,
    },
  });

  revalidatePath(PAGE_PATH);
  redirect(`${PAGE_PATH}?saved=1`);
}

export async function updateServiceSummaryCcEmail(formData: FormData) {
  const appUser = await requireAdmin();

  const ccEmail = String(formData.get("serviceSummaryCcEmail") ?? "").trim() || null;

  let validated: string | null;
  try {
    validated = validateServiceSummaryCcEmail(ccEmail);
  } catch (err) {
    if (err instanceof BrandingValidationError) {
      redirect(`${PAGE_PATH}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  await prisma.organization.update({
    where: { id: appUser.organizationId },
    data: { serviceSummaryCcEmail: validated },
  });

  revalidatePath(PAGE_PATH);
  redirect(`${PAGE_PATH}?saved=1`);
}
