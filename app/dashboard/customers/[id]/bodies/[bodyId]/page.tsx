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
import {
  updateBodyOfWater,
  deleteBodyOfWater,
  importVenueReadings,
  setBodyPayRate,
  updateBodyInspection,
  uploadInspectionReportAction,
  deleteInspectionReportAction,
} from "../../actions";
import { FilterTypeFields } from "@/app/components/filter-type-fields";
import { VolumeCalculator } from "@/app/components/volume-calculator";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { INSPECTION_REPORTS_BUCKET } from "@/lib/inspection-reports";
import { InspectionReportReview } from "./inspection-report-review";

type PageProps = {
  params: Promise<{ id: string; bodyId: string }>;
  searchParams?: Promise<{ imported?: string; importError?: string; importedMonths?: string }>;
};

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

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
      property: {
        select: { id: true, name: true, propertyType: true, customer: { select: { id: true, name: true, relationshipEndedAt: true } } },
      },
      equipment: { orderBy: { createdAt: "desc" } },
      volumeCalculation: true,
      inspectionReports: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!body) notFound();

  // Once the customer relationship has ended, this whole page becomes view-only -- every
  // add/edit/delete form below is hidden (server actions are independently guarded too,
  // see customers/[id]/actions.ts). Navigation in/out of this page stays unaffected.
  const isEnded = Boolean(body.property.customer?.relationshipEndedAt);

  const inspectionReportsWithUrls = await (async () => {
    if (!body.inspectionReports.length) return [];
    const supabaseAdmin = createSupabaseAdminClient();
    return Promise.all(
      body.inspectionReports.map(async (report) => {
        const { data } = await supabaseAdmin.storage.from(INSPECTION_REPORTS_BUCKET).createSignedUrl(report.storagePath, 3600);
        return { ...report, url: data?.signedUrl ?? null };
      }),
    );
  })();

  // Pay rate -- tech-earnings-tracker-spec.md Section 4's inline entry point. The route
  // assignment (if any) is shown for context since a rate is meaningless without knowing
  // which technician actually services this venue; technicians list is the full org
  // roster, not just the routed one, so an admin can still set a rate ahead of routing.
  const [routedStop, technicians, payRates] = await Promise.all([
    prisma.recurringStop.findFirst({
      where: { bodyOfWaterId: body.id, route: { active: true } },
      select: { route: { select: { name: true, technicianId: true, technician: { select: { name: true, email: true } } } } },
    }),
    prisma.user.findMany({
      where: { organizationId: appUser.organizationId, role: "TECHNICIAN" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    prisma.technicianPayRate.findMany({
      where: { bodyOfWaterId: body.id, isActive: true },
      orderBy: { effectiveDate: "desc" },
      include: { technician: { select: { name: true, email: true } } },
    }),
  ]);

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
        {isEnded ? (
          <p className="mt-1 text-sm text-brand-muted">This relationship has ended — details are read-only.</p>
        ) : null}
        <form action={updateBodyOfWater} className="mt-3 space-y-2">
          <input type="hidden" name="bodyId" value={body.id} />
          <input type="hidden" name="customerId" value={customerId} />
          <div className="grid gap-2 md:grid-cols-4">
            <input
              name="name"
              defaultValue={body.name}
              required
              disabled={isEnded}
              className="rounded border border-brand-control px-2 py-1.5 text-sm disabled:bg-brand-surface disabled:text-brand-muted"
            />
            <select
              name="type"
              defaultValue={body.type}
              disabled={isEnded}
              className="rounded border border-brand-control px-2 py-1.5 text-sm disabled:bg-brand-surface disabled:text-brand-muted"
            >
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
              disabled={isEnded}
              className="rounded border border-brand-control px-2 py-1.5 text-sm disabled:bg-brand-surface disabled:text-brand-muted"
            />
            <input
              name="maximumOccupancy"
              type="number"
              step="1"
              defaultValue={body.maximumOccupancy?.toString() ?? ""}
              placeholder="Max occupancy"
              disabled={isEnded}
              className="rounded border border-brand-control px-2 py-1.5 text-sm disabled:bg-brand-surface disabled:text-brand-muted"
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
                disabled={isEnded}
                className="mt-1 w-full rounded border border-brand-control px-2 py-1.5 text-sm md:w-56 disabled:bg-brand-surface disabled:text-brand-muted"
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
          {!isEnded ? (
            <button className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white" type="submit">
              Save
            </button>
          ) : null}
        </form>

        <div className="mt-3">
          {isEnded ? (
            <p className="text-sm text-brand-muted">
              Volume calculator is read-only now that this relationship has ended.
              {body.volumeCalculation ? ` Last calculated: ${Number(body.volumeCalculation.calculatedGallons).toLocaleString()} gallons.` : ""}
            </p>
          ) : (
            <VolumeCalculator
              bodyId={body.id}
              customerId={customerId}
              defaults={
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
                      shallowSectionLengthFt:
                        body.volumeCalculation.shallowSectionLengthFt != null ? Number(body.volumeCalculation.shallowSectionLengthFt) : null,
                      shallowSectionWidthFt:
                        body.volumeCalculation.shallowSectionWidthFt != null ? Number(body.volumeCalculation.shallowSectionWidthFt) : null,
                      shallowSectionDepthFt:
                        body.volumeCalculation.shallowSectionDepthFt != null ? Number(body.volumeCalculation.shallowSectionDepthFt) : null,
                      deepSectionLengthFt:
                        body.volumeCalculation.deepSectionLengthFt != null ? Number(body.volumeCalculation.deepSectionLengthFt) : null,
                      deepSectionWidthFt:
                        body.volumeCalculation.deepSectionWidthFt != null ? Number(body.volumeCalculation.deepSectionWidthFt) : null,
                      deepSectionDepthFt:
                        body.volumeCalculation.deepSectionDepthFt != null ? Number(body.volumeCalculation.deepSectionDepthFt) : null,
                    }
                  : null
              }
            />
          )}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-brand-ink">Pay rate</h2>
        <p className="mt-1 text-sm text-brand-muted">
          {routedStop?.route.technician ? (
            <>
              On route <span className="font-medium text-brand-ink">{routedStop.route.name}</span>, assigned to{" "}
              <span className="font-medium text-brand-ink">{routedStop.route.technician.name ?? routedStop.route.technician.email}</span>.
            </>
          ) : (
            "Not currently on an active route with a technician assigned."
          )}{" "}
          Full history and bundled-rate setup live on the{" "}
          <Link href="/dashboard/settings/pay-rates" className="app-link">
            Pay rates
          </Link>{" "}
          settings page.
        </p>

        {payRates.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm text-brand-ink">
            {payRates.map((r) => (
              <li key={r.id}>
                {r.technician.name ?? r.technician.email}: {fmtMoney(Number(r.rateAmount))}
                {r.isBundled ? " (bundled)" : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-brand-control">No pay rate set for this venue yet.</p>
        )}

        {!isEnded ? (
          <form action={setBodyPayRate} className="app-card-inset mt-4">
            <input type="hidden" name="bodyId" value={body.id} />
            <input type="hidden" name="customerId" value={customerId} />
            <p className="text-sm font-medium text-brand-ink">Add a rate</p>
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
              <select name="technicianId" required defaultValue={routedStop?.route.technicianId ?? ""} className="rounded border border-brand-control px-2 py-1.5 text-sm">
                <option value="">Technician…</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name ?? t.email}
                  </option>
                ))}
              </select>
              <input name="rateAmount" type="number" step="0.01" required placeholder="Rate ($)" className="rounded border border-brand-control px-2 py-1.5 text-sm" />
              <label className="flex items-center gap-1 text-xs text-brand-ink">
                <input type="checkbox" name="isBundled" />
                Bundled ($0, folded into another body)
              </label>
            </div>
            <button className="mt-2 rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white" type="submit">
              Add rate
            </button>
          </form>
        ) : null}
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
                readOnly={isEnded}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-brand-muted">No equipment yet.</p>
        )}

        {!isEnded ? <EquipmentForm customerId={customerId} bodyId={body.id} isSpa={body.type === "SPA"} /> : null}
      </section>

      <section id="inspections" className="mt-6 scroll-mt-6 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-brand-ink">Inspections</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Optional — the current inspector&rsquo;s contact info, the last inspection date, and any inspection reports
          for this specific venue.
        </p>

        {!isEnded ? (
          <form action={updateBodyInspection} className="mt-3 space-y-2">
            <input type="hidden" name="bodyId" value={body.id} />
            <input type="hidden" name="customerId" value={customerId} />
            <div className="grid gap-2 md:grid-cols-2">
              <input
                name="inspectorName"
                defaultValue={body.inspectorName ?? ""}
                placeholder="Inspector name"
                className="rounded border border-brand-control px-2 py-1.5 text-sm"
              />
              <input
                name="inspectorPhone"
                defaultValue={body.inspectorPhone ?? ""}
                placeholder="Inspector phone"
                className="rounded border border-brand-control px-2 py-1.5 text-sm"
              />
              <input
                name="inspectorEmail"
                type="email"
                defaultValue={body.inspectorEmail ?? ""}
                placeholder="Inspector email"
                className="rounded border border-brand-control px-2 py-1.5 text-sm"
              />
              <label className="flex flex-col gap-1 text-xs text-brand-muted">
                Last inspection date
                <input
                  name="lastInspectionDate"
                  type="date"
                  defaultValue={body.lastInspectionDate ? body.lastInspectionDate.toISOString().slice(0, 10) : ""}
                  className="rounded border border-brand-control px-2 py-1.5 text-sm text-brand-ink"
                />
              </label>
            </div>
            <button className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white" type="submit">
              Save
            </button>
          </form>
        ) : (
          <div className="mt-3 space-y-1 text-sm text-brand-ink">
            {body.inspectorName ? <p>Inspector: {body.inspectorName}</p> : null}
            {body.inspectorPhone ? <p>Phone: {body.inspectorPhone}</p> : null}
            {body.inspectorEmail ? <p>Email: {body.inspectorEmail}</p> : null}
            {body.lastInspectionDate ? <p>Last inspection: {body.lastInspectionDate.toLocaleDateString()}</p> : null}
          </div>
        )}

        <div className="mt-4 border-t border-brand-border pt-3">
          <p className="text-sm font-medium text-brand-ink">Inspection reports</p>
          {inspectionReportsWithUrls.length ? (
            <ul className="mt-2 space-y-1 text-sm text-brand-ink">
              {inspectionReportsWithUrls.map((report) => (
                <li
                  key={report.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-brand-border bg-brand-surface px-2 py-1.5"
                >
                  <span>
                    {report.url ? (
                      <a href={report.url} target="_blank" rel="noreferrer" className="font-medium text-brand-primary underline">
                        {report.label}
                      </a>
                    ) : (
                      <span className="font-medium text-brand-ink">{report.label}</span>
                    )}
                    <span className="ml-2 text-xs text-brand-muted">{report.createdAt.toLocaleDateString()}</span>
                  </span>
                  {isEnded ? (
                    <button type="button" disabled aria-disabled="true" className="cursor-not-allowed rounded px-2 py-1 text-base text-brand-muted opacity-50">
                      🗑
                    </button>
                  ) : (
                    <form action={deleteInspectionReportAction}>
                      <input type="hidden" name="bodyId" value={body.id} />
                      <input type="hidden" name="customerId" value={customerId} />
                      <input type="hidden" name="reportId" value={report.id} />
                      <ConfirmSubmitButton
                        label="🗑"
                        confirmMessage={`Delete "${report.label}"?`}
                        className="rounded px-2 py-1 text-base hover:bg-brand-border"
                      />
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-brand-muted">No inspection reports uploaded yet.</p>
          )}

          {!isEnded ? (
            <>
              <form
                action={uploadInspectionReportAction}
                className="mt-3 flex flex-wrap items-end gap-2 rounded border border-brand-border bg-brand-surface p-2"
              >
                <input type="hidden" name="bodyId" value={body.id} />
                <input type="hidden" name="customerId" value={customerId} />
                <input
                  name="label"
                  placeholder="Label (e.g. 2026 Annual Inspection)"
                  className="rounded border border-brand-control px-2 py-1.5 text-sm"
                />
                <input type="file" name="file" required className="text-sm" />
                <button className="rounded bg-brand-primary px-3 py-1.5 text-sm font-medium text-white" type="submit">
                  Upload
                </button>
              </form>

              <InspectionReportReview
                customerId={customerId}
                bodyId={body.id}
                reports={inspectionReportsWithUrls.map((r) => ({ id: r.id, label: r.label }))}
                existingEquipment={body.equipment.map((eq) => ({
                  id: eq.id,
                  kind: eq.kind,
                  make: eq.make,
                  model: eq.model,
                  serialNumber: eq.serialNumber,
                }))}
                currentInspectorName={body.inspectorName}
                currentLastInspectionDate={body.lastInspectionDate ? body.lastInspectionDate.toISOString().slice(0, 10) : null}
                currentVolumeGallons={body.volumeGallons != null ? Number(body.volumeGallons) : null}
                currentMaximumOccupancy={body.maximumOccupancy}
              />
            </>
          ) : null}
        </div>
      </section>

      {!isEnded ? (
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
      ) : null}

      <section className="mt-6 rounded-lg border border-brand-danger/30 bg-white p-4 shadow-sm">
        {isEnded ? (
          <>
            <button type="button" disabled aria-disabled="true" className="cursor-not-allowed rounded bg-brand-danger px-3 py-1.5 text-sm font-medium text-white opacity-50">
              Delete aquatic venue
            </button>
            <p className="mt-1 text-xs text-brand-muted">This relationship has ended — this venue can&rsquo;t be deleted from here anymore.</p>
          </>
        ) : (
          <form action={deleteBodyOfWater}>
            <input type="hidden" name="bodyId" value={body.id} />
            <input type="hidden" name="customerId" value={customerId} />
            <ConfirmSubmitButton
              label="Delete aquatic venue"
              confirmMessage="This permanently deletes this aquatic venue and all its visit history, readings, and photos — this cannot be undone. Export your data first (Billing page) if you want a copy."
              className="rounded bg-brand-danger px-3 py-1.5 text-sm font-medium text-white"
            />
          </form>
        )}
      </section>

      <div className="mt-6">
        <Link href={`/dashboard/customers/${customerId}?tab=bodies`} className="text-sm text-brand-primary underline">
          ← Back to {body.property.customer?.name ?? body.property.name}
        </Link>
      </div>
    </main>
  );
}
