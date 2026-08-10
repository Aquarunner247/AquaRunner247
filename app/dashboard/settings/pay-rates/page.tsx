import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { WEEKDAY_LABELS } from "@/lib/service-weekdays";
import { getOrgPayrollSettings } from "@/lib/technician-pay";
import {
  createTechnicianPayRate,
  updateTechnicianPayRate,
  deactivateTechnicianPayRate,
  updatePayrollSettings,
} from "./actions";

type PageProps = {
  searchParams?: Promise<{ edit?: string }>;
};

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function toYmd(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export default async function PayRatesPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const sp = (await searchParams) ?? {};
  const editingId = sp.edit ?? "";

  const [technicians, bodiesOfWater, rates, activeAssignments, payrollSettings] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: appUser.organizationId, role: "TECHNICIAN" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    prisma.bodyOfWater.findMany({
      where: { property: { organizationId: appUser.organizationId } },
      orderBy: [{ property: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, property: { select: { name: true } } },
    }),
    prisma.technicianPayRate.findMany({
      where: { organizationId: appUser.organizationId },
      orderBy: [{ technicianId: "asc" }, { bodyOfWaterId: "asc" }, { effectiveDate: "desc" }],
      include: {
        technician: { select: { id: true, name: true, email: true } },
        bodyOfWater: { select: { id: true, name: true, property: { select: { name: true } } } },
        bundledIntoBodyOfWater: { select: { name: true } },
      },
    }),
    // "Actively being serviced" -- bodies of water on an active recurring route with both a
    // technician and a specific body assigned. This is the proactive side of "Unrated
    // visits" (Section 4); the retroactive side (a COMPLETED visit that resolved to no
    // rate) is handled per-visit by lib/technician-pay.ts and intentionally not surfaced to
    // the technician (Section 6: admin-facing alert only).
    prisma.recurringStop.findMany({
      where: { route: { organizationId: appUser.organizationId, active: true, technicianId: { not: null } }, bodyOfWaterId: { not: null } },
      select: {
        route: { select: { technicianId: true, technician: { select: { name: true, email: true } } } },
        bodyOfWaterId: true,
        bodyOfWater: { select: { name: true, property: { select: { name: true } } } },
      },
    }),
    getOrgPayrollSettings(appUser.organizationId),
  ]);

  const activeRateKeys = new Set(
    rates.filter((r) => r.isActive).map((r) => `${r.technicianId}:${r.bodyOfWaterId}`),
  );
  const unrated = activeAssignments.filter(
    (a) => a.route.technicianId && a.bodyOfWaterId && !activeRateKeys.has(`${a.route.technicianId}:${a.bodyOfWaterId}`),
  );

  const editingRate = editingId ? rates.find((r) => r.id === editingId) : null;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <div className="text-sm text-brand-muted">
        <Link href="/dashboard/settings" className="underline">
          Settings
        </Link>
        {" / "}
        <span>Pay rates</span>
      </div>

      <header className="mt-2 border-b border-brand-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">Admin</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Pay rates</h1>
        <p className="mt-1 text-sm text-brand-muted">
          What each technician is paid for completing a service visit at a given body of water. Technicians never see
          this table — only their own running estimated-earnings total. This can also be set inline from a body of
          water&rsquo;s own detail page; both places edit the same records.
        </p>
      </header>

      {unrated.length > 0 ? (
        <section className="mt-6 rounded-lg border border-brand-danger/30 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-brand-danger">Missing pay rates ({unrated.length})</h2>
          <p className="mt-1 text-xs text-brand-muted">
            These properties are on an active route with a technician assigned, but have no pay rate set for that
            technician — visits there won&rsquo;t count toward that tech&rsquo;s estimated earnings until one is
            added below. Visit completion is never blocked by this.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-brand-ink">
            {unrated.map((a, i) => (
              <li key={i}>
                {a.route.technician?.name ?? a.route.technician?.email ?? "Unknown tech"} — {a.bodyOfWater?.name}
                {a.bodyOfWater?.property ? ` (${a.bodyOfWater.property.name})` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-brand-ink">Rate table</h2>
        <div className="mt-3 space-y-2">
          {rates.map((r) => {
            const isEditing = editingRate?.id === r.id;
            return (
              <div key={r.id} className={`app-card-inset ${r.isActive ? "" : "opacity-50"}`}>
                {!isEditing ? (
                  <div className="flex items-center gap-2">
                    <div className="grid flex-1 grid-cols-5 items-center gap-2 text-sm">
                      <span className="font-medium text-brand-ink">{r.technician.name ?? r.technician.email}</span>
                      <span className="text-brand-ink/80">
                        {r.bodyOfWater.name} ({r.bodyOfWater.property.name})
                      </span>
                      <span className="app-metric text-brand-ink/70">
                        {fmtMoney(Number(r.rateAmount))}
                        {r.isBundled ? " · bundled" : ""}
                      </span>
                      <span className="text-xs text-brand-muted">Effective {toYmd(r.effectiveDate)}</span>
                      <span className="text-xs text-brand-muted">{r.isActive ? "Active" : "Voided"}</span>
                    </div>
                    <a href={`/dashboard/settings/pay-rates?edit=${r.id}`} className="app-btn-secondary-sm">
                      Edit
                    </a>
                    {r.isActive ? (
                      <form action={deactivateTechnicianPayRate}>
                        <input type="hidden" name="id" value={r.id} />
                        <ConfirmSubmitButton
                          label="Void"
                          confirmMessage={`Void this rate for ${r.technician.name ?? r.technician.email} at ${r.bodyOfWater.name}? This keeps it on record but stops it applying going forward.`}
                          className="app-btn-danger-sm"
                        />
                      </form>
                    ) : null}
                  </div>
                ) : (
                  <form action={updateTechnicianPayRate} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <span className="text-sm font-medium text-brand-ink">
                      {r.technician.name ?? r.technician.email} — {r.bodyOfWater.name}
                    </span>
                    <input
                      name="rateAmount"
                      type="number"
                      step="0.01"
                      defaultValue={r.rateAmount.toString()}
                      className="app-field w-28"
                      required
                    />
                    <label className="flex items-center gap-1 text-xs text-brand-ink">
                      <input type="checkbox" name="isBundled" defaultChecked={r.isBundled} />
                      Bundled (pay folded into another body)
                    </label>
                    <select name="bundledIntoBodyOfWaterId" defaultValue={r.bundledIntoBodyOfWaterId ?? ""} className="app-field">
                      <option value="">— not bundled —</option>
                      {bodiesOfWater
                        .filter((b) => b.id !== r.bodyOfWaterId)
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.property.name})
                          </option>
                        ))}
                    </select>
                    <input name="effectiveDate" type="date" defaultValue={toYmd(r.effectiveDate)} className="app-field" required />
                    <button type="submit" className="app-btn-primary-sm">
                      Save
                    </button>
                    <a href="/dashboard/settings/pay-rates" className="app-btn-secondary-sm">
                      Cancel
                    </a>
                  </form>
                )}
              </div>
            );
          })}
          {rates.length === 0 ? <p className="app-card-inset text-sm text-brand-ink/60">No pay rates set yet.</p> : null}
        </div>

        <form action={createTechnicianPayRate} className="app-card-inset mt-4">
          <p className="text-sm font-medium text-brand-ink">Add a rate</p>
          <p className="mt-0.5 text-xs text-brand-muted">
            Adds a new effective-dated rate rather than overwriting an existing one — a technician&rsquo;s past,
            already-completed visits keep using whatever rate was active at the time.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5">
            <select name="technicianId" required className="app-field">
              <option value="">Technician…</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name ?? t.email}
                </option>
              ))}
            </select>
            <select name="bodyOfWaterId" required className="app-field">
              <option value="">Body of water…</option>
              {bodiesOfWater.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.property.name})
                </option>
              ))}
            </select>
            <input name="rateAmount" type="number" step="0.01" required placeholder="Rate ($)" className="app-field" />
            <input name="effectiveDate" type="date" defaultValue={toYmd(new Date())} className="app-field" />
            <label className="flex items-center gap-1 text-xs text-brand-ink">
              <input type="checkbox" name="isBundled" />
              Bundled ($0, folded into another body)
            </label>
          </div>
          <div className="mt-2">
            <label className="text-xs text-brand-ink">
              If bundled, which body carries the combined rate (for reference only):
              <select name="bundledIntoBodyOfWaterId" className="app-field mt-1 md:w-72">
                <option value="">— not bundled —</option>
                {bodiesOfWater.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.property.name})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="app-btn-primary-sm mt-2" type="submit">
            Add rate
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-brand-ink">Payroll period</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Determines the &ldquo;This pay period&rdquo; window shown on technicians&rsquo; estimated-earnings card. Pay
          structure is flat-rate-per-property only for now (the only option available).
        </p>
        <form action={updatePayrollSettings} className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="text-brand-ink">Pay period type</span>
            <select name="payPeriodType" defaultValue={payrollSettings.payPeriodType} className="app-field mt-1 md:w-56">
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Biweekly</option>
              <option value="SEMI_MONTHLY">Semi-monthly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="text-brand-ink">Weekly: period starts on</span>
              <select
                name="weeklyStartDayOfWeek"
                defaultValue={payrollSettings.weeklyStartDayOfWeek?.toString() ?? "1"}
                className="app-field mt-1"
              >
                {Object.entries(WEEKDAY_LABELS).map(([n, label]) => (
                  <option key={n} value={n}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-brand-ink">Biweekly: a past period&rsquo;s start date (anchor)</span>
              <input
                name="biweeklyAnchorStartDate"
                type="date"
                defaultValue={payrollSettings.biweeklyAnchorStartDate ? toYmd(payrollSettings.biweeklyAnchorStartDate) : ""}
                className="app-field mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-brand-ink">Semi-monthly: split day (1st–15th default)</span>
              <input
                name="semiMonthlySplitDay"
                type="number"
                min={1}
                max={27}
                defaultValue={payrollSettings.semiMonthlySplitDay ?? 15}
                className="app-field mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="text-brand-ink">Monthly: day of month period resets</span>
              <input
                name="monthlyPayDay"
                type="number"
                min={1}
                max={28}
                defaultValue={payrollSettings.monthlyPayDay ?? ""}
                className="app-field mt-1"
              />
            </label>
          </div>

          <button className="app-btn-primary-sm" type="submit">
            Save
          </button>
        </form>
      </section>
    </main>
  );
}
