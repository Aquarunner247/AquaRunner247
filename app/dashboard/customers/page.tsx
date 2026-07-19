import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { AddressFields } from "@/app/components/address-fields";
import { CustomerPropertyTypeFields } from "@/app/components/customer-property-type-fields";
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
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <p className="text-sm font-medium text-[#12234A]">Admin</p>
          <h1 className="text-2xl font-semibold text-slate-900">Customers</h1>
          <p className="mt-1 text-sm text-slate-600">Click a customer to manage their property, aquatic venues, and history.</p>
        </div>
        <div className="flex items-center gap-3">
          {!showAddForm ? (
            <Link
              href="/dashboard/customers?new=1"
              className="rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#12234A]"
            >
              + Add customer
            </Link>
          ) : null}
          <Link href="/dashboard" className="text-sm text-[#0A5FA4] underline">
            Back to dashboard
          </Link>
        </div>
      </header>

      {showAddForm ? (
        <section className="mt-6">
          <form action={createCustomer} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Add customer + property</p>
              <Link href="/dashboard/customers" className="text-sm text-slate-500 underline">
                Cancel
              </Link>
            </div>
            <input
              name="name"
              required
              placeholder="Property/customer name"
              className="mt-3 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
            <input
              name="managerName"
              placeholder="Manager name"
              className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
            <input
              name="managerBusinessPhone"
              placeholder="Manager business phone"
              className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
            <input
              name="managerMobilePhone"
              placeholder="Manager mobile phone"
              className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
            <input
              name="managerEmail"
              type="email"
              placeholder="Manager email"
              className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
            <div className="mt-3 border-t border-slate-200 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Maintenance contact</p>
              <input
                name="maintenanceName"
                placeholder="Maintenance name"
                className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
              <input
                name="maintenanceCellPhone"
                placeholder="Maintenance cell phone"
                className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
              <input
                name="maintenanceEmail"
                type="email"
                placeholder="Maintenance email"
                className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <select name="managementCompanyId" defaultValue="" className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                <option value="">No management company</option>
                {managementCompanies.map((mc) => (
                  <option key={mc.id} value={mc.id}>
                    {mc.name}
                  </option>
                ))}
              </select>
              <input
                name="newManagementCompanyName"
                placeholder="Or type a new company name"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="mt-2">
              <AddressFields />
            </div>
            <textarea
              name="notes"
              placeholder="Notes (optional)"
              className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              rows={3}
            />
            <CustomerPropertyTypeFields />
            <button className="mt-3 rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
              Create customer/property
            </button>
          </form>
        </section>
      ) : null}

      <section className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white shadow-sm">
        {customers.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No customers yet.</p>
        ) : (
          customerGroups.map((group) => (
            <div key={group.letter} className="flex">
              <div className="flex w-10 shrink-0 justify-center border-r border-slate-200 bg-slate-50 pt-4">
                <span className="text-xs font-semibold uppercase text-slate-400">{group.letter}</span>
              </div>
              <div className="min-w-0 flex-1 divide-y divide-slate-200">
                {group.customers.map((customer) => {
                  const property = customer.properties[0];
                  const venueCount = customer.properties.reduce((sum, p) => sum + p.bodiesOfWater.length, 0);
                  return (
                    <Link
                      key={customer.id}
                      href={`/dashboard/customers/${customer.id}`}
                      className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{customer.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {property?.managementCompany ? `${property.managementCompany.name} · ` : ""}
                          {[property?.city, property?.region].filter(Boolean).join(", ") || "No address on file"}
                        </p>
                      </div>
                      <p className="shrink-0 text-xs text-slate-400">
                        {venueCount} aquatic venue{venueCount === 1 ? "" : "s"}
                      </p>
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
