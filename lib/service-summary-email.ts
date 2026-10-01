import { prisma } from "@/lib/prisma";
import { sendServiceSummaryEmail, type ServiceSummaryBody } from "@/lib/email";
import { hasWhiteLabelBranding } from "@/lib/plan-tiers";
import { propertyContactEmail } from "@/lib/property-contact";
import { timeZoneForState, localDayBounds, ymdInTimeZone } from "@/lib/timezone";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { VISIT_PHOTOS_BUCKET } from "@/lib/visit-photos";
import { resolveSummaryBundle, type BundleCandidate } from "@/lib/service-summary-bundle";

// Long enough that the link in the email is still good whenever the recipient actually opens it
// (people don't always open a service email the minute it lands) -- much longer than the 1-hour
// signed URL the portal page uses, which regenerates on every load instead of needing to survive
// unopened in an inbox.
const PHOTO_EMAIL_LINK_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * How stale a visit's own service day can be and still be worth telling the customer about.
 *
 * Measured against the day the service was FOR, never when it was closed out. Those come apart
 * badly: a visit stranded IN_PROGRESS for weeks gets `completedAt = now` the moment anyone finishes
 * it, so a window measured on completion would happily email a customer a summary for a July visit
 * in October. There are 24 such visits in production, the oldest from 2026-07-14.
 *
 * A week covers a genuine next-day or Monday-morning tidy-up. Beyond that the customer has long
 * since moved on and a summary arriving out of nowhere reads as a mistake -- the reading still lands
 * in the compliance log either way, which is what actually matters for an old visit.
 */
const MAX_SERVICE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type SummarySendResult = {
  sent: boolean;
  reason: string;
  /**
   * Bodies of water at this property, on this walk-up, that still need finishing -- and are
   * therefore holding the customer's summary back. Empty whenever nothing is outstanding.
   *
   * Carries each one's visit id as well as its name so the technician can be sent straight there,
   * and is surfaced at completion so he finds out while still standing on site, rather than the
   * customer finding out by never receiving an email.
   */
  waitingOn: { visitId: string; bodyName: string }[];
};

/**
 * Sends the customer's service summary for the visit just completed -- as ONE email covering every
 * body of water serviced on that walk-up, rather than one per body.
 *
 * A pool and its spa are one occasion from the customer's side, so two emails for it read as a
 * mistake. Each body keeps its own ServiceVisit, reading, photo and completion, so the compliance
 * record is untouched; only the number of emails changes. lib/service-summary-bundle.ts owns what
 * counts as one visit, and it is the same rule the schedule uses to draw a bundled card.
 *
 * Waits for the last member. Completing the pool sends nothing while the spa is still outstanding;
 * completing the spa sends the pair. A member that gets skipped counts as finished, so a bundle
 * whose spa was skipped still sends once the pool is done and names the spa as not serviced -- the
 * customer is never left with silence.
 *
 * Best-effort by contract: a failure here never affects the visit, which is already complete.
 *
 * `force` is for the nightly sweep only (app/api/cron/send-pending-summaries). Without it, a body
 * left IN_PROGRESS holds the email indefinitely, because sending is triggered by a completion that
 * may never come; forcing reports what exists and names the unfinished body as not completed.
 */
