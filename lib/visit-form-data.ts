/**
 * Everything a visit form needs, assembled once.
 *
 * Phase 1b of NATIVE-REBUILD-PLAN.md, rebuilt. The first cut of GET /api/visits/[id] returned
 * raw Prisma rows and left the caller to derive the rest, which meant the derivation existed
 * twice -- once here in app/dashboard/visits/[id]/page.tsx and once in whatever consumed the
 * API. Two copies that have to agree about which chemistry fields a state requires is precisely
 * the drift this module exists to prevent, and it is not a hypothetical: `readingFields` comes
 * out of the compliance ruleset, so a disagreement shows up as a technician being asked for the
 * wrong readings.
 *
 * So the server page and the API both come through here, and the shape returned is THE PROPS THE
 * FORMS ALREADY TAKE -- not rows. VisitForm takes 18 props and ResidentialVisitForm 21,
 * overlapping heavily; `form` below is the superset, and each caller spreads the ones its form
 * declares. That is deliberate: the two forms disagreeing about `cyaRequired` or `previousReading`
 * would be a bug, and the only way to guarantee they cannot is for neither to compute it.
 *
 * Returns a discriminated result rather than throwing or calling notFound(), because the two
 * callers answer failure differently: a page redirects or renders not-found, an API route returns
 * a status code. Authorization itself is decided here so it cannot be decided twice.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { serializeReading } from "@/lib/serialize-reading";
import { activeReadingFields, cyaTestFrequencyDays, getOrganizationRuleset } from "@/lib/compliance";
import { getSavedDosingRecommendation } from "@/lib/dosing-calculator";
import { applyServiceMessagePlaceholders } from "@/lib/default-service-messages";
import { describeRecency, readingProvenance, readingTakenAt } from "@/lib/last-reading";
import { timeZoneForState } from "@/lib/timezone";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { VISIT_PHOTOS_BUCKET } from "@/lib/visit-photos";

// Re-exported so the one import site in app/dashboard/visits/[id]/page.tsx keeps working; the
// function itself lives in a Prisma-free module so it can be tested.
export { serializeReading };


/** Residential renders a fixed set; commercial renders whatever the state's ruleset derived. */
const RESIDENTIAL_READING_KEYS = ["freeChlorinePpm", "ph", "alkalinityPpm", "cyanuricAcidPpm", "temperatureF"] as const;

export type VisitFormCaller = { id: string; role: string; organizationId: string };

export type VisitFormDataResult =
  | { ok: false; reason: "NOT_FOUND" | "FORBIDDEN" }
  | { ok: true; data: Awaited<ReturnType<typeof assemble>> };

/** The exact row shape VISIT_INCLUDE produces, from Prisma's own payload helper. */
type VisitWithIncludes = Prisma.ServiceVisitGetPayload<{ include: typeof VISIT_INCLUDE }>;

/**
 * `include` kept identical to what the page used, so adopting this function changed no field it
 * renders. The API sends a trimmed projection of it rather than the whole thing -- see the route.
 */
const VISIT_INCLUDE = {
  organization: { select: { state: true, name: true, trackCalciumHardness: true, trackSaltPpm: true } },
  property: {
    select: {
      id: true,
      name: true,
      propertyType: true,
      customerId: true,
      managerEmail: true,
      ownerEmail: true,
      addressLine1: true,
      city: true,
      region: true,
      latitude: true,
      longitude: true,
      geofenceMeters: true,
      // Residential access details -- the gate code belongs with the person at the gate.
      accessNotes: true,
      ownerName: true,
      ownerMobilePhone: true,
    },
  },
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
      requiresComplianceReadings: true,
      volumeGallons: true,
      latitude: true,
      longitude: true,
    },
  },
  reading: true,
  doses: { orderBy: { createdAt: "desc" } },
  photos: { orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true, takenAt: true, storagePath: true } },
  checklistCompletions: { select: { checklistItemId: true, completed: true } },
  issues: { orderBy: { createdAt: "desc" }, select: { id: true, description: true, severity: true, createdAt: true } },
} as const;

