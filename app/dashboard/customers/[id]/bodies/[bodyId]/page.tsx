import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BodyOfWaterType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { generateQrDataUrl, publicBodyOfWaterUrl } from "@/lib/qr";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { BodyQrCode } from "@/app/components/body-qr-code";
import { EquipmentForm } from "./equipment-form";
import { EquipmentItem } from "./equipment-item";
import { updateBodyOfWater, deleteBodyOfWater, importVenueReadings } from "../../actions";
import { FilterTypeFields } from "@/app/components/filter-type-fields";

type PageProps = {
  params: Promise<{ id: string; bodyId: string }>;
  searchParams?: Promise<{ imported?: string; importError?: string }>;
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function BodyOfWaterDetailPage({ params, searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const { id: customerId, bodyId } = await params;
  const sp = (await searchParams) ?? {};
  const now = new Date();

  const body = await prisma.bodyOfWater.findFirst({
    where: {
      id: bodyId,
      property: { organizationId: appUser.organizationId, customerId },
    },
    include: {
      property: { select: { id: true, name: true, propertyType: true, customer: { select: { id: true, name: true } } } },
      equipment: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!body) notFound();

  const isResidential = body.property.propertyType === "RESIDENTIAL";
  const publicUrl = isResidential ? null : publicBodyOfWaterUrl(body.publicSlug);
  const dataUrl = publicUrl ? await generateQrDataUrl(publicUrl) : null;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <div className="text-sm text-slate-500">
        <Link href="/dashboard/customers" className="underline">
          Customers
        </Link>
        {" / "}
        <Link href={`/dashboard/customers/${customerId}`} className="underline">
          {body.property.customer?.name ?? body.property.name}
        </Link>
        {" / "}
        <span>{body.name}</span>
      </div>

      <header className="mt-2 border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#12234A]">{body.property.name}</p>
        <h1 className="text-2xl font-semibold text-slate-900">{body.name}</h1>
      </header>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {isResidential || !dataUrl || !publicUrl ? (
          <p className="text-sm text-slate-500">
            No public QR log for residential venues — the inspector log is a commercial-only feature.
          </p>
        ) : (
          <BodyQrCode bodyName={body.name} dataUrl={dataUrl} publicUrl={publicUrl} />
        )}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Details</h2>
        <form action={updateBodyOfWater} className="mt-3 space-y-2">
          <input type="hidden" name="bodyId" value={body.id} />
          <input type="hidden" name="customerId" value={customerId} />
          <div className="grid gap-2 md:grid-cols-4">
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
              placeholder="Total gallons"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
            <input
              name="maximumOccupancy"
              type="number"
              step="1"
              defaultValue={body.maximumOccupancy?.toString() ?? ""}
              placeholder="Max occupancy"
              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          {body.property.propertyType === "RESIDENTIAL" ? (
            <FilterTypeFields
              defaults={{
                filterType: body.filterType,
                cartridgeCleaningIncluded: body.cartridgeCleaningIncluded,
                cartridgeCleaningFrequencyPerMonth: body.cartridgeCleaningFrequencyPerMonth,
                requiresFC: body.requiresFC,
                requiresPH: body.requiresPH,
                requiresAlkalinity: body.requiresAlkalinity,
                requiresCYA: body.requiresCYA,
              }}
            />
          ) : null}
          <button className="rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
            Save
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Equipment</h2>
        {body.equipment.length ? (
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {body.equipment.map((eq) => (
              <EquipmentItem
                key={eq.id}
                customerId={customerId}
                equipment={{
                  ...eq,
                  horsepower: eq.horsepower?.toString() ?? null,
                  flowRateGpm: eq.flowRateGpm?.toString() ?? null,
                }}
                minFlowGpm={body.minimumRequiredFlowGpm?.toString() ?? null}
                maxFlowGpm={body.maximumFilterFlowGpm?.toString() ?? null}
                isSpa={body.type === "SPA"}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No equipment yet.</p>
        )}

        <EquipmentForm customerId={customerId} bodyId={body.id} isSpa={body.type === "SPA"} />
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Import historical readings</h2>
        <p className="mt-1 text-sm text-slate-500">
          Upload a spreadsheet shaped like the downloadable QR-log CSV (one row per day, same columns) to backfill
          readings from before this app was in use. Existing days in the same month are updated, not duplicated.
        </p>

        {sp.imported ? (
          <p className="mt-2 text-sm font-medium text-emerald-700">Imported {sp.imported} day(s) of readings.</p>
        ) : null}
        {sp.importError ? <p className="mt-2 text-sm text-red-600">{sp.importError}</p> : null}

        <form action={importVenueReadings} className="mt-3 flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-slate-50 p-2">
          <input type="hidden" name="bodyId" value={body.id} />
          <input type="hidden" name="customerId" value={customerId} />
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Month
            <select name="month" defaultValue={now.getMonth() + 1} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Year
            <select name="year" defaultValue={now.getFullYear()} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
              {Array.from({ length: 10 }, (_, i) => now.getFullYear() - 8 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            File (.csv)
            <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
          </label>
          <button className="rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
            Import
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-lg border border-rose-200 bg-white p-4 shadow-sm">
        <form action={deleteBodyOfWater}>
          <input type="hidden" name="bodyId" value={body.id} />
          <input type="hidden" name="customerId" value={customerId} />
          <ConfirmSubmitButton
            label="Delete aquatic venue"
            confirmMessage="Delete this aquatic venue and all its equipment/history?"
            className="rounded bg-rose-700 px-3 py-1.5 text-sm font-medium text-white"
          />
        </form>
      </section>

      <div className="mt-6">
        <Link href={`/dashboard/customers/${customerId}?tab=bodies`} className="text-sm text-[#0A5FA4] underline">
          ← Back to {body.property.customer?.name ?? body.property.name}
        </Link>
      </div>
    </main>
  );
}
