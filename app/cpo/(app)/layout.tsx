import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { prisma } from "@/lib/prisma";
import { canAcceptTerms, needsTermsAcceptance } from "@/lib/terms-acceptance";
import { CpoNav } from "../components/cpo-nav";

export default async function CpoAppLayout({ children }: { children: React.ReactNode }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const organization = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { planStatus: true, planTier: true, termsAcceptedVersion: true },
  });

  // A service-company org has no business under /cpo, even via a stale bookmark --
  // mirror-image of the COMPLIANCE-tier guard in app/dashboard/layout.tsx.
  if (organization?.planTier !== "COMPLIANCE") redirect("/dashboard");
  if (organization.planStatus === "CANCELED") redirect("/billing/expired");
  // Same mandatory re-acceptance gate as app/dashboard/layout.tsx -- every seat on this tier
  // is an ADMIN, so in practice it holds everyone who can sign in here.
  if (needsTermsAcceptance(organization) && canAcceptTerms(appUser)) redirect("/accept-terms");

  return (
    <div className="min-h-screen bg-brand-surface md:flex">
      <CpoNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
