import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { updateBusinessIdentity, updateComplianceProfile } from "./actions";
import { US_STATES } from "@/lib/us-states";
import { organizationHasCommercialPools } from "@/lib/compliance";
import { ReplayTourButton } from "@/app/components/replay-tour-button";

/**
 * Everything past the two editable forms is navigation, so it's a grid of destinations rather than
 * six more full-width cards. Stacked identically they read as six things to work through; as a grid
 * they read as a menu, which is what they are.
 */
const SETTINGS_LINKS: { href: string; title: string; description: string }[] = [
  {
    href: "/dashboard/settings/pay-rates",
    title: "Pay rates",
    description:
      "What each technician is paid per body of water, and the pay-period cycle behind their estimated-earnings total.",
  },
  {
    href: "/dashboard/settings/branding",
    title: "Branding",
    description:
      "Your logo and colors, shown in the customer portal and on every email a customer receives — welcome, service summaries and alerts.",
  },
  {
    href: "/dashboard/settings/service-messages",
    title: "Service messages",
    description:
      "The preset messages a technician picks from at completion. The one they choose is sent in the customer's service summary email.",
  },
  {
    href: "/dashboard/settings/quickbooks-export",
    title: "QuickBooks export",
    description:
      "CSVs for your customer list, chemical costs and technician pay — shaped for QuickBooks' own import tools, no connected account needed.",
  },
  {
    href: "/dashboard/settings/phone-agent",
    title: "AI phone agent",
    description: "Answers a missed call — after-hours or just busy — with an interactive voicemail that becomes a ticket.",
  },
];

export default async function SettingsPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const organization = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { businessName: true, businessPhone: true, state: true, hasCommercialPools: true },
  });
  const effectiveHasCommercialPools = await organizationHasCommercialPools(
    appUser.organizationId,
    organization?.hasCommercialPools ?? null,
  );

  return (
    <main className="app-page">
      <header className="app-page-head">
        <p className="app-kicker">Admin</p>
        <h1 className="app-h1">Company settings</h1>
        <p className="app-subhead">
          Your business name and phone show on your public QR/inspector-log pages and CSV exports — the information
          your own customers and inspectors see.
        </p>
      </header>

      <section className="app-card mt-6">
        <h2 className="font-display text-base font-semibold text-brand-ink">Business identity</h2>
        <form action={updateBusinessIdentity} className="mt-3 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Business name</span>
              <input
                name="businessName"
                defaultValue={organization?.businessName ?? ""}
                placeholder="Your Pool Service LLC"
                className="app-field mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Business phone</span>
              <input
                name="businessPhone"
                defaultValue={organization?.businessPhone ?? ""}
                placeholder="702-555-0100"
                className="app-field mt-1"
              />
            </label>
          </div>
          <button className="app-btn-primary-sm" type="submit">
            Save
          </button>
        </form>
      </section>

      <section className="app-card mt-4">
        <h2 className="font-display text-base font-semibold text-brand-ink">Compliance profile</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Determines which state&rsquo;s health department rules apply to closure-risk banners and the public inspector
          log. See the{" "}
          <Link href="/dashboard/compliance" className="app-link">
            Compliance
          </Link>{" "}
          tab for details.
        </p>
        <form action={updateComplianceProfile} className="mt-3 space-y-3">
          <label className="block max-w-sm text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-muted">State</span>
            <select name="state" defaultValue={organization?.state ?? ""} className="app-field mt-1">
              <option value="">Not set</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="text-sm">
            <legend className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
              Do you have commercial pools?
            </legend>
            <div className="mt-2 flex flex-wrap gap-4">
              <label className="flex min-h-[44px] items-center gap-2 text-brand-ink">
                <input
                  type="radio"
                  name="hasCommercialPools"
                  value="true"
                  defaultChecked={organization?.hasCommercialPools === true}
                  className="h-5 w-5 accent-brand-primary"
                />
                Yes
              </label>
              <label className="flex min-h-[44px] items-center gap-2 text-brand-ink">
                <input
                  type="radio"
                  name="hasCommercialPools"
                  value="false"
                  defaultChecked={organization?.hasCommercialPools === false}
                  className="h-5 w-5 accent-brand-primary"
                />
                No, residential only
              </label>
            </div>
            {effectiveHasCommercialPools && organization?.hasCommercialPools !== true ? (
              <p className="mt-1 text-xs text-brand-warn">
                This account already has at least one commercial property, so compliance features are showing
                regardless of this setting.
              </p>
            ) : null}
          </fieldset>

          <button className="app-btn-primary-sm" type="submit">
            Save
          </button>
        </form>
      </section>

      <h2 className="app-kicker mt-8">More settings</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {SETTINGS_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="app-card app-card-hover flex flex-col">
            <span className="font-display text-base font-semibold text-brand-ink">{link.title}</span>
            <span className="mt-1 text-sm text-brand-muted">{link.description}</span>
            <span className="mt-3 text-sm font-medium text-brand-primary">Open →</span>
          </Link>
        ))}
      </div>

      <section className="app-card mt-4">
        <h2 className="font-display text-base font-semibold text-brand-ink">Getting-started tour</h2>
        <p className="mt-1 text-sm text-brand-muted">Revisit the dashboard walkthrough shown when you first signed in.</p>
        <ReplayTourButton returnTo="/dashboard" className="app-btn-secondary-sm mt-3" />
      </section>
    </main>
  );
}
