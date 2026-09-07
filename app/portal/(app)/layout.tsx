import { redirect } from "next/navigation";
import { getCurrentCustomerPortalAccessState } from "@/lib/auth/current-customer-user";
import { prisma } from "@/lib/prisma";
import { PortalNav } from "../components/portal-nav";
import { PortalOnboardingTourLauncher } from "@/app/components/portal-onboarding-tour-launcher";

export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const access = await getCurrentCustomerPortalAccessState();
  if (access.status === "none") redirect("/portal/login?error=no-access");
  if (access.status === "converted") redirect("/login");
  if (access.status === "blocked") redirect("/portal/subscribe");
  const customerUser = access.customerUser;

  // Org branding (logo + colors) -- shared with the welcome email, see
  // lib/mail/welcome-email.ts and prisma/schema.prisma's Organization.branding* fields.
  // Not part of getCurrentCustomerPortalAccessState's own return shape (that's about
  // access/blocking, not display), so fetched here alongside it.
  const customer = await prisma.customer.findUnique({
    where: { id: customerUser.customerId },
    select: {
      organization: {
        select: { name: true, businessName: true, brandingLogoUrl: true, brandingPrimaryColor: true, brandingHeaderColor: true },
      },
    },
  });
  const org = customer?.organization;
  const orgName = org?.businessName ?? org?.name ?? "AquaRunner 24/7";

  // Scoped CSS custom properties, read by portal-nav.tsx and the portal pages' own
  // brand-primary buttons via bg-[var(--portal-primary,<fallback>)] -- unset falls through
  // to the fallback hex baked into each of those classes (this app's own brand.primary/
  // brand.ink tokens), so an org with no customization renders pixel-identical to today.
  // Deliberately not a tailwind.config.ts change -- this stays confined to portal-specific
  // files, not a rewrite of the whole app's color system (the staff dashboard is unaffected).
  const brandingStyle: React.CSSProperties = {
    ...(org?.brandingPrimaryColor ? { ["--portal-primary" as string]: org.brandingPrimaryColor } : {}),
    ...(org?.brandingHeaderColor ? { ["--portal-header" as string]: org.brandingHeaderColor } : {}),
  };

  return (
    <div className="min-h-screen bg-brand-surface md:flex" style={brandingStyle}>
      <PortalNav logoUrl={org?.brandingLogoUrl ?? null} orgName={orgName} />
      <div className="min-w-0 flex-1">{children}</div>
      <PortalOnboardingTourLauncher seenPages={customerUser.seenTourPages} />
    </div>
  );
}
