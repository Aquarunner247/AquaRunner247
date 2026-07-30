import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { NewCustomerFormFields } from "@/app/components/new-customer-form-fields";
import { createCustomer } from "./actions";

type PageProps = {
  searchParams?: Promise<{ new?: string }>;
};

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
            <Link href="/dashboard/customers?new=1" className="app-btn-primary-sm">
              + Add customer
            </Link>
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
              <p className="text-sm font-semibold text-slate-900">Add customer + property</p>
              <Link href="/dashboard/customers" className="text-sm text-slate-500 underline">
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

      <section className="mt-6 space-y-6">
        {customers.length === 0 ? (
          <p className="app-card-inset text-sm text-slate-500">No customers yet.</p>
        ) : (
          customerGroups.map((group) => (
            <div key={group.letter}>
              <p className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-blue">{group.letter}</p>
              <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
                {group.customers.map((customer) => {
                  const property = customer.properties[0];
                  const venueCount = customer.properties.reduce((sum, p) => sum + p.bodiesOfWater.length, 0);
                  return (
                    <Link
                      key={customer.id}
                      href={`/dashboard/customers/${customer.id}`}
                      className="group flex items-center gap-3 rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-blue/40 hover:shadow-soft"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-mist font-[family-name:var(--font-display)] text-sm font-bold text-brand-blue">
                        {customer.name.trim().charAt(0).toUpperCase() || "?"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-brand-navy">{customer.name}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {property?.managementCompany ? `${property.managementCompany.name} · ` : ""}
                          {[property?.city, property?.region].filter(Boolean).join(", ") || "No address on file"}
                        </p>
                      </div>
                      <span className="app-badge shrink-0">
                        {venueCount} venue{venueCount === 1 ? "" : "s"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
