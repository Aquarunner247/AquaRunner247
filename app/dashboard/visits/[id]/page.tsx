import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { VISIT_PHOTOS_BUCKET } from "@/lib/visit-photos";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { VisitForm } from "./visit-form";
import { ResidentialVisitForm } from "./residential-visit-form";
import { getOrganizationRuleset, cyaTestFrequencyDays, activeReadingFields } from "@/lib/compliance";
import { getSavedDosingRecommendation } from "@/lib/dosing-calculator";
import type { VisitWaterReading } from "@/generated/prisma/client";
import { timeZoneForState, formatLocalDate } from "@/lib/timezone";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ from?: string }>;
};

/**
 * VisitWaterReading straight off Prisma carries Decimal instances (ph, freeChlorinePpm,
 * etc.) and Date instances (backwashAt, capturedAt, createdAt, updatedAt) -- neither is a
 * plain object, so passing the row as-is into a "use client" component (VisitForm /
 * ResidentialVisitForm below) throws "Only plain objects can be passed to Client
 * Components from Server Components" from React's RSC serializer on every visit that has
 * a reading. Both consuming forms already just coerce every field through String(v)
 * (see their own toInput/toTimeInput helpers), so numbers/ISO-strings serialize
 * identically to what they were already doing via Decimal/Date's own toString() -- this
 * only removes the class-instance violation, it doesn't change any consumed value.
 */
function serializeReading(reading: VisitWaterReading | null) {
  if (!reading) return null;
  return {
    ph: reading.ph != null ? Number(reading.ph) : null,
    freeChlorinePpm: reading.freeChlorinePpm != null ? Number(reading.freeChlorinePpm) : null,
    totalChlorinePpm: reading.totalChlorinePpm != null ? Number(reading.totalChlorinePpm) : null,
    brominePpm: reading.brominePpm != null ? Number(reading.brominePpm) : null,
    alkalinityPpm: reading.alkalinityPpm != null ? Number(reading.alkalinityPpm) : null,
    cyanuricAcidPpm: reading.cyanuricAcidPpm != null ? Number(reading.cyanuricAcidPpm) : null,
    temperatureF: reading.temperatureF != null ? Number(reading.temperatureF) : null,
    filterPressurePsi: reading.filterPressurePsi != null ? Number(reading.filterPressurePsi) : null,
    vacGaugeReading: reading.vacGaugeReading != null ? Number(reading.vacGaugeReading) : null,
    pumpPressurePsi: reading.pumpPressurePsi != null ? Number(reading.pumpPressurePsi) : null,
    filterGaugeReading: reading.filterGaugeReading != null ? Number(reading.filterGaugeReading) : null,
    flowMeterGpm: reading.flowMeterGpm != null ? Number(reading.flowMeterGpm) : null,
    backwashAt: reading.backwashAt ? reading.backwashAt.toISOString() : null,
  };
}

