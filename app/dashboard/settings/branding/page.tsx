import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { updateBranding, uploadLogo, removeLogo, updateWelcomeEmailSettings } from "./actions";
import { BrandingForm } from "./branding-form";

type PageProps = {
  searchParams?: Promise<{ error?: string; saved?: string }>;
};

export default async function BrandingSettingsPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const sp = (await searchParams) ?? {};

  const organization = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: {
      businessName: true,
      name: true,
      brandingLogoUrl: true,
      brandingPrimaryColor: true,
      brandingHeaderColor: true,
      welcomeEmailEnabled: true,
      welcomeEmailSupportEmail: true,
      welcomeEmailSupportPhone: true,
      welcomeEmailIntroText: true,
    },
  });

  const orgName = organization?.businessName ?? organization?.name ?? "Your Company";

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <div className="text-sm text-brand-muted">
        <Link href="/dashboard/settings" className="underline">
          Settings
        </Link>
        {" / "}
        <span>Branding</span>
      </div>

      <header className="mt-2 border-b border-brand-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">Admin</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Branding</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Your logo and colors show up in the customer portal (visible to your own customers when they log in) and
          the welcome email sent when you create a portal login for them.
        </p>
      </header>

      <BrandingForm
        actions={{ updateBranding, uploadLogo, removeLogo, updateWelcomeEmailSettings }}
        orgName={orgName}
        initial={{
          logoUrl: organization?.brandingLogoUrl ?? "",
          primaryColor: organization?.brandingPrimaryColor ?? "",
          headerColor: organization?.brandingHeaderColor ?? "",
          welcomeEmailEnabled: organization?.welcomeEmailEnabled ?? true,
          supportEmail: organization?.welcomeEmailSupportEmail ?? "",
          supportPhone: organization?.welcomeEmailSupportPhone ?? "",
          introText: organization?.welcomeEmailIntroText ?? "",
        }}
        error={sp.error ? decodeURIComponent(sp.error) : null}
        saved={sp.saved === "1"}
      />
    </main>
  );
}
