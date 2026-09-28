import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { sendServiceSummaryEmail } from "@/lib/email";
import { hasWhiteLabelBranding } from "@/lib/plan-tiers";
import { applyServiceMessagePlaceholders } from "@/lib/default-service-messages";
import { propertyContactEmail } from "@/lib/property-contact";
import { getOrganizationRuleset, cyaTestFrequencyDays, activeReadingFields } from "@/lib/compliance";
import { timeZoneForState } from "@/lib/timezone";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { VISIT_PHOTOS_BUCKET } from "@/lib/visit-photos";

// Long enough that the link in the email is still good whenever the recipient actually
// opens it (people don't always open a service email the minute it lands) -- much longer
// than the 1-hour signed URL the portal page uses, which regenerates on every load instead
// of needing to survive unopened in an inbox.
const PHOTO_EMAIL_LINK_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // The form now posts which service message the technician picked. Tolerates an absent or
  // unparseable body so an older client (a tab open across a deploy) still gets a clear
  // MISSING_SERVICE_MESSAGE rather than a 500.
  let serviceMessageTemplateId: string | null = null;
  try {
    const body = (await request.json()) as { serviceMessageTemplateId?: unknown };
    if (typeof body?.serviceMessageTemplateId === "string") serviceMessageTemplateId = body.serviceMessageTemplateId.trim() || null;
  } catch {
    serviceMessageTemplateId = null;
  }

  const { id } = await context.params;
  const visit = await prisma.serviceVisit.findUnique({
    where: { id },
    include: {
      reading: true,
      photos: { select: { id: true, storagePath: true } },
      organization: {
        select: {
          state: true,
          serviceSummaryCcEmail: true,
          welcomeEmailSupportEmail: true,
          // Branding for the summary email. This is a CUSTOMER-facing email, so it should
          // carry the pool company's identity, not the platform's.
          name: true,
          planStatus: true,
          planTier: true,
          brandingLogoUrl: true,
          brandingPrimaryColor: true,
          brandingHeaderColor: true,
        },
      },
      property: {
        select: {
          name: true,
          // Both contact sets: a residential property uses ownerEmail, a commercial one
          // managerEmail (see propertyContactEmail). Reading only managerEmail meant residential
          // customers silently received no summary at all.
          managerEmail: true,
          ownerEmail: true,
          propertyType: true,
          addressLine1: true,
          city: true,
          region: true,
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
        },
      },
      technician: { select: { name: true, email: true } },
      doses: { select: { productName: true, quantity: true, unit: true } },
      checklistCompletions: { where: { completed: true }, select: { label: true } },
    },
  });
  if (!visit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const canEdit =
    appUser.organizationId === visit.organizationId &&
    (appUser.role === "ADMIN" || appUser.role === "OFFICE" || visit.technicianId === appUser.id);
  if (!canEdit) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (visit.status === "COMPLETED") {
    return NextResponse.json({ ok: true, alreadyCompleted: true });
  }

  // Cyanuric acid only needs checking once every N days per body of water (state-
  // configurable via ComplianceRuleset, 30 days by default).
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

  const isResidential = visit.property.propertyType === "RESIDENTIAL";

  const requiredReadings = isResidential
    ? [
        ...(visit.bodyOfWater.requiresFC ? [visit.reading?.freeChlorinePpm] : []),
        ...(visit.bodyOfWater.requiresPH ? [visit.reading?.ph] : []),
        ...(visit.bodyOfWater.requiresAlkalinity ? [visit.reading?.alkalinityPpm] : []),
        ...(visit.bodyOfWater.requiresCYA && cyaRequired ? [visit.reading?.cyanuricAcidPpm] : []),
      ]
    : !visit.bodyOfWater.requiresComplianceReadings
      ? // This client's own staff handles chemistry/gauges -- nothing to require here,
        // matching the empty readingFields the visit form itself showed (see the
        // dashboard/visits/[id] page's own requiresComplianceReadings check).
        []
      : // Chemistry AND gauge/meter fields are both state-driven -- must match exactly what
        // the visit form itself showed as required (see activeReadingFields), or completion
        // could block on a field the technician was never shown, or silently accept a visit
        // missing a reading this state actually requires.
        activeReadingFields(ruleset, visit.bodyOfWater.type, visit.bodyOfWater.disinfectionMethod, cyaRequired)
          .filter((f) => f.required)
          .map((f) => visit.reading?.[f.key]);
  const missingReadings = requiredReadings.some((v) => v == null);
  if (missingReadings) {
    return NextResponse.json({ error: "MISSING_REQUIRED_READINGS" }, { status: 400 });
  }

  // Rule selected: at least one photo per body of water. This visit targets one body.
  if (visit.photos.length < 1) {
    return NextResponse.json({ error: "MISSING_REQUIRED_PHOTO" }, { status: 400 });
  }

  // A service message is required ONLY when the org actually has some configured. A seeding gap
  // or a deactivated-everything state must never leave a technician unable to close out a stop
  // on a jobsite -- that failure lands on the person least able to fix it.
  const availableMessages = await prisma.serviceMessageTemplate.findMany({
    where: { organizationId: visit.organizationId, active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, body: true },
  });

  let serviceMessage: string | null = null;
  if (availableMessages.length > 0) {
    const chosen = serviceMessageTemplateId ? availableMessages.find((m) => m.id === serviceMessageTemplateId) : null;
    if (!chosen) {
      return NextResponse.json({ error: "MISSING_SERVICE_MESSAGE" }, { status: 400 });
    }
    // Snapshot the interpolated text, not the template id: editing or deactivating the template
    // later must not rewrite what this customer was told.
    serviceMessage = applyServiceMessagePlaceholders(chosen.body, { orgName: visit.organization.name });
  }

  const completedAt = new Date();
  const completed = await prisma.serviceVisit.update({
    where: { id: visit.id },
    data: {
      serviceMessage,
      status: "COMPLETED",
      serviceComplete: true,
      completedAt,
      startedAt: visit.startedAt ?? completedAt,
    },
    select: {
      id: true,
      status: true,
      serviceComplete: true,
      completedAt: true,
    },
  });

  // Best-effort: send a service summary email to the property's contact on file.
  // Never blocks or fails visit completion if email sending has an issue.
  const contactEmail = propertyContactEmail(visit.property);
  if (contactEmail) {
    try {
      const supabaseAdmin = createSupabaseAdminClient();
      const signedPhotoUrls = await Promise.all(
        visit.photos.map(async (p) => {
          const { data } = await supabaseAdmin.storage.from(VISIT_PHOTOS_BUCKET).createSignedUrl(p.storagePath, PHOTO_EMAIL_LINK_TTL_SECONDS);
          return data?.signedUrl ?? null;
        }),
      );
      await sendServiceSummaryEmail({
        to: contactEmail,
        serviceMessage,
        // Same gate the portal layout and welcome email use: stored branding stops being
        // applied the moment an org is no longer on a tier that includes it, rather than
        // merely becoming uneditable. Null here yields the platform's own look.
        branding: hasWhiteLabelBranding(visit.organization)
          ? {
              orgName: visit.organization.name,
              logoUrl: visit.organization.brandingLogoUrl,
              primaryColor: visit.organization.brandingPrimaryColor,
              headerColor: visit.organization.brandingHeaderColor,
            }
          : null,
        propertyName: visit.property.name,
        bodyOfWaterName: visit.bodyOfWater.name,
        address: [visit.property.addressLine1, visit.property.city, visit.property.region].filter(Boolean).join(", ") || null,
        technicianName: visit.technician?.name ?? visit.technician?.email ?? null,
        // Pre-update value, not `completed`'s -- the completion update above backfills a
        // never-logged startedAt to completedAt so the DB row always has one, but the
        // email needs to know whether a real, distinct arrival was ever logged (see
        // startedAt's doc comment on ServiceSummaryEmailInput).
        startedAt: visit.startedAt,
        completedAt,
        timeZone: timeZoneForState(visit.organization.state),
        ccEmail: visit.organization.serviceSummaryCcEmail,
        replyTo: visit.organization.welcomeEmailSupportEmail,
        reading: visit.reading
          ? {
              ph: visit.reading.ph != null ? Number(visit.reading.ph) : null,
              freeChlorinePpm: visit.reading.freeChlorinePpm != null ? Number(visit.reading.freeChlorinePpm) : null,
              brominePpm: visit.reading.brominePpm != null ? Number(visit.reading.brominePpm) : null,
              alkalinityPpm: visit.reading.alkalinityPpm != null ? Number(visit.reading.alkalinityPpm) : null,
              cyanuricAcidPpm: visit.reading.cyanuricAcidPpm != null ? Number(visit.reading.cyanuricAcidPpm) : null,
              temperatureF: visit.reading.temperatureF != null ? Number(visit.reading.temperatureF) : null,
              backwashAt: visit.reading.backwashAt,
            }
          : null,
        usesBromine: visit.bodyOfWater.disinfectionMethod === "BROMINE",
        doses: visit.doses.map((d) => ({ productName: d.productName, quantity: Number(d.quantity), unit: d.unit })),
        checklistLabels: visit.checklistCompletions.map((c) => c.label).filter(Boolean),
        techNotes: visit.techNotes,
        photoUrls: signedPhotoUrls.filter((url): url is string => url != null),
      });
    } catch {
      // Non-critical — visit is already marked complete regardless of email outcome.
    }
  }

  return NextResponse.json({ ok: true, visit: completed });
}
