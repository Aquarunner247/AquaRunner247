import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BodyOfWaterType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { generateQrDataUrl, publicBodyOfWaterUrl } from "@/lib/qr";
import { createBodyOfWater } from "../actions";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import {
  deleteCustomer,
  updateCustomer,
  updateProperty,
  uploadCustomerDocument,
  deleteCustomerDocument,
  createCustomerLogin,
  deleteCustomerLogin,
  sendCustomerAlert,
} from "./actions";
import { CUSTOMER_DOCUMENTS_BUCKET } from "@/lib/customer-documents";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string; edit?: string; error?: string }>;
};

export default async function CustomerDetailPage({ params, searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const tab = ["overview", "bodies", "history"].includes(sp.tab ?? "") ? (sp.tab as "overview" | "bodies" | "history") : "overview";
  const editTarget = sp.edit ?? "";
  const isEditingCustomer = editTarget === "customer";
  const isEditingProperty = (propertyId: string) => editTarget === `property:${propertyId}`;

  const customer = await prisma.customer.findFirst({
    where: { id, organizationId: appUser.organizationId },
    include: {
      properties: {
        orderBy: { createdAt: "desc" },
        include: {
          managementCompany: { select: { id: true, name: true } },
          bodiesOfWater: { orderBy: { createdAt: "desc" }, include: { equipment: { orderBy: { createdAt: "desc" } } } },
        },
      },
    },
  });

  if (!customer) notFound();

  const documents = await prisma.customerDocument.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
  });
  const documentsWithUrls = await (async () => {
    if (!documents.length) return [];
    const supabaseAdmin = createSupabaseAdminClient();
    return Promise.all(
      documents.map(async (doc) => {
        const { data } = await supabaseAdmin.storage
          .from(CUSTOMER_DOCUMENTS_BUCKET)
          .createSignedUrl(doc.storagePath, 3600);
        return { ...doc, url: data?.signedUrl ?? null };
      }),
    );
  })();

  const customerUsers = await prisma.customerUser.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
  });

  const alerts = await prisma.customerAlert.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, subject: true, message: true, createdAt: true },
  });

  const managementCompanies = await prisma.managementCompany.findMany({
    where: { organizationId: appUser.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const qrByBodyId = new Map<string, { dataUrl: string; publicUrl: string }>();
  for (const property of customer.properties) {
    for (const body of property.bodiesOfWater) {
      const publicUrl = publicBodyOfWaterUrl(body.publicSlug);
      const dataUrl = await generateQrDataUrl(publicUrl);
      qrByBodyId.set(body.id, { dataUrl, publicUrl });
    }
  }

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
      reading: { select: { ph: true, freeChlorinePpm: true, alkalinityPpm: true, backwashAt: true } },
      doses: { select: { productName: true, quantity: true, unit: true } },
      _count: { select: { photos: true } },
      checklistCompletions: {
        where: { completed: true },
        select: { label: true },
      },
    },
  });

  const tabLinkClass = (target: string) =>
    tab === target
      ? "rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white"
      : "rounded px-3 py-1.5 text-sm font-medium text-[#12234A] hover:bg-[#EAF6FA]";

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-5">
        <div>
          <p className="text-sm font-medium text-[#12234A]">Admin / Customer</p>
          <h1 className="text-2xl font-semibold text-slate-900">{customer.name}</h1>
          <p className="mt-1 text-sm text-slate-600">Edit customer and property details. Add bodies of water here.</p>
        </div>
        <Link href="/dashboard/customers" className="text-sm text-[#0A5FA4] underline">
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
        <Link href={`/dashboard/customers/${customer.id}?tab=history`} className={tabLinkClass("history")}>
          Service History
        </Link>
      </section>

      {tab === "overview" ? (
        <>
          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Customer info</h2>
              {!isEditingCustomer ? (
                <Link
                  href={`/dashboard/customers/${customer.id}?tab=overview&edit=customer`}
                  className="rounded bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
                >
                  Edit
                </Link>
              ) : null}
            </div>

            {!isEditingCustomer ? (
              <div className="mt-3 space-y-1 text-sm text-slate-700">
                <p className="text-base font-medium text-slate-900">{customer.name}</p>
                {customer.notes ? <p className="whitespace-pre-wrap text-slate-600">{customer.notes}</p> : null}
              </div>
            ) : (
              <>
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
                  <div className="flex items-center gap-2">
                    <button className="rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
                      Save customer
                    </button>
                    <Link
                      href={`/dashboard/customers/${customer.id}?tab=overview`}
                      className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
                    >
                      Cancel
                    </Link>
                  </div>
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
              </>
            )}
          </section>

          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Documents</h2>
            <p className="mt-1 text-sm text-slate-500">Inspection reports, contracts, and other files for this customer.</p>

            {documentsWithUrls.length ? (
              <ul className="mt-3 space-y-1 text-sm text-slate-700">
                {documentsWithUrls.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5"
                  >
                    <span>
                      {doc.url ? (
                        <a href={doc.url} target="_blank" rel="noreferrer" className="font-medium text-[#0A5FA4] underline">
                          {doc.label}
                        </a>
                      ) : (
                        <span className="font-medium text-slate-900">{doc.label}</span>
                      )}
                      <span className="ml-2 text-xs text-slate-500">{doc.createdAt.toLocaleDateString()}</span>
                    </span>
                    <form action={deleteCustomerDocument}>
                      <input type="hidden" name="customerId" value={customer.id} />
                      <input type="hidden" name="documentId" value={doc.id} />
                      <ConfirmSubmitButton
                        label="🗑"
                        confirmMessage={`Delete "${doc.label}"?`}
                        className="rounded px-2 py-1 text-base hover:bg-slate-200"
                      />
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No documents uploaded yet.</p>
            )}

            <form
              action={uploadCustomerDocument}
              className="mt-3 flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-slate-50 p-2"
            >
              <input type="hidden" name="customerId" value={customer.id} />
              <input
                name="label"
                placeholder="Label (e.g. 2026 Inspection Report)"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
              <input type="file" name="file" required className="text-sm" />
              <button className="rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
                Upload
              </button>
            </form>
          </section>

          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Portal access</h2>
            <p className="mt-1 text-sm text-slate-500">
              Let this customer sign in at their own portal to see scheduled visits, reports, and documents.
            </p>

            {customerUsers.length ? (
              <ul className="mt-3 space-y-1 text-sm text-slate-700">
                {customerUsers.map((cu) => (
                  <li
                    key={cu.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5"
                  >
                    <span>
                      <span className="font-medium text-slate-900">{cu.name ?? cu.email}</span>
                      <span className="ml-2 text-slate-500">{cu.email}</span>
                    </span>
                    <form action={deleteCustomerLogin}>
                      <input type="hidden" name="customerId" value={customer.id} />
                      <input type="hidden" name="customerUserId" value={cu.id} />
                      <ConfirmSubmitButton
                        label="🗑"
                        confirmMessage={`Remove portal access for ${cu.name ?? cu.email}?`}
                        className="rounded px-2 py-1 text-base hover:bg-slate-200"
                      />
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">No portal login yet.</p>
            )}

            <form action={createCustomerLogin} className="mt-3 rounded border border-slate-200 bg-slate-50 p-2">
              <input type="hidden" name="customerId" value={customer.id} />
              {sp.error === "email-in-use" ? (
                <p className="mb-2 text-sm text-red-600">That email already belongs to a different account.</p>
              ) : null}
              <div className="grid gap-2 md:grid-cols-2">
                <input name="name" required placeholder="Contact name" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                <input name="email" type="email" required placeholder="Email" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                <input
                  name="password"
                  type="text"
                  required
                  minLength={8}
                  placeholder="Temporary password (min 8 characters)"
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm md:col-span-2"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Share this password with the customer directly — they can sign in at{" "}
                <code className="rounded bg-slate-200 px-1">/portal/login</code>.
              </p>
              <button className="mt-2 rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
                Add portal login
              </button>
            </form>
          </section>

          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Send alert</h2>
            <p className="mt-1 text-sm text-slate-500">
              Sends an update to this customer&rsquo;s portal and, if they have portal logins, by email.
            </p>

            <form action={sendCustomerAlert} className="mt-3 rounded border border-slate-200 bg-slate-50 p-2">
              <input type="hidden" name="customerId" value={customer.id} />
              <div className="grid gap-2">
                <input name="subject" required placeholder="Subject" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
                <textarea
                  name="message"
                  required
                  rows={3}
                  placeholder="Message"
                  className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <button className="mt-2 rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
                Send alert
              </button>
            </form>

            {alerts.length ? (
              <ul className="mt-3 space-y-1 text-sm text-slate-700">
                {alerts.map((a) => (
                  <li key={a.id} className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">{a.subject}</span>
                      <span className="text-xs text-slate-500">{a.createdAt.toLocaleString()}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{a.message}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No alerts sent yet.</p>
            )}
          </section>

          <section className="mt-6 space-y-3">
            {customer.properties.map((property) => (
              <div key={property.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">Property</h3>
                  {!isEditingProperty(property.id) ? (
                    <Link
                      href={`/dashboard/customers/${customer.id}?tab=overview&edit=property:${property.id}`}
                      className="rounded bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
                    >
                      Edit
                    </Link>
                  ) : null}
                </div>

                {!isEditingProperty(property.id) ? (
                  <div className="mt-3 space-y-1 text-sm text-slate-700">
                    <p className="text-base font-medium text-slate-900">{property.name}</p>
                    {property.managementCompany ? <p>PMC: {property.managementCompany.name}</p> : null}
                    {property.managerName ? <p>Manager: {property.managerName}</p> : null}
                    {property.managerBusinessPhone ? <p>Business phone: {property.managerBusinessPhone}</p> : null}
                    {property.managerMobilePhone ? <p>Mobile phone: {property.managerMobilePhone}</p> : null}
                    {property.managerEmail ? <p>Email: {property.managerEmail}</p> : null}
                    {property.addressLine1 || property.city || property.region || property.postalCode ? (
                      <p className="text-slate-600">
                        {property.addressLine1 ?? ""}
                        {property.addressLine2 ? `, ${property.addressLine2}` : ""}
                        {property.city ? `, ${property.city}` : ""}
                        {property.region ? `, ${property.region}` : ""}
                        {property.postalCode ? ` ${property.postalCode}` : ""}
                      </p>
                    ) : null}
                  </div>
                ) : (
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
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <select
                      name="managementCompanyId"
                      defaultValue={property.managementCompany?.id ?? ""}
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                    >
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
                  <div className="flex items-center gap-2">
                    <button className="rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
                      Save property
                    </button>
                    <Link
                      href={`/dashboard/customers/${customer.id}?tab=overview`}
                      className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
                    >
                      Cancel
                    </Link>
                  </div>
                </form>
                )}
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
                <Link
                  key={body.id}
                  href={`/dashboard/customers/${customer.id}/bodies/${body.id}`}
                  className="mt-3 flex items-center gap-3 rounded border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100"
                >
                  {qrByBodyId.has(body.id) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qrByBodyId.get(body.id)!.dataUrl}
                      alt={`QR code for ${body.name}`}
                      className="h-14 w-14 shrink-0 rounded border border-slate-200 bg-white"
                    />
                  ) : null}
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{body.name}</p>
                    <p className="text-xs text-slate-500">{body.type} · View details, equipment &amp; QR code</p>
                  </div>
                </Link>
              ))}


              <form action={createBodyOfWater} className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
                <input type="hidden" name="propertyId" value={property.id} />
                <input type="hidden" name="returnPath" value={`/dashboard/customers/${customer.id}?tab=bodies`} />
                <p className="text-sm font-medium text-slate-900">Add body of water</p>
                <div className="mt-2 grid gap-2 md:grid-cols-4">
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
                    placeholder="Total gallons"
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    name="maximumOccupancy"
                    type="number"
                    step="1"
                    placeholder="Max occupancy"
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <button className="mt-2 rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
                  Add body
                </button>
              </form>
            </div>
          ))}
        </section>
      ) : null}

      {tab === "history" ? (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Recent completed visits</h2>
          {completedVisits.length ? (
            <div className="mt-3 space-y-3">
              {completedVisits.map((v) => (
                <div key={v.id} className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-900">
                      {v.property.name} — {v.bodyOfWater.name}
                    </p>
                    <p className="text-xs text-slate-500">{v.completedAt ? v.completedAt.toLocaleString() : "—"}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">Tech: {v.technician?.name ?? "—"}</p>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-slate-700">
                    <span>pH: {v.reading?.ph?.toString() ?? "—"}</span>
                    <span>FC: {v.reading?.freeChlorinePpm?.toString() ?? "—"} ppm</span>
                    <span>Alk: {v.reading?.alkalinityPpm?.toString() ?? "—"} ppm</span>
                    <span>
                      Backwash:{" "}
                      {v.reading?.backwashAt
                        ? `Yes (${new Date(v.reading.backwashAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })})`
                        : "No"}
                    </span>
                    <span>Photos: {v._count.photos}</span>
                  </div>

                  <div className="mt-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chemicals dosed</p>
                    {v.doses.length ? (
                      <ul className="mt-0.5 text-slate-700">
                        {v.doses.map((d, i) => (
                          <li key={i}>
                            {d.productName}: {d.quantity.toString()} {d.unit}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-500">None logged</p>
                    )}
                  </div>

                  {v.checklistCompletions.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checklist completed</p>
                      <p className="text-slate-700">
                        {v.checklistCompletions.map((c) => c.label).join(", ")}
                      </p>
                    </div>
                  ) : null}

                  {v.techNotes ? (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tech notes</p>
                      <p className="whitespace-pre-wrap text-slate-700">{v.techNotes}</p>
                    </div>
                  ) : null}

                  <Link href={`/dashboard/visits/${v.id}`} className="mt-2 inline-block text-xs font-medium text-[#0A5FA4] underline">
                    View full visit
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No completed visits yet.</p>
          )}
        </section>
      ) : null}
    </main>
  );
}
