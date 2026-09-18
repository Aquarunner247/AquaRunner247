import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { getOrgPayrollSettings, getPayPeriodBounds } from "@/lib/technician-pay";

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function QuickBooksExportPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  // Prefills the two date-range exports with the org's own current pay period, rather than
  // an arbitrary fixed window -- the same bounds the technician earnings tracker itself
  // uses (lib/technician-pay.ts), so "this period" means the same thing everywhere.
  const settings = await getOrgPayrollSettings(appUser.organizationId);
  const period = getPayPeriodBounds(settings, new Date());
  const defaultFrom = toDateInputValue(period.start);
  const defaultTo = toDateInputValue(period.end);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <div className="text-sm text-brand-muted">
        <Link href="/dashboard/settings" className="underline">
          Settings
        </Link>
        {" / "}
        <span>QuickBooks export</span>
      </div>

      <header className="mt-2 border-b border-brand-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">Admin</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Export to QuickBooks</h1>
        <p className="mt-1 text-sm text-brand-muted">
          Downloads a CSV shaped for QuickBooks&rsquo; own import tools — no connected account, nothing sent
          anywhere automatically. This doesn&rsquo;t create invoices; it&rsquo;s for keeping QuickBooks&rsquo; customer list
          and books current from what&rsquo;s already tracked here.
        </p>
      </header>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-brand-ink">Customers</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Every property&rsquo;s billing contact and address — import into QuickBooks under Customers.
        </p>
        <a href="/api/exports/quickbooks/customers" className="app-btn-primary-sm mt-3 inline-block">
          Download CSV
        </a>
      </section>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-brand-ink">Chemical costs</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Chemical usage cost per logged dose, for posting as expenses — cost is the price actually in effect when
          each dose was logged, not today&rsquo;s catalog price.
        </p>
        <form action="/api/exports/quickbooks/chemical-expenses" method="GET" className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block text-brand-ink">From</span>
            <input type="date" name="from" defaultValue={defaultFrom} className="app-field" />
          </label>
          <label className="text-sm">
            <span className="block text-brand-ink">To</span>
            <input type="date" name="to" defaultValue={defaultTo} className="app-field" />
          </label>
          <button type="submit" className="app-btn-primary-sm">
            Download CSV
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-brand-ink">Technician pay</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Every rated, completed visit&rsquo;s payout for the period — a reference for your bookkeeper to enter
          into payroll. QuickBooks Payroll doesn&rsquo;t accept a generic CSV import for historical pay, so this
          isn&rsquo;t a one-click payroll run, just the numbers laid out for entry.
        </p>
        <form action="/api/exports/quickbooks/technician-pay" method="GET" className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="block text-brand-ink">From</span>
            <input type="date" name="from" defaultValue={defaultFrom} className="app-field" />
          </label>
          <label className="text-sm">
            <span className="block text-brand-ink">To</span>
            <input type="date" name="to" defaultValue={defaultTo} className="app-field" />
          </label>
          <button type="submit" className="app-btn-primary-sm">
            Download CSV
          </button>
        </form>
      </section>
    </main>
  );
}
