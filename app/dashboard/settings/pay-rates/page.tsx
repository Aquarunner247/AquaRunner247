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
  searchParams?: Promise<{ edit?: string; saved?: string }>;
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
    // Ordered by the raw ids, which sort essentially at random relative to what's actually
    // shown (technician name, property/body name) -- the real display order is built below
    // from bodiesOfWater (already property-name/body-name sorted), not trusted from here.
    prisma.technicianPayRate.findMany({
      where: { organizationId: appUser.organizationId },
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
  // activeAssignments is one row per RecurringStop, so a venue serviced on Monday, Wednesday and
  // Friday produced THREE identical "missing rate" entries -- the count was overstating the real
  // work by however many days each venue is on. A missing rate is one fact about a
  // (technician, venue) pair regardless of how often they visit, so dedupe on exactly that.
  const unratedByPair = new Map<string, { technicianId: string; technicianLabel: string; venueLabel: string }>();
  for (const a of activeAssignments) {
    const technicianId = a.route.technicianId;
    if (!technicianId || !a.bodyOfWaterId) continue;
    const key = `${technicianId}:${a.bodyOfWaterId}`;
    if (activeRateKeys.has(key) || unratedByPair.has(key)) continue;
    unratedByPair.set(key, {
      technicianId,
      technicianLabel: a.route.technician?.name ?? a.route.technician?.email ?? "Unknown tech",
      venueLabel: `${a.bodyOfWater?.property ? `${a.bodyOfWater.property.name} — ` : ""}${a.bodyOfWater?.name ?? "Unknown venue"}`,
    });
  }

  // Grouped by technician: the list repeated one name per row, which for a single technician with
  // 19 unrated venues meant 19 lines that differed only at the end.
  const unratedByTech = new Map<string, { technicianLabel: string; venues: string[] }>();
  for (const entry of unratedByPair.values()) {
    const group = unratedByTech.get(entry.technicianId) ?? { technicianLabel: entry.technicianLabel, venues: [] };
    group.venues.push(entry.venueLabel);
    unratedByTech.set(entry.technicianId, group);
  }
  const unratedGroups = [...unratedByTech.values()]
    .map((g) => ({ ...g, venues: g.venues.sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => a.technicianLabel.localeCompare(b.technicianLabel));
  const unratedCount = unratedByPair.size;

  const editingRate = editingId ? rates.find((r) => r.id === editingId) : null;

  // Grouped by venue (not flattened by raw id order, which sorted at random relative to
  // what's on screen) so a newly-added rate lands next to its own body of water instead of
  // wherever its technician/body id happened to fall. bodiesOfWater is already sorted
  // property name -> body name; that order IS the group order here. Only venues with at
  // least one rate on record get a group -- a venue with none at all is already covered by
  // the "Missing pay rates" banner above, repeating it here as an empty group would just
  // add noise.
  const ratesByBody = new Map<string, typeof rates>();
  for (const r of rates) {
    const arr = ratesByBody.get(r.bodyOfWaterId) ?? [];
    arr.push(r);
    ratesByBody.set(r.bodyOfWaterId, arr);
  }
  const venueGroups = bodiesOfWater
    .map((body) => {
      const venueRates = (ratesByBody.get(body.id) ?? []).slice().sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        const nameA = a.technician.name ?? a.technician.email;
        const nameB = b.technician.name ?? b.technician.email;
        if (nameA !== nameB) return nameA.localeCompare(nameB);
        return b.effectiveDate.getTime() - a.effectiveDate.getTime();
      });
      return { body, activeRates: venueRates.filter((r) => r.isActive), pastRates: venueRates.filter((r) => !r.isActive) };
    })
    .filter((g) => g.activeRates.length > 0 || g.pastRates.length > 0);

  function renderRateRow(r: (typeof rates)[number]) {
    const isEditing = editingRate?.id === r.id;
    if (isEditing) {
      return (
        <form key={r.id} action={updateTechnicianPayRate} className="flex flex-wrap items-center gap-2 px-3 py-2">
          <input type="hidden" name="id" value={r.id} />
          <span className="text-sm font-medium text-brand-ink">{r.technician.name ?? r.technician.email}</span>
          <input name="rateAmount" type="number" step="0.01" defaultValue={r.rateAmount.toString()} className="app-field w-28" required />
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
      );
    }
    return (
      <div key={r.id} className={`flex items-center gap-2 px-3 py-2 ${r.isActive ? "" : "opacity-60"}`}>
        <div className="grid flex-1 grid-cols-4 items-center gap-2 text-sm">
          <span className="font-medium text-brand-ink">{r.technician.name ?? r.technician.email}</span>
          <span className="app-metric text-brand-ink/70">
            {fmtMoney(Number(r.rateAmount))}
            {r.isBundled ? ` · bundled into ${r.bundledIntoBodyOfWater?.name ?? "another body"}` : ""}
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
    );
  }

  return (
    <main className="app-page-lg">
      <div className="text-sm text-brand-muted">
        <Link href="/dashboard/settings" className="app-link">
          Settings
        </Link>
        {" / "}
        <span>Pay rates</span>
      </div>

      <header className="app-page-head mt-2">
        <p className="app-kicker">Admin</p>
        <h1 className="app-h1">Pay rates</h1>
        <p className="app-subhead">
          What each technician is paid for completing a service visit at a given body of water. Technicians never see
          this table — only their own running estimated-earnings total. This can also be set inline from a body of
          water&rsquo;s own detail page; both places edit the same records.
        </p>
      </header>

      {unratedCount > 0 ? (
        /* Collapsed by default. This is a "worth knowing" notice, not a task list -- it doesn't
           block anything -- and at 19 venues an always-open list pushed the rate table itself
           below the fold, which is what the page is actually for. */
        <details className="app-card mt-6 border-l-4 border-l-brand-warn">
          {/* list-none alone leaves Safari's own triangle in place, hence the webkit selector --
              the summary already has its own "Show which" affordance. */}
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-display text-base font-semibold text-brand-ink">
                {unratedCount} venue{unratedCount === 1 ? "" : "s"} without a pay rate
              </span>
              <span className="text-sm font-medium text-brand-primary">Show which →</span>
            </span>
            <span className="mt-1 block text-sm text-brand-muted">
              {unratedGroups.map((g) => `${g.technicianLabel} (${g.venues.length})`).join(" · ")}
            </span>
          </summary>

          <p className="mt-3 border-t border-brand-border pt-3 text-sm text-brand-muted">
            These are on an active route with a technician assigned but have no pay rate for that technician, so visits
            there won&rsquo;t count toward their estimated earnings until one is added below. Completing a visit is
            never blocked by this.
          </p>

          {unratedGroups.map((group) => (
            <div key={group.technicianLabel} className="mt-3">
              <p className="text-sm font-semibold text-brand-ink">
                {group.technicianLabel} <span className="font-normal text-brand-muted">— {group.venues.length}</span>
              </p>
              {/* Two columns: the names are short and there are a lot of them. */}
              <ul className="mt-1 grid gap-x-6 gap-y-0.5 text-sm text-brand-ink md:grid-cols-2">
                {group.venues.map((venue) => (
                  <li key={venue} className="truncate">
                    {venue}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      ) : null}

      <section className="app-card mt-4">
        <h2 className="font-display text-base font-semibold text-brand-ink">Rate table</h2>
        <p className="mt-1 text-sm text-brand-muted">Grouped by venue — each shows its active rate(s) first; past/voided rates are tucked away.</p>
        {/* Two columns from md up. Each venue card is short (usually one rate row), so a single
            column left most of the width empty and made the page far longer than it needed to be.
            items-start so a card with past rates expanded doesn't stretch its neighbour. */}
        <div className="mt-3 grid items-start gap-3 md:grid-cols-2">
          {venueGroups.map(({ body, activeRates, pastRates }) => {
            const editingIsInPast = pastRates.some((r) => r.id === editingRate?.id);
            return (
              <div key={body.id} className="overflow-hidden rounded-lg border border-brand-border">
                <div className="border-b border-brand-border bg-brand-surface px-3 py-1.5">
                  <p className="text-sm font-semibold text-brand-ink">
                    {body.property.name} <span className="text-brand-muted">— {body.name}</span>
                  </p>
                </div>
                <div className="divide-y divide-brand-border">
                  {activeRates.length > 0 ? (
                    activeRates.map((r) => renderRateRow(r))
                  ) : (
                    <p className="px-3 py-2 text-sm text-brand-muted">No active rate for this venue.</p>
                  )}
                </div>
                {pastRates.length > 0 ? (
                  <details className="border-t border-brand-border bg-brand-surface px-3 py-2" open={editingIsInPast || undefined}>
                    <summary className="cursor-pointer text-xs font-medium text-brand-muted">
                      {pastRates.length} past rate{pastRates.length === 1 ? "" : "s"}
                    </summary>
                    <div className="mt-2 divide-y divide-brand-border rounded border border-brand-border bg-white">
                      {pastRates.map((r) => renderRateRow(r))}
                    </div>
                  </details>
                ) : null}
              </div>
            );
          })}
          {venueGroups.length === 0 ? <p className="app-card-inset text-sm text-brand-ink/60">No pay rates set yet.</p> : null}
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

      <details className="app-card mt-4" open={sp.saved === "1" || undefined}>
        <summary className="cursor-pointer text-base font-semibold text-brand-ink">Payroll period</summary>
        <p className="mt-1 text-sm text-brand-muted">
          Determines the &ldquo;This pay period&rdquo; window shown on technicians&rsquo; estimated-earnings card. Pay
          structure is flat-rate-per-property only for now (the only option available).
        </p>
        {sp.saved === "1" ? <p className="mt-2 text-sm text-brand-ok">Saved.</p> : null}
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
      </details>
    </main>
  );
}