export default async function VisitPage({ params, searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    redirect("/login");
  }

  const { id } = await params;
  const sp = (await searchParams) ?? {};
  // Every link into this page from the Schedule tab (RouteDayView, both admin and
  // technician) appends ?from=schedule -- anything else (alerts, customer detail, etc.)
  // falls back to the Dashboard tab, which was this link's only destination before.
  const backHref = sp.from === "schedule" ? "/dashboard/schedule" : "/dashboard";
  const backLabel = sp.from === "schedule" ? "Back to schedule" : "Back to dashboard";
  const visit = await prisma.serviceVisit.findUnique({
    where: { id },
    include: {
      organization: { select: { state: true } },
      property: { select: { name: true, propertyType: true, customerId: true } },
      bodyOfWater: {
        select: {
          id: true,
          name: true,
          type: true,
          disinfectionMethod: true,
          requiresFC: true,
          requiresPH: true,
          requiresAlkalinity: true,
          requiresCYA: true,
          volumeGallons: true,
        },
      },
      reading: true,
      doses: { orderBy: { createdAt: "desc" } },
      photos: { orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true, takenAt: true, storagePath: true } },
      checklistCompletions: { select: { checklistItemId: true, completed: true } },
      issues: { orderBy: { createdAt: "desc" }, select: { id: true, description: true, severity: true, createdAt: true } },
    },
  });

  if (!visit || visit.organizationId !== appUser.organizationId) notFound();

  const canAccess = appUser.role === "ADMIN" || appUser.role === "OFFICE" || visit.technicianId === appUser.id;
  if (!canAccess) notFound();

  // Cyanuric acid only needs checking once every N days per body of water (state-
  // configurable via ComplianceRuleset, 30 days by default) — skip requiring it again if a
  // recent reading already covers this period.
  const ruleset = await getOrganizationRuleset(visit.organizationId);
  const cyaWindowStart = new Date();
  cyaWindowStart.setDate(cyaWindowStart.getDate() - cyaTestFrequencyDays(ruleset));
  const recentCya = await prisma.visitWaterReading.findFirst({
    where: {
      visit: {
        bodyOfWaterId: visit.bodyOfWaterId,
        id: { not: visit.id },
        completedAt: { gte: cyaWindowStart },
      },
      cyanuricAcidPpm: { not: null },
    },
    select: { id: true },
  });
  const cyaRequired = !recentCya;

  // Which chemistry fields this commercial visit's log sheet shows/requires, derived
  // entirely from the org's own linked state and this body of water's own disinfection
  // method -- see activeReadingFields's doc comment. Not used by the residential form,
  // which keeps its own simpler per-body requiresFC/PH/Alkalinity/CYA toggle system.
  const readingFields = activeReadingFields(ruleset, visit.bodyOfWater.type, visit.bodyOfWater.disinfectionMethod, cyaRequired);

  const chemicalProducts = await prisma.chemicalProduct.findMany({
    where: { organizationId: appUser.organizationId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true },
  });

  const dosing = await getSavedDosingRecommendation(visit.id);

  const isResidential = visit.property.propertyType === "RESIDENTIAL";

  const checklistItemDefs = isResidential
    ? []
    : await prisma.checklistItemDefinition.findMany({
        where: {
          organizationId: appUser.organizationId,
          active: true,
          // Opt-out per customer -- an item applies unless this customer has excluded it.
          // property.customerId can be null (no customer linked), in which case nothing
          // is ever excluded and every active item still shows, matching prior behavior.
          customerExclusions: visit.property.customerId ? { none: { customerId: visit.property.customerId } } : undefined,
        },
        orderBy: { sortOrder: "asc" },
        select: { id: true, label: true },
      });
  const completionById = new Map(visit.checklistCompletions.map((c) => [c.checklistItemId, c.completed]));
  const checklistItems = checklistItemDefs.map((item) => ({
    id: item.id,
    label: item.label,
    completed: completionById.get(item.id) ?? false,
  }));

  const supabaseAdmin = createSupabaseAdminClient();
  const photosWithUrls = await Promise.all(
    visit.photos.map(async (p) => {
      const { data } = await supabaseAdmin.storage.from(VISIT_PHOTOS_BUCKET).createSignedUrl(p.storagePath, 3600);
      return { id: p.id, url: data?.signedUrl ?? null, takenAt: p.takenAt ? p.takenAt.toISOString() : null };
    }),
  );

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <div className="mb-6">
        <Link href={backHref} className="text-sm text-brand-primary underline">
          {backLabel}
        </Link>
      </div>
      <header className="rounded-lg border border-brand-ink bg-brand-ink p-4 shadow-sm">
        <p className="font-[family-name:var(--font-mono)] text-xs font-semibold uppercase tracking-wide text-brand-accent">
          Technician visit
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold uppercase text-white">{visit.property.name}</h1>
        {/* scheduledStart's time-of-day isn't a real target time -- see
            lib/visit-generation.ts -- so only the date is shown here. */}
        <p className="mt-1 text-sm text-brand-border">
          {visit.bodyOfWater.name} • {formatLocalDate(visit.scheduledStart, timeZoneForState(visit.organization.state), { weekday: "long", year: "numeric" })}
        </p>
      </header>

      {isResidential ? (
        <ResidentialVisitForm
          visitId={visit.id}
          visitStatus={visit.status}
          hasVolume={visit.bodyOfWater.volumeGallons != null}
          requiresFC={visit.bodyOfWater.requiresFC}
          requiresPH={visit.bodyOfWater.requiresPH}
          requiresAlkalinity={visit.bodyOfWater.requiresAlkalinity}
          requiresCYA={visit.bodyOfWater.requiresCYA}
          cyaRequired={cyaRequired}
          chemicalProducts={chemicalProducts}
          initialIssues={visit.issues.map((i) => ({
            id: i.id,
            description: i.description,
            severity: i.severity,
            createdAt: i.createdAt.toISOString(),
          }))}
          initialReading={serializeReading(visit.reading)}
          initialPhotoCount={visit.photos.length}
          initialPhotos={photosWithUrls}
          initialDoses={visit.doses.map((d) => ({
            id: d.id,
            productName: d.productName,
            quantity: d.quantity.toString(),
            unit: d.unit,
          }))}
          initialStartedAt={visit.startedAt ? visit.startedAt.toISOString() : null}
          initialDosing={dosing}
        />
      ) : (
        <VisitForm
          visitId={visit.id}
          visitStatus={visit.status}
          hasVolume={visit.bodyOfWater.volumeGallons != null}
          readingFields={readingFields}
          chemicalProducts={chemicalProducts}
          checklistItems={checklistItems}
          initialIssues={visit.issues.map((i) => ({
            id: i.id,
            description: i.description,
            severity: i.severity,
            createdAt: i.createdAt.toISOString(),
          }))}
          initialReading={serializeReading(visit.reading)}
          initialPhotoCount={visit.photos.length}
          initialPhotos={photosWithUrls}
          initialDoses={visit.doses.map((d) => ({
            id: d.id,
            productName: d.productName,
            quantity: d.quantity.toString(),
            unit: d.unit,
          }))}
          initialStartedAt={visit.startedAt ? visit.startedAt.toISOString() : null}
          initialDosing={dosing}
        />
      )}
    </main>
  );
}
