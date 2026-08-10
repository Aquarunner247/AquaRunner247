import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { updateBusinessIdentity, updateComplianceProfile } from "./actions";
import { US_STATES } from "@/lib/us-states";
import { organizationHasCommercialPools } from "@/lib/compliance";

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
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="border-b border-brand-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">Admin</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Company settings</h1>
        <p className="mt-1 text-sm text-brand-muted">
          This business name and phone show on your public QR/inspector-log pages and CSV exports — the
          information your own customers and inspectors see.
        </p>
      </header>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <form action={updateBusinessIdentity} className="space-y-3">
          <label className="block text-sm">
            <span className="text-brand-ink">Business name</span>
            <input
              name="businessName"
              defaultValue={organization?.businessName ?? ""}
              placeholder="Your Pool Service LLC"
              className="mt-1 w-full rounded border border-brand-control px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-brand-ink">Business phone</span>
            <input
              name="businessPhone"
              defaultValue={organization?.businessPhone ?? ""}
              placeholder="702-555-0100"
              className="mt-1 w-full rounded border border-brand-control px-2 py-1.5 text-sm"
            />
          </label>
          <button className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white" type="submit">
            Save
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-brand-ink">Compliance profile</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Determines which state&rsquo;s health department rules apply to closure-risk banners and the public
          inspector log. See the{" "}
          <a href="/dashboard/compliance" className="app-link">
            Compliance
          </a>{" "}
          tab for details.
        </p>
        <form action={updateComplianceProfile} className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="text-brand-ink">State</span>
            <select
              name="state"
              defaultValue={organization?.state ?? ""}
              className="mt-1 w-full rounded border border-brand-control px-2 py-1.5 text-sm"
            >
              <option value="">Not set</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="text-sm">
            <span className="text-brand-ink">Do you have commercial pools?</span>
            <div className="mt-1 flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="hasCommercialPools"
                  value="true"
                  defaultChecked={organization?.hasCommercialPools === true}
                />
                Yes
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="hasCommercialPools"
                  value="false"
                  defaultChecked={organization?.hasCommercialPools === false}
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
          </div>
          <button className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white" type="submit">
            Save
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-brand-ink">Pay rates</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Set what each technician is paid per body of water, and the pay-period cycle used for their
          estimated-earnings total.
        </p>
        <a href="/dashboard/settings/pay-rates" className="app-link mt-2 inline-block text-sm">
          Manage pay rates →
        </a>
      </section>
    </main>
  );
}
