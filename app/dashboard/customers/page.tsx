import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { NewCustomerFormFields } from "@/app/components/new-customer-form-fields";
import { createCustomer, sendBulkCustomerAlert } from "./actions";
import { CustomerBulkList } from "./customer-bulk-list";

type PageProps = {
  searchParams?: Promise<{ new?: string; bulkAlertSent?: string; bulkAlertError?: string }>;
};

type BulkAlertSummary = { total: number; sent: number; partial: number; failed: number; noRecipients: number; notFound: number };

function summarizeBulkAlert(raw: string): string | null {
  let summary: BulkAlertSummary;
  try {
    summary = JSON.parse(raw);
  } catch {
    return null;
  }
  const parts: string[] = [];
  if (summary.sent > 0) parts.push(`sent to ${summary.sent} of ${summary.total}`);
  if (summary.partial > 0) parts.push(`${summary.partial} only partly delivered`);
  if (summary.failed > 0) parts.push(`${summary.failed} failed to send`);
  if (summary.noRecipients > 0) parts.push(`${summary.noRecipients} had no email on file`);
  if (summary.notFound > 0) parts.push(`${summary.notFound} no longer active`);
  return parts.length ? parts.join(", ") + "." : `Nothing sent — ${summary.total} customer${summary.total === 1 ? "" : "s"} selected.`;
}

export default async function CustomersAdminPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const sp = (await searchParams) ?? {};
  const showAddForm = sp.new === "1";

  const managementCompanies = await prisma.managementCompany.findMany({
    where: { organizationId: appUser.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const customers = await prisma.customer.findMany({
    where: { organizationId: appUser.organizationId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      relationshipEndedAt: true,
      properties: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          city: true,
          region: true,
          managementCompany: { select: { name: true } },
          bodiesOfWater: { select: { id: true } },
        },
      },
    },
  });

  // DB collation can't be relied on for correct case-insensitive alphabetical order, so
  // re-sort in JS and group by first letter for the section headers below.
  customers.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  const customerGroups: { letter: string; customers: typeof customers }[] = [];
  for (const customer of customers) {
    const firstChar = customer.name.trim().charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(firstChar) ? firstChar : "#";
    const currentGroup = customerGroups[customerGroups.length - 1];
    if (currentGroup && currentGroup.letter === letter) {
      currentGroup.customers.push(customer);
    } else {
      customerGroups.push({ letter, customers: [customer] });
    }
  }

  return (
    <main className="app-page-wide">
      <header className="app-page-head flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="app-kicker">Admin</p>
          <h1 className="app-h1">Customers</h1>
          <p className="app-subhead">Click a customer to manage their property, aquatic venues, and history.</p>
        </div>
        <div className="flex items-center gap-3">
          {!showAddForm ? (
            <>
              <Link href="/dashboard/customers?new=1" data-tour="customers-add" className="app-btn-primary-sm">
                + Add customer
              </Link>
              <Link href="/dashboard/customers/import" className="app-btn-secondary-sm">
                Import from CSV
              </Link>
            </>
          ) : null}
          <Link href="/dashboard" className="app-link">
            Back to dashboard
          </Link>
        </div>
      </header>

      {showAddForm ? (
        <section className="mt-6">
          <form action={createCustomer} className="app-card">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-brand-ink">Add customer + property</p>
              <Link href="/dashboard/customers" className="text-sm text-brand-muted underline">
                Cancel
              </Link>
            </div>
            <div className="mt-3">
              <NewCustomerFormFields managementCompanies={managementCompanies} />
            </div>
            <button className="app-btn-primary-sm mt-3" type="submit">
              Create customer/property
            </button>
          </form>
        </section>
      ) : null}

      {sp.bulkAlertSent ? (
        <p className="app-card-inset mt-6 text-sm text-brand-ok">{summarizeBulkAlert(sp.bulkAlertSent) ?? "Sent."}</p>
      ) : null}
      {sp.bulkAlertError ? <p className="app-card-inset mt-6 text-sm text-brand-danger">{decodeURIComponent(sp.bulkAlertError)}</p> : null}

      <section data-tour="customers-list" className="mt-6">
        {customers.length === 0 ? (
          <p className="app-card-inset text-sm text-brand-muted">No customers yet.</p>
        ) : (
          <CustomerBulkList groups={customerGroups} sendBulkCustomerAlert={sendBulkCustomerAlert} />
        )}
      </section>
    </main>
  );
}