export async function sendBundledServiceSummary(
  visitId: string,
  options: { force?: boolean } = {},
): Promise<SummarySendResult> {
  const visit = await prisma.serviceVisit.findUnique({
    where: { id: visitId },
    select: {
      id: true,
      propertyId: true,
      technicianId: true,
      logOnlyRecord: true,
      scheduledStart: true,
      organizationId: true,
      organization: {
        select: {
          state: true,
          name: true,
          planStatus: true,
          planTier: true,
          serviceSummaryCcEmail: true,
          welcomeEmailSupportEmail: true,
          brandingLogoUrl: true,
          brandingPrimaryColor: true,
          brandingHeaderColor: true,
        },
      },
      property: {
        select: {
          name: true,
          managerEmail: true,
          ownerEmail: true,
          propertyType: true,
          addressLine1: true,
          city: true,
          region: true,
        },
      },
      technician: { select: { name: true, email: true } },
    },
  });
  if (!visit) return { sent: false, reason: "visit-not-found", waitingOn: [] };

  // Nobody performed this visit -- it carries a reading into the compliance log and nothing else.
  // Also guarded at both call sites; repeated here so no future caller can email one by accident.
  if (visit.logOnlyRecord) return { sent: false, reason: "log-only-record", waitingOn: [] };

  const contactEmail = propertyContactEmail(visit.property);
  if (!contactEmail) return { sent: false, reason: "no-contact-email", waitingOn: [] };

  const timeZone = timeZoneForState(visit.organization.state);
  const ymd = ymdInTimeZone(visit.scheduledStart, timeZone);
  const { start: dayStart, end: dayEnd } = localDayBounds(ymd, timeZone);

  // Too old to be worth sending. Checked before anything is claimed or loaded, so a backfill of old
  // visits costs nothing and -- more importantly -- tells no customer about work they have long
  // since forgotten.
  if (Date.now() - dayStart.getTime() > MAX_SERVICE_AGE_MS) {
    return { sent: false, reason: "service-too-old", waitingOn: [] };
  }

  /** That property's visits for this technician on this local day, in route order -- the set the
   *  bundle rule is applied to. Ordered so groupNearbyStops sees them as one run. */
  const candidateWhere = {
    propertyId: visit.propertyId,
    technicianId: visit.technicianId,
    scheduledStart: { gte: dayStart, lt: dayEnd },
  };

  const candidates = await prisma.serviceVisit.findMany({
    // Log-only rows share a property and a day with real visits but are not part of the walk-up, so
    // they must neither join a bundle nor hold its email back.
    where: { ...candidateWhere, logOnlyRecord: false },
    orderBy: { routeSequence: "asc" },
    select: {
      id: true,
      status: true,
      summaryEmailSentAt: true,
      bodyOfWater: { select: { name: true, type: true, latitude: true, longitude: true } },
    },
  });

  const toCandidate = (c: (typeof candidates)[number]): BundleCandidate => ({
    visitId: c.id,
    bodyType: c.bodyOfWater?.type ?? null,
    latitude: c.bodyOfWater?.latitude != null ? Number(c.bodyOfWater.latitude) : null,
    longitude: c.bodyOfWater?.longitude != null ? Number(c.bodyOfWater.longitude) : null,
    status: c.status,
    summaryEmailSentAt: c.summaryEmailSentAt,
  });

  const decision = resolveSummaryBundle(visit.id, candidates.map(toCandidate), { force: options.force });

  // Named, not just counted: "Front Spa still needs finishing" is actionable where "1 stop" isn't.
  const outstandingNames = candidates
    .filter((c) => decision.memberIds.includes(c.id) && c.status !== "COMPLETED" && c.status !== "CANCELLED")
    .map((c) => ({ visitId: c.id, bodyName: c.bodyOfWater?.name ?? "Another body of water" }));

  if (!decision.readyToSend) return { sent: false, reason: decision.reason, waitingOn: outstandingNames };

  /**
   * Claim the bundle before sending, in a short transaction under an advisory lock keyed on
   * (property, day). Two completions landing at once -- an offline queue replaying a pool and a spa
   * together -- would otherwise both see "all members finished" and both send.
   *
   * The email is sent AFTER this commits, never inside it: Resend is an external call of a few
   * hundred milliseconds, and lib/prisma.ts caps the pool at 2 connections per instance, so holding
   * one open across it would stall the other request on the same instance. Claiming first and
   * sending second means a send failure leaves a stamp with no email, so the stamps are cleared
   * again below if that happens.
   */
  const lockKey = `aquarunner:service-summary:${visit.propertyId}:${ymd}`;
  const claimedAt = new Date();
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const fresh = await tx.serviceVisit.findMany({
      where: { id: { in: decision.memberIds } },
      select: { id: true, summaryEmailSentAt: true },
    });
    if (fresh.some((f) => f.summaryEmailSentAt != null)) return false;
    await tx.serviceVisit.updateMany({
      where: { id: { in: decision.memberIds } },
      data: { summaryEmailSentAt: claimedAt },
    });
    return true;
  });
  if (!claimed) return { sent: false, reason: "already-sent", waitingOn: [] };

  try {
    const bodies = await loadBodies(decision);
    if (bodies.length === 0) {
      await releaseClaim(decision.memberIds, claimedAt);
      return { sent: false, reason: "nothing-completed", waitingOn: outstandingNames };
    }

    // The visit as a whole: earliest real arrival, latest completion. A bundle spans a few minutes,
    // and the customer reads this as "when someone was here".
    const startedAts = bodies.map((b) => b.startedAt).filter((d): d is Date => d != null);
    const earliestStart = startedAts.length > 0 ? new Date(Math.min(...startedAts.map((d) => d.getTime()))) : null;
    const latestCompleted = new Date(Math.max(...bodies.map((b) => b.body.completedAt.getTime())));

    const result = await sendServiceSummaryEmail({
      to: contactEmail,
      // Same gate the portal layout and welcome email use: stored branding stops being applied the
      // moment an org is no longer on a tier that includes it, rather than merely becoming
      // uneditable. Null here yields the platform's own look.
      branding: hasWhiteLabelBranding(visit.organization)
        ? {
            orgName: visit.organization.name,
            logoUrl: visit.organization.brandingLogoUrl,
            primaryColor: visit.organization.brandingPrimaryColor,
            headerColor: visit.organization.brandingHeaderColor,
          }
        : null,
      propertyName: visit.property.name,
      bodies: bodies.map((b) => b.body),
      address:
        [visit.property.addressLine1, visit.property.city, visit.property.region].filter(Boolean).join(", ") || null,
      technicianName: visit.technician?.name ?? visit.technician?.email ?? null,
      startedAt: earliestStart,
      completedAt: latestCompleted,
      timeZone,
      ccEmail: visit.organization.serviceSummaryCcEmail,
      replyTo: visit.organization.welcomeEmailSupportEmail,
    });

    if (!result.ok) {
      await releaseClaim(decision.memberIds, claimedAt);
      return { sent: false, reason: result.error ?? "send-failed", waitingOn: [] };
    }
    return { sent: true, reason: "sent", waitingOn: [] };
  } catch (error) {
    await releaseClaim(decision.memberIds, claimedAt);
    throw error;
  }
}

