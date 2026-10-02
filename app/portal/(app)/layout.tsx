import { redirect } from "next/navigation";
import { getCurrentCustomerPortalAccessState } from "@/lib/auth/current-customer-user";
import { prisma } from "@/lib/prisma";
import { PortalNav } from "../components/portal-nav";
import { PortalOnboardingTourLauncher } from "@/app/components/portal-onboarding-tour-launcher";
import { hasWhiteLabelBranding } from "@/lib/plan-tiers";

export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const access = await getCurrentCustomerPortalAccessState();
  if (access.status === "none") redirect("/portal/login?error=no-access");
  if (access.status === "converted") redirect("/login");
  if (access.status === "blocked") redirect("/portal/subscribe");
  // Checked after the access redirects, because a customer whose service has ended or whose org has
  // lapsed has nothing to come in to -- changing a password first would be a pointless detour. Every
  // portal page renders inside this layout, so one redirect here covers all of them; the portal's own
  // server actions check it too (app/portal/actions.ts), since a layout cannot gate those.
  if (access.customerUser.mustChangePassword) redirect("/portal/set-password");
  const customerUser = access.customerUser;

  // Org branding (logo + colors) -- shared with the welcome email, see
  // lib/mail/welcome-email.ts and prisma/schema.prisma's Organization.branding* fields.
  // Not part of getCurrentCustomerPortalAccessState's own return shape (that's about
  // access/blocking, not display), so fetched here alongside it.
  const customer = await prisma.customer.findUnique({
    where: { id: customerUser.customerId },
    select: {
      organization: {
        select: {
          name: true,
          businessName: true,
          brandingLogoUrl: true,
          brandingPrimaryColor: true,
          brandingHeaderColor: true,
          planStatus: true,
          planTier: true,
        },
      },
    },
  });
  const org = customer?.organization;
  const orgName = org?.businessName ?? org?.name ?? "AquaRunner 24/7";

  // Gate at render, not just where branding is saved: an org that drops from White Label
  // back to Service keeps its stored logo and colors in the database, and without this
  // check those would keep showing to its customers indefinitely.
  const branded = org ? hasWhiteLabelBranding(org) : false;

  // Scoped CSS custom properties, read by portal-nav.tsx and the portal pages' own
  // brand-primary buttons via bg-[var(--portal-primary,<fallback>)] -- unset falls through
  // to the fallback hex baked into each of those classes (this app's own brand.primary/
  // brand.ink tokens), so an org with no customization renders pixel-identical to today.
  // Deliberately not a tailwind.config.ts change -- this stays confined to portal-specific
  // files, not a rewrite of the whole app's color system (the staff dashboard is unaffected).
  const brandingStyle: React.CSSProperties = {
    ...(branded && org?.brandingPrimaryColor ? { ["--portal-primary" as string]: org.brandingPrimaryColor } : {}),
    ...(branded && org?.brandingHeaderColor ? { ["--portal-header" as string]: org.brandingHeaderColor } : {}),
  };

  return (
    <div className="min-h-screen bg-brand-surface md:flex" style={brandingStyle}>
      <PortalNav logoUrl={(branded ? org?.brandingLogoUrl : null) ?? null} orgName={orgName} />
      <div className="min-w-0 flex-1">{children}</div>
      <PortalOnboardingTourLauncher seenPages={customerUser.seenTourPages} />
    </div>
  );
}
