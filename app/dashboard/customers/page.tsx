import Link from "next/link";
import { redirect } from "next/navigation";
import { BodyOfWaterType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { createBodyOfWater, createCustomer } from "./actions";

export default async function CustomersAdminPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const customers = await prisma.customer.findMany({
    where: { organizationId: appUser.organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      properties: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          managerName: true,
          managerBusinessPhone: true,
          managerMobilePhone: true,
          managerPhone: true,
          managerEmail: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          region: true,
          postalCode: true,
          bodiesOfWater: {
            orderBy: { createdAt: "desc" },
            select: { id: true, name: true, type: true, volumeGallons: true },
          },
        },
      },
    },
  });

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <p className="text-sm font-medium text-cyan-800">Admin</p>
          <h1 className="text-2xl font-semibold text-slate-900">Customers / Properties</h1>
          <p className="mt-1 text-sm text-slate-600">Customer and property are combined in one create flow.</p>
        </div>
        <Link href="/dashboard" className="text-sm text-cyan-700 underline">
          Back to dashboard
        </Link>
      </header>

      <section className="mt-6">
        <form action={createCustomer} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Add customer + property</p>
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
          <input
            name="addressLine1"
            placeholder="Address line 1"
            className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
          <input
            name="addressLine2"
            placeholder="Address line 2"
            className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
          <div className="mt-2 grid grid-cols-3 gap-2">
            <input
              name="city"
              placeholder="City"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
            <input
              name="region"
              placeholder="State"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
            <input
              name="postalCode"
              placeholder="ZIP"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <textarea
            name="notes"
            placeholder="Notes (optional)"
            className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            rows={3}
          />
          <div className="mt-3 border-t border-slate-200 pt-3">
            <p className="text-sm font-semibold text-slate-900">Initial body of water</p>
            <input
              name="initialBodyName"
              required
              placeholder="Body of water name (e.g. Main Pool)"
              className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <select name="initialBodyType" className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                {Object.values(BodyOfWaterType).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <input
                name="initialBodyVolumeGallons"
                type="number"
                step="1"
                placeholder="Volume gallons"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <button className="mt-3 rounded bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white" type="submit">
            Create customer/property
          </button>
        </form>
      </section>

      <section className="mt-6 space-y-3">
        {customers.map((customer) => (
          <div key={customer.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              <Link href={`/dashboard/customers/${customer.id}`} className="underline underline-offset-2">
                {customer.name}
              </Link>
            </h2>
            <p className="mt-1 text-xs text-slate-500">Click customer name to open full edit page.</p>
            {customer.properties.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No properties yet.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm text-slate-700">
                {customer.properties.map((property) => (
                  <li key={property.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                    <div className="font-medium text-slate-900">{property.name}</div>
                    {property.managerName ? <div className="text-slate-500">Manager: {property.managerName}</div> : null}
                    {property.managerBusinessPhone ? <div className="text-slate-500">Business: {property.managerBusinessPhone}</div> : null}
                    {property.managerMobilePhone ? <div className="text-slate-500">Mobile: {property.managerMobilePhone}</div> : null}
                    {!property.managerBusinessPhone && !property.managerMobilePhone && property.managerPhone ? (
                      <div className="text-slate-500">Phone: {property.managerPhone}</div>
                    ) : null}
                    {property.managerEmail ? <div className="text-slate-500">Email: {property.managerEmail}</div> : null}
                    {(property.addressLine1 || property.city || property.region || property.postalCode) ? (
                      <div className="text-slate-500">
                        Address: {property.addressLine1 ?? ""}
                        {property.addressLine2 ? `, ${property.addressLine2}` : ""}
                        {property.city ? `, ${property.city}` : ""}
                        {property.region ? `, ${property.region}` : ""}
                        {property.postalCode ? ` ${property.postalCode}` : ""}
                      </div>
                    ) : null}
                    <div className="mt-1 text-slate-600">
                      Bodies:{" "}
                      {property.bodiesOfWater.length
                        ? property.bodiesOfWater.map((b) => `${b.name} (${b.type})`).join(", ")
                        : "None"}
                    </div>
                    <form action={createBodyOfWater} className="mt-3 rounded border border-slate-200 bg-white p-2">
                      <input type="hidden" name="propertyId" value={property.id} />
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add body of water</p>
                      <div className="mt-2 grid gap-2 md:grid-cols-3">
                        <input
                          name="name"
                          required
                          placeholder="Body name"
                          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                        />
                        <select name="type" className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                          {Object.values(BodyOfWaterType).map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                        <input
                          name="volumeGallons"
                          type="number"
                          step="1"
                          placeholder="Volume gallons"
                          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <button className="mt-2 rounded bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white" type="submit">
                        Add body
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>
    </main>
  );
}
