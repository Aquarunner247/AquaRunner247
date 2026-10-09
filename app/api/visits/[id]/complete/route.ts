import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { applyServiceMessagePlaceholders } from "@/lib/default-service-messages";
import { sendBundledServiceSummary } from "@/lib/service-summary-email";
import { getOrganizationRuleset, cyaTestFrequencyDays, activeReadingFields } from "@/lib/compliance";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // The form now posts which service message the technician picked. Tolerates an absent or
  // unparseable body so an older client (a tab open across a deploy) still gets a clear
  // MISSING_SERVICE_MESSAGE rather than a 500.
  let serviceMessageTemplateId: string | null = null;
  /** Set by the form's second attempt, after the technician was told a photo is expected and chose
   *  to finish without one. See the photo gate below. */
  let acknowledgedNoPhoto = false;
  /** The technician ticked "I did not add chemicals at today's service call". See the chemicals
   *  gate below. */
  let acknowledgedNoChemicals = false;
  try {
    const body = (await request.json()) as {
      serviceMessageTemplateId?: unknown;
      acknowledgedNoPhoto?: unknown;
      acknowledgedNoChemicals?: unknown;
    };
    if (typeof body?.serviceMessageTemplateId === "string") serviceMessageTemplateId = body.serviceMessageTemplateId.trim() || null;
    acknowledgedNoPhoto = body?.acknowledgedNoPhoto === true;
    acknowledgedNoChemicals = body?.acknowledgedNoChemicals === true;
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

  /**
   * A photo per body of water is expected, and asked for firmly -- but it does NOT block, because
   * the photo is for the customer, not for compliance.
   *
   * It used to block, and that had the coupling backwards: no photo meant the visit could not reach
   * COMPLETED, and getMonthlyReadingRows only counts COMPLETED visits, so a customer-facing nicety
   * silently kept genuinely compliance-relevant chemistry out of the public log and left a blank row
   * for that day. It also stranded the visit IN_PROGRESS, which (since a summary covers a whole
   * walk-up) held the customer's email for the pool as well.
   *
   * The readings gate above is the one that really is compliance-derived -- activeReadingFields comes
   * from the state's ComplianceRuleset -- and that still blocks.
   *
   * So this answers MISSING_REQUIRED_PHOTO once, which the form turns into a prompt, and lets the
   * second attempt through when the technician has explicitly chosen to finish without one. An older
   * client that doesn't know to acknowledge still gets the prompt rather than silently completing.
   * Who skipped it stays visible without a new column: COMPLETED with zero photos is exactly that.
   */
  if (visit.photos.length < 1 && !acknowledgedNoPhoto) {
    return NextResponse.json({ error: "MISSING_REQUIRED_PHOTO" }, { status: 400 });
  }

  /**
   * Either a dose was logged, or the technician says plainly that none was added.
   *
   * "No doses recorded" used to be ambiguous in exactly the way that matters in a dispute: it read
   * the same whether nothing was needed, or something was poured and never logged. This makes the
   * technician answer the question before the stop can close.
   *
   * Unlike the photo above this does not relent on a second attempt -- the checkbox IS the second
   * option, so there is nothing to fall back to. It is one tick, always available, and never a
   * reason a technician cannot close out on a jobsite.
   *
   * No column for the acknowledgement on purpose, same reasoning as the photo: COMPLETED with zero
   * doses already is the record. (Worth revisiting if the attestation itself ever has to be
   * produced as evidence -- then it needs its own timestamped field, not an inference.)
   */
  if (visit.doses.length === 0 && !acknowledgedNoChemicals) {
    return NextResponse.json({ error: "MISSING_CHEMICALS_CONFIRMATION" }, { status: 400 });
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

  // Best-effort: send the customer's service summary. Never blocks or fails visit completion.
  //
  // One email per WALK-UP, not per body of water: a bundled pool and spa are one occasion from the
  // customer's side, so this sends nothing while a sibling body is still outstanding and sends the
  // pair once the last one finishes. lib/service-summary-email.ts owns that, including the claim
  // that stops two simultaneous completions both sending.
  // waitingOn names any body of water on this same walk-up still needing work, which is also what
  // is holding the customer's summary back. Returned so the technician hears it while still on site.
  let waitingOn: { visitId: string; bodyName: string }[] = [];
  try {
    const summary = await sendBundledServiceSummary(visit.id);
    waitingOn = summary.waitingOn;
  } catch {
    // Non-critical -- visit is already marked complete regardless of email outcome.
  }

  return NextResponse.json({ ok: true, visit: completed, waitingOn });
}
