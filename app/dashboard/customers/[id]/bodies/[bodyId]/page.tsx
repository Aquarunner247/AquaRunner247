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
import { updateBodyOfWater, deleteBodyOfWater, importVenueReadings, saveVolumeCalculation } from "../../actions";
import { FilterTypeFields } from "@/app/components/filter-type-fields";
import { VolumeCalculator } from "@/app/components/volume-calculator";

type PageProps = {
  params: Promise<{ id: string; bodyId: string }>;
  searchParams?: Promise<{ imported?: string; importError?: string; importedMonths?: string }>;
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
      volumeCalculation: true,
    },
  });

  if (!body) notFound();

  const isResidential = body.property.propertyType === "RESIDENTIAL";
  const publicUrl = isResidential ? null : publicBodyOfWaterUrl(body.publicSlug);
  const dataUrl = publicUrl ? await generateQrDataUrl(publicUrl) : null;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <div className="text-sm text-brand-muted">
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

      <header className="mt-2 border-b border-brand-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">{body.property.name}</p>
        <h1 className="text-2xl font-semibold text-brand-ink">{body.name}</h1>
      </header>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        {isResidential || !dataUrl || !publicUrl ? (
          <p className="text-sm text-brand-muted">
            No public QR log for residential venues — the inspector log is a commercial-only feature.
          </p>
        ) : (
          <BodyQrCode bodyName={body.name} dataUrl={dataUrl} publicUrl={publicUrl} />
        )}
      </section>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-brand-ink">Details</h2>
        <form action={updateBodyOfWater} className="mt-3 space-y-2">
          <input type="hidden" name="bodyId" value={body.id} />
          <input type="hidden" name="customerId" value={customerId} />
          <div className="grid gap-2 md:grid-cols-4">
            <input
              name="name"
              defaultValue={body.name}
              required
              className="rounded border border-brand-control px-2 py-1.5 text-sm"
            />
            <select name="type" defaultValue={body.type} className="rounded border border-brand-control px-2 py-1.5 text-sm">
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
              className="rounded border border-brand-control px-2 py-1.5 text-sm"
            />
            <input
              name="maximumOccupancy"
              type="number"
              step="1"
              defaultValue={body.maximumOccupancy?.toString() ?? ""}
              placeholder="Max occupancy"
              className="rounded border border-brand-control px-2 py-1.5 text-sm"
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
          ) : (
            <label className="block text-sm">
              <span className="text-brand-ink">Disinfectant</span>
              <select
                name="disinfectionMethod"
                defaultValue={body.disinfectionMethod}
                className="mt-1 w-full rounded border border-brand-control px-2 py-1.5 text-sm md:w-56"
              >
                <option value="CHLORINE">Chlorine</option>
                <option value="BROMINE">Bromine</option>
              </select>
              <span className="mt-1 block text-xs text-brand-muted">
                Determines which reading (Free Chlorine or Bromine) the visit log sheet asks for. If your state
                doesn&rsquo;t have a Bromine rule on file, choosing it here will show no chlorine-family field at
                all — switch back to Chlorine.
              </span>
            </label>
          )}
          <button className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white" type="submit">
            Save
          </button>
        </form>

        <div className="mt-3">
          <VolumeCalculator
            action={saveVolumeCalculation}
            bodyId={body.id}
            customerId={customerId}
            initial={
              body.volumeCalculation
                ? {
                    shape: body.volumeCalculation.shape,
                    lengthFt: body.volumeCalculation.lengthFt != null ? Number(body.volumeCalculation.lengthFt) : null,
                    widthFt: body.volumeCalculation.widthFt != null ? Number(body.volumeCalculation.widthFt) : null,
                    radiusFt: body.volumeCalculation.radiusFt != null ? Number(body.volumeCalculation.radiusFt) : null,
                    shallowDepthFt: body.volumeCalculation.shallowDepthFt != null ? Number(body.volumeCalculation.shallowDepthFt) : null,
                    deepDepthFt: body.volumeCalculation.deepDepthFt != null ? Number(body.volumeCalculation.deepDepthFt) : null,
                    freeformMeasurementA:
                      body.volumeCalculation.freeformMeasurementA != null ? Number(body.volumeCalculation.freeformMeasurementA) : null,
                    freeformMeasurementB:
                      body.volumeCalculation.freeformMeasurementB != null ? Number(body.volumeCalculation.freeformMeasurementB) : null,
                  }
                : null
            }
          />
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-brand-ink">Equipment</h2>
        {body.equipment.length ? (
          <ul className="mt-2 space-y-1 text-sm text-brand-ink">
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
          <p className="mt-2 text-sm text-brand-muted">No equipment yet.</p>
        )}

        <EquipmentForm customerId={customerId} bodyId={body.id} isSpa={body.type === "SPA"} />
      </section>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-brand-ink">Import historical readings</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Upload a spreadsheet shaped like the downloadable QR-log CSV (one row per day, same columns) to backfill
          readings from before this app was in use. If a row&apos;s day cell is a full date rather than a bare day
          number, its own month/year is used, so a file spanning several months is filed under the right month
          automatically — the Month/Year below are only a fallback for rows that just give a day number. Existing
          days are updated, not duplicated.
        </p>

        {sp.imported ? (
          <div className="mt-2 text-sm font-medium text-brand-ok">
            <p>Imported {sp.imported} day(s) of readings.</p>
            {sp.importedMonths ? (
              <p className="mt-0.5 font-normal text-brand-ok">Detected multiple months — {sp.importedMonths}.</p>
            ) : null}
          </div>
        ) : null}
        {sp.importError ? <p className="mt-2 text-sm text-brand-danger">{sp.importError}</p> : null}

        <form action={importVenueReadings} className="mt-3 flex flex-wrap items-end gap-2 rounded border border-brand-border bg-brand-surface p-2">
          <input type="hidden" name="bodyId" value={body.id} />
          <input type="hidden" name="customerId" value={customerId} />
          <label className="flex flex-col gap-1 text-xs text-brand-muted">
            Month
            <select name="month" defaultValue={now.getMonth() + 1} className="rounded border border-brand-control px-2 py-1.5 text-sm">
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-brand-muted">
            Year
            <select name="year" defaultValue={now.getFullYear()} className="rounded border border-brand-control px-2 py-1.5 text-sm">
              {Array.from({ length: 10 }, (_, i) => now.getFullYear() - 8 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-brand-muted">
            File (.csv)
            <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
          </label>
          <button className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white" type="submit">
            Import
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-lg border border-brand-danger/30 bg-white p-4 shadow-sm">
        <form action={deleteBodyOfWater}>
          <input type="hidden" name="bodyId" value={body.id} />
          <input type="hidden" name="customerId" value={customerId} />
          <ConfirmSubmitButton
            label="Delete aquatic venue"
            confirmMessage="Delete this aquatic venue and all its equipment/history?"
            className="rounded bg-brand-danger px-3 py-1.5 text-sm font-medium text-white"
          />
        </form>
      </section>

      <div className="mt-6">
        <Link href={`/dashboard/customers/${customerId}?tab=bodies`} className="text-sm text-brand-primary underline">
          ← Back to {body.property.customer?.name ?? body.property.name}
        </Link>
      </div>
    </main>
  );
}
