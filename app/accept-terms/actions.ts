"use server";

import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { prisma } from "@/lib/prisma";
import { recordTermsAcceptance } from "@/lib/terms-acceptance-record";
import { canAcceptTerms, needsTermsAcceptance } from "@/lib/terms-acceptance";

/**
 * Records a prompted re-acceptance.
 *
 * Re-checks authority and need rather than trusting the page that rendered the button: a server
 * action is a public endpoint, so an OFFICE user who posts to it directly must be refused the
 * same way the screen refuses to show them the button.
 */
export async function acceptTermsAction(): Promise<void> {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.isPlatformAdmin) redirect("/admin");
  if (!canAcceptTerms(appUser)) redirect("/dashboard");

  const org = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { id: true, planTier: true, termsAcceptedVersion: true },
  });
  if (!org) redirect("/login");

  // Already current -- a double submit, or two admins accepting at once. Not an error, and
  // deliberately not a second log row: the agreement is already in force at this version.
  if (needsTermsAcceptance(org)) {
    await recordTermsAcceptance({
      organizationId: org.id,
      accepter: { id: appUser.id, email: appUser.email, name: appUser.name, role: appUser.role },
      context: "REACCEPTANCE",
    });
  }

  redirect(org.planTier === "COMPLIANCE" ? "/cpo" : "/dashboard");
}