/**
 * Undoes the claim so the summary isn't permanently marked sent when it never went. Scoped to
 * `claimedAt` so it can only ever clear this attempt's own stamp, never a genuine later send's.
 */
async function releaseClaim(memberIds: string[], claimedAt: Date): Promise<void> {
  try {
    await prisma.serviceVisit.updateMany({
      where: { id: { in: memberIds }, summaryEmailSentAt: claimedAt },
      data: { summaryEmailSentAt: null },
    });
  } catch {
    // Nothing useful to do: the visit is complete and the email didn't send. Leaving the stamp only
    // means this bundle won't retry, which is the same outcome as before bundling existed.
  }
}

/** Each serviced member's own record, plus any skipped or unfinished ones named without readings. */
async function loadBodies(decision: {
  completedIds: string[];
  skippedIds: string[];
  incompleteIds: string[];
  memberIds: string[];
}): Promise<{ body: ServiceSummaryBody; startedAt: Date | null }[]> {
  const members = await prisma.serviceVisit.findMany({
    where: { id: { in: [...decision.completedIds, ...decision.skippedIds, ...decision.incompleteIds] } },
    orderBy: { routeSequence: "asc" },
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
      serviceMessage: true,
      techNotes: true,
      reading: true,
      // takenAt is the client capture time, immutable -- unlike a reading's updatedAt, which moves
      // when the record is re-saved and therefore just tracks a late submit.
      photos: { select: { storagePath: true, takenAt: true } },
      doses: { select: { productName: true, quantity: true, unit: true } },
      checklistCompletions: { where: { completed: true }, select: { label: true } },
      bodyOfWater: { select: { name: true, disinfectionMethod: true } },
    },
  });

  const supabaseAdmin = createSupabaseAdminClient();

  return Promise.all(
    members.map(async (m) => {
      const outcome: ServiceSummaryBody["outcome"] =
        m.status === "COMPLETED" ? "serviced" : m.status === "CANCELLED" ? "skipped" : "incomplete";
      const skipped = outcome !== "serviced";
      const photoUrls = skipped
        ? []
        : (
            await Promise.all(
              m.photos.map(async (p) => {
                const { data } = await supabaseAdmin.storage
                  .from(VISIT_PHOTOS_BUCKET)
                  .createSignedUrl(p.storagePath, PHOTO_EMAIL_LINK_TTL_SECONDS);
                return data?.signedUrl ?? null;
              }),
            )
          ).filter((url): url is string => url != null);

      const body: ServiceSummaryBody = {
        bodyOfWaterName: m.bodyOfWater?.name ?? "Body of water",
        usesBromine: m.bodyOfWater?.disinfectionMethod === "BROMINE",
        // A skipped body has no chemistry to report even if a partial reading was entered.
        reading:
          skipped || !m.reading
            ? null
            : {
                ph: m.reading.ph != null ? Number(m.reading.ph) : null,
                freeChlorinePpm: m.reading.freeChlorinePpm != null ? Number(m.reading.freeChlorinePpm) : null,
                brominePpm: m.reading.brominePpm != null ? Number(m.reading.brominePpm) : null,
                alkalinityPpm: m.reading.alkalinityPpm != null ? Number(m.reading.alkalinityPpm) : null,
                cyanuricAcidPpm: m.reading.cyanuricAcidPpm != null ? Number(m.reading.cyanuricAcidPpm) : null,
                temperatureF: m.reading.temperatureF != null ? Number(m.reading.temperatureF) : null,
                backwashAt: m.reading.backwashAt,
              },
        doses: skipped ? [] : m.doses.map((d) => ({ productName: d.productName, quantity: Number(d.quantity), unit: d.unit })),
        checklistLabels: skipped ? [] : m.checklistCompletions.map((c) => c.label).filter(Boolean),
        techNotes: skipped ? null : m.techNotes,
        photoUrls,
        // A skipped visit has no completedAt; its scheduled day is what the email is about, and the
        // header uses the latest completion across the bundle anyway.
        lastWorkEvidenceAt: m.photos.reduce<Date | null>(
          (latest, ph) => (ph.takenAt != null && (latest == null || ph.takenAt > latest) ? ph.takenAt : latest),
          null,
        ),
        completedAt: m.completedAt ?? new Date(),
        serviceMessage: m.serviceMessage,
        outcome,
      };
      return { body, startedAt: skipped ? null : m.startedAt };
    }),
  ).then((rows) =>
    // Nothing to report if every member turned out skipped -- the bundle rule already guards this,
    // but a status change between the two queries would otherwise send an empty summary.
    rows.every((r) => r.body.outcome !== "serviced") ? [] : rows,
  );
}