export async function getVisitFormData(args: {
  visitId: string;
  caller: VisitFormCaller;
}): Promise<VisitFormDataResult> {
  const visit = await prisma.serviceVisit.findUnique({
    where: { id: args.visitId },
    include: VISIT_INCLUDE,
  });

  // Org mismatch is NOT_FOUND rather than FORBIDDEN on purpose: another company's visit id must
  // not be confirmable as real by the shape of the refusal.
  if (!visit || visit.organizationId !== args.caller.organizationId) return { ok: false, reason: "NOT_FOUND" };

  const isAdminOrOffice = args.caller.role === "ADMIN" || args.caller.role === "OFFICE";
  // `isAdminOrOffice || own visit` -- the same pairing the page uses, and the reason a
  // technician-only native app was rejected: an ADMIN can be assigned stops and work them, so
  // authority here is about the row, not the role.
  if (!isAdminOrOffice && visit.technicianId !== args.caller.id) return { ok: false, reason: "FORBIDDEN" };

  return { ok: true, data: await assemble(visit, args.caller, isAdminOrOffice) };
}

async function assemble(visit: VisitWithIncludes, caller: VisitFormCaller, isAdminOrOffice: boolean) {
  const timeZone = timeZoneForState(visit.organization.state);
  const isResidential = visit.property.propertyType === "RESIDENTIAL";

  // Cyanuric acid only needs checking once every N days per body of water (state-configurable via
  // ComplianceRuleset, 30 days by default) -- skip requiring it again if a recent reading covers
  // this period. Shared by both forms, which is exactly why it cannot live in either.
  const ruleset = await getOrganizationRuleset(visit.organizationId);
  const cyaWindowStart = new Date();
  cyaWindowStart.setDate(cyaWindowStart.getDate() - cyaTestFrequencyDays(ruleset));
  const recentCya = await prisma.visitWaterReading.findFirst({
    where: {
      visit: { bodyOfWaterId: visit.bodyOfWaterId, id: { not: visit.id }, completedAt: { gte: cyaWindowStart } },
      cyanuricAcidPpm: { not: null },
    },
    select: { id: true },
  });
  const cyaRequired = !recentCya;

  // requiresComplianceReadings false means this client's own staff handles chemistry and gauges --
  // an empty array is what makes the form show only the checklist.
  const readingFields = visit.bodyOfWater.requiresComplianceReadings
    ? activeReadingFields(ruleset, visit.bodyOfWater.type, visit.bodyOfWater.disinfectionMethod, cyaRequired)
    : [];

  const relevantReadingKeys: readonly string[] = isResidential
    ? RESIDENTIAL_READING_KEYS
    : readingFields.map((field) => field.key);

  const [previousReadingRow, checklistItemDefs, chemicalProducts, serviceMessageTemplates, dosing] = await Promise.all([
    /**
     * The last reading anyone recorded for this body of water, for the technician to compare
     * today's numbers against.
     *
     * Scoped to the BODY, not the property: a gym pool and a clubhouse pool are different water,
     * and a property-wide stop (bodyOfWaterId null) compares only against other property-wide
     * stops for the same reason. Imported logbook rows and portal-logged readings both count --
     * they are real readings and are what makes this useful on a body serviced before the app
     * existed. Ordered by scheduledStart because it is the one timestamp every row has.
     */
    relevantReadingKeys.length === 0
      ? Promise.resolve(null)
      : prisma.visitWaterReading.findFirst({
          where: {
            visit: {
              id: { not: visit.id },
              propertyId: visit.propertyId,
              bodyOfWaterId: visit.bodyOfWaterId,
              scheduledStart: { lte: visit.scheduledStart },
            },
            // Skip rows holding nothing FOR THE FIELDS THIS FORM SHOWS. A VisitWaterReading is
            // created alongside its visit and stays all-null until someone types a number, so the
            // most recent row is routinely empty -- and a row can carry only a field this form
            // never displays. Both were real on production on 2026-10-15.
            OR: relevantReadingKeys.map((field) => ({ [field]: { not: null } })),
          },
          orderBy: [{ visit: { scheduledStart: "desc" } }, { createdAt: "desc" }],
          include: {
            visit: {
              select: {
                scheduledStart: true,
                completedAt: true,
                logOnlyRecord: true,
                loggedByCustomerUserId: true,
                technician: { select: { name: true } },
              },
            },
          },
        }),
    prisma.checklistItemDefinition.findMany({
      where: {
        organizationId: caller.organizationId,
        active: true,
        scope: isResidential ? "RESIDENTIAL" : "COMMERCIAL",
        // Opt-out per customer -- an item applies unless this customer has excluded it. A null
        // customerId excludes nothing.
        customerExclusions: visit.property.customerId ? { none: { customerId: visit.property.customerId } } : undefined,
      },
      orderBy: { sortOrder: "asc" },
      select: { id: true, label: true, category: true, required: true, billable: true, chargeAmount: true },
    }),
    prisma.chemicalProduct.findMany({
      where: { organizationId: caller.organizationId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true },
    }),
    prisma.serviceMessageTemplate.findMany({
      where: { organizationId: caller.organizationId, active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, label: true, body: true },
    }),
    getSavedDosingRecommendation(visit.id),
  ]);

  const previousReading = previousReadingRow
    ? (() => {
        const { at, hasTimeOfDay } = readingTakenAt({
          capturedAt: previousReadingRow.capturedAt,
          completedAt: previousReadingRow.visit.completedAt,
          scheduledStart: previousReadingRow.visit.scheduledStart,
        });
        const recency = describeRecency(at, hasTimeOfDay, new Date(), timeZone);
        return {
          values: serializeReading(previousReadingRow),
          relative: recency.relative,
          absolute: recency.absolute,
          daysAgo: recency.daysAgo,
          provenance: readingProvenance(previousReadingRow.visit),
          technicianName: previousReadingRow.visit.technician?.name ?? null,
        };
      })()
    : null;

  const completionById = new Map(visit.checklistCompletions.map((c) => [c.checklistItemId, c.completed]));

  const supabaseAdmin = createSupabaseAdminClient();
  const initialPhotos = await Promise.all(
    visit.photos.map(async (p) => {
      const { data } = await supabaseAdmin.storage.from(VISIT_PHOTOS_BUCKET).createSignedUrl(p.storagePath, 3600);
      return { id: p.id, url: data?.signedUrl ?? null, takenAt: p.takenAt ? p.takenAt.toISOString() : null };
    }),
  );

  return {
    visit,
    isResidential,
    timeZone,
    ruleset,
    /**
     * The superset of both forms' props. Each caller spreads what its own form declares --
     * `readingFields`/`optionalReadingFields` for commercial, the `requires*` set plus
     * `cyaRequired` for residential, and everything else shared.
     */
    form: {
      visitId: visit.id,
      visitStatus: visit.status,
      // Lets the office correct a dose after the fact. Everything else on a completed visit stays
      // read-only for everyone.
      canCorrectCompleted: isAdminOrOffice,
      hasVolume: visit.bodyOfWater.volumeGallons != null,
      readingFields,
      optionalReadingFields: [
        ...(visit.organization.trackCalciumHardness ? ["calciumHardnessPpm" as const] : []),
        ...(visit.organization.trackSaltPpm ? ["saltPpm" as const] : []),
      ],
      requiresFC: visit.bodyOfWater.requiresFC,
      requiresPH: visit.bodyOfWater.requiresPH,
      requiresAlkalinity: visit.bodyOfWater.requiresAlkalinity,
      requiresCYA: visit.bodyOfWater.requiresCYA,
      cyaRequired,
      previousReading,
      chemicalProducts,
      checklistItems: checklistItemDefs.map((item) => ({
        id: item.id,
        label: item.label,
        completed: completionById.get(item.id) ?? false,
        category: item.category,
        required: item.required,
        billable: item.billable,
        // Decimal does not survive the server/client boundary -- a number, or null when no price
        // has been set yet.
        chargeAmount: item.chargeAmount != null ? Number(item.chargeAmount) : null,
      })),
      initialIssues: visit.issues.map((i) => ({
        id: i.id,
        description: i.description,
        severity: i.severity,
        createdAt: i.createdAt.toISOString(),
      })),
      initialReading: serializeReading(visit.reading),
      initialPhotoCount: visit.photos.length,
      initialPhotos,
      initialDoses: visit.doses.map((d) => ({
        id: d.id,
        productName: d.productName,
        quantity: d.quantity.toString(),
        unit: d.unit,
      })),
      initialStartedAt: visit.startedAt ? visit.startedAt.toISOString() : null,
      initialPushedAt: visit.pushedAt ? visit.pushedAt.toISOString() : null,
      initialDosing: dosing,
      serviceMessages: serviceMessageTemplates.map((msg) => ({
        ...msg,
        // Interpolated here rather than in the form: a technician choosing between messages has to
        // read what the customer will actually receive, and a literal "{{orgName}}" is
        // indistinguishable from a message that would send broken. The form still posts the
        // template id and the completion API re-interpolates, so this is display-only.
        body: applyServiceMessagePlaceholders(msg.body, { orgName: visit.organization.name }),
      })),
    },
  };
}
