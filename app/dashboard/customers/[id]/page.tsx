import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BodyOfWaterType, EquipmentKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { createBodyOfWater } from "../actions";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import {
  createEquipment,
  deleteBodyOfWater,
  deleteCustomer,
  deleteEquipment,
  updateBodyOfWater,
  updateCustomer,
  updateProperty,
} from "./actions";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
};

export default async function CustomerDetailPage({ params, searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const tab = ["overview", "bodies", "equipment", "history"].includes(sp.tab ?? "") ? (sp.tab as "overview" | "bodies" | "equipment" | "history") : "overview";

  const customer = await prisma.customer.findFirst({
    where: { id, organizationId: appUser.organizationId },
    include: {
      properties: {
        orderBy: { createdAt: "desc" },
        include: {
          bodiesOfWater: { orderBy: { createdAt: "desc" }, include: { equipment: { orderBy: { createdAt: "desc" } } } },
        },
      },
    },
  });

  if (!customer) notFound();

  const completedVisits = await prisma.serviceVisit.findMany({
    where: {
      property: { customerId: customer.id, organizationId: appUser.organizationId },
      status: "COMPLETED",
      serviceComplete: true,
    },
    orderBy: { completedAt: "desc" },
    take: 50,
    include: {
      property: { select: { name: true } },
      bodyOfWater: { select: { name: true } },
      technician: { select: { name: true } },
      reading: { select: { ph: true, freeChlorinePpm: true, alkalinityPpm: true } },
    },
  });

  const tabLinkClass = (target: string) =>
    tab === target
      ? "rounded bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white"
      : "rounded px-3 py-1.5 text-sm font-medium text-cyan-800 hover:bg-cyan-50";

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <p className="text-sm font-medium text-cyan-800">Admin / Customer</p>
          <h1 className="text-2xl font-semibold text-slate-900">{customer.name}</h1>
          <p className="mt-1 text-sm text-slate-600">Edit customer and property details. Add bodies of water here.</p>
        </div>
        <Link href="/dashboard/customers" className="text-sm text-cyan-700 underline">
          Back to customers
        </Link>
      </header>

      <section className="mt-6 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <Link href={`/dashboard/customers/${customer.id}?tab=overview`} className={tabLinkClass("overview")}>
          Overview
        </Link>
        <Link href={`/dashboard/customers/${customer.id}?tab=bodies`} className={tabLinkClass("bodies")}>
          Bodies
        </Link>
        <Link href={`/dashboard/customers/${customer.id}?tab=equipment`} className={tabLinkClass("equipment")}>
          Equipment
        </Link>
        <Link href={`/dashboard/customers/${customer.id}?tab=history`} className={tabLinkClass("history")}>
          Service History
        </Link>
      </section>

      {tab === "overview" ? (
        <>
          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Customer info</h2>
            <form action={updateCustomer} className="mt-3 space-y-2">
              <input type="hidden" name="customerId" value={customer.id} />
              <input
                name="name"
                required
                defaultValue={customer.name}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
              <textarea
                name="notes"
                defaultValue={customer.notes ?? ""}
                placeholder="Notes"
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                rows={3}
              />
              <button className="rounded bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white" type="submit">
                Save customer
              </button>
            </form>
            <form action={deleteCustomer} className="mt-4 border-t border-slate-200 pt-4">
              <input type="hidden" name="customerId" value={customer.id} />
              <ConfirmSubmitButton
                label="Delete customer"
                confirmMessage="Delete this customer and all linked properties/data?"
                className="rounded bg-rose-700 px-3 py-1.5 text-sm font-medium text-white"
              />
              <p className="mt-1 text-xs text-rose-700">Deletes this customer and linked properties/data.</p>
            </form>
          </section>

          <section className="mt-6 space-y-3">
            {customer.properties.map((property) => (
              <div key={property.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">Property</h3>
                <form action={updateProperty} className="mt-3 space-y-2">
                  <input type="hidden" name="propertyId" value={property.id} />
                  <input
                    name="name"
                    required
                    defaultValue={property.name}
                    placeholder="Property name"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    name="managerName"
                    defaultValue={property.managerName ?? ""}
                    placeholder="Manager name"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input
                      name="managerBusinessPhone"
                      defaultValue={property.managerBusinessPhone ?? ""}
                      placeholder="Manager business phone"
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      name="managerMobilePhone"
                      defaultValue={property.managerMobilePhone ?? ""}
                      placeholder="Manager mobile phone"
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <input
                    name="managerEmail"
                    defaultValue={property.managerEmail ?? ""}
                    placeholder="Manager email"
                    type="email"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    name="addressLine1"
                    defaultValue={property.addressLine1 ?? ""}
                    placeholder="Address line 1"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    name="addressLine2"
                    defaultValue={property.addressLine2 ?? ""}
                    placeholder="Address line 2"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      name="city"
                      defaultValue={property.city ?? ""}
                      placeholder="City"
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      name="region"
                      defaultValue={property.region ?? ""}
                      placeholder="State"
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      name="postalCode"
                      defaultValue={property.postalCode ?? ""}
                      placeholder="ZIP"
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <button className="rounded bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white" type="submit">
                    Save property
                  </button>
                </form>
              </div>
            ))}
          </section>
        </>
      ) : null}

      {tab === "bodies" ? (
        <section className="mt-6 space-y-4">
          {customer.properties.map((property) => (
            <div key={property.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">{property.name}</h3>

              {property.bodiesOfWater.map((body) => (
                <div key={body.id} className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
                  <form action={updateBodyOfWater} className="space-y-2">
                    <input type="hidden" name="bodyId" value={body.id} />
                    <input type="hidden" name="customerId" value={customer.id} />
                    <div className="grid gap-2 md:grid-cols-3">
                      <input
                        name="name"
                        defaultValue={body.name}
                        required
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <select name="type" defaultValue={body.type} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
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
                        defaultValue={body.volumeGallons?.toString() ?? ""}
                        placeholder="Volume gallons"
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button className="rounded bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white" type="submit">
                        Save body
                      </button>
                    </div>
                  </form>
                  <form action={deleteBodyOfWater} className="mt-2">
                    <input type="hidden" name="bodyId" value={body.id} />
                    <input type="hidden" name="customerId" value={customer.id} />
                    <ConfirmSubmitButton
                      label="Delete body"
                      confirmMessage="Delete this body of water?"
                      className="rounded bg-rose-700 px-3 py-1.5 text-sm font-medium text-white"
                    />
                  </form>
                </div>
              ))}

              <form action={createBodyOfWater} className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
                <input type="hidden" name="propertyId" value={property.id} />
                <input type="hidden" name="returnPath" value={`/dashboard/customers/${customer.id}?tab=bodies`} />
                <p className="text-sm font-medium text-slate-900">Add body of water</p>
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
            </div>
          ))}
        </section>
      ) : null}

      {tab === "equipment" ? (
        <section className="mt-6 space-y-4">
          {customer.properties.map((property) => (
            <div key={property.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">{property.name}</h3>
              {property.bodiesOfWater.map((body) => (
                <div key={body.id} className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">{body.name}</p>
                  {body.equipment.length ? (
                    <ul className="mt-2 space-y-1 text-sm text-slate-700">
                      {body.equipment.map((eq) => (
                        <li key={eq.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
                          <span>
                            {eq.kind}
                            {eq.make ? ` • ${eq.make}` : ""}
                            {eq.model ? ` ${eq.model}` : ""}
                            {eq.serialNumber ? ` • SN ${eq.serialNumber}` : ""}
                          </span>
                          <form action={deleteEquipment}>
                            <input type="hidden" name="customerId" value={customer.id} />
                            <input type="hidden" name="equipmentId" value={eq.id} />
                            <ConfirmSubmitButton
                              label="Delete"
                              confirmMessage="Delete this equipment item?"
                              className="rounded bg-rose-700 px-2 py-1 text-xs font-medium text-white"
                            />
                          </form>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No equipment yet.</p>
                  )}

                  <form action={createEquipment} className="mt-3 rounded border border-slate-200 bg-white p-2">
                    <input type="hidden" name="customerId" value={customer.id} />
                    <input type="hidden" name="bodyId" value={body.id} />
                    <div className="grid gap-2 md:grid-cols-4">
                      <select name="kind" className="rounded border border-slate-300 px-2 py-1.5 text-sm">
                        {Object.values(EquipmentKind).map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                      <input name="make" placeholder="Make" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                      <input name="model" placeholder="Model" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                      <input name="serialNumber" placeholder="Serial #" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                    </div>
                    <button className="mt-2 rounded bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white" type="submit">
                      Add equipment
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ))}
        </section>
      ) : null}

      {tab === "history" ? (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Recent completed visits</h2>
          {completedVisits.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm text-slate-700">
                <thead>
                  <tr className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                    <th className="border border-slate-300 px-2 py-2">Date</th>
                    <th className="border border-slate-300 px-2 py-2">Property</th>
                    <th className="border border-slate-300 px-2 py-2">Body</th>
                    <th className="border border-slate-300 px-2 py-2">Tech</th>
                    <th className="border border-slate-300 px-2 py-2">pH</th>
                    <th className="border border-slate-300 px-2 py-2">FC</th>
                    <th className="border border-slate-300 px-2 py-2">Alk</th>
                  </tr>
                </thead>
                <tbody>
                  {completedVisits.map((v) => (
                    <tr key={v.id} className="odd:bg-white even:bg-slate-50">
                      <td className="border border-slate-300 px-2 py-2">{v.completedAt ? v.completedAt.toLocaleString() : "—"}</td>
                      <td className="border border-slate-300 px-2 py-2">{v.property.name}</td>
                      <td className="border border-slate-300 px-2 py-2">{v.bodyOfWater.name}</td>
                      <td className="border border-slate-300 px-2 py-2">{v.technician?.name ?? "—"}</td>
                      <td className="border border-slate-300 px-2 py-2">{v.reading?.ph?.toString() ?? "—"}</td>
                      <td className="border border-slate-300 px-2 py-2">{v.reading?.freeChlorinePpm?.toString() ?? "—"}</td>
                      <td className="border border-slate-300 px-2 py-2">{v.reading?.alkalinityPpm?.toString() ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No completed visits yet.</p>
          )}
        </section>
      ) : null}
    </main>
  );
}
