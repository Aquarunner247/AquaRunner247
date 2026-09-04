import { prisma } from "@/lib/prisma";
import { timeZoneForState, formatLocalDateTime } from "@/lib/timezone";
import type { PhoneAgentCall } from "@/generated/prisma/client";

export const FALLBACK_STATUS_TEXT = "I don't have that information right now -- let me take a message and we'll follow up.";

const NOT_RECOGNIZED_TEXT = "I'm not able to pull up an account for this number -- let me go ahead and take a message.";

const STATUS_INTENTS = new Set([
  "existing-customer-next-visit",
  "existing-customer-last-visit",
  "existing-customer-assigned-technician",
]);

export function isStatusIntent(displayName: string): boolean {
  return STATUS_INTENTS.has(displayName);
}

/**
 * Answers a live status question using this app's own database, scoped to the property
 * matched on Caller ID for this call (lib/phone-match.ts, set in ensureFallbackCall).
 *
 * Security boundary, non-negotiable: Caller ID is the ONLY authentication this system
 * has. A caller cannot narrate an address or account name to unlock this -- only
 * `call.matchedPropertyId`, set purely from the phone number Twilio reports, is ever
 * trusted. And even that is re-checked against `organizationId` on every query below
 * rather than trusted as a bare foreign key, matching this codebase's "every phone-agent
 * query is org-scoped, no exceptions" rule.
 */
export async function buildStatusAnswer(
  displayName: string,
  call: Pick<PhoneAgentCall, "organizationId" | "matchedPropertyId">,
): Promise<string> {
  if (!call.matchedPropertyId) return NOT_RECOGNIZED_TEXT;

  const { organizationId, matchedPropertyId: propertyId } = call;

  try {
    switch (displayName) {
      case "existing-customer-next-visit":
        return await nextVisitAnswer(organizationId, propertyId);
      case "existing-customer-last-visit":
        return await lastVisitAnswer(organizationId, propertyId);
      case "existing-customer-assigned-technician":
        return await assignedTechnicianAnswer(organizationId, propertyId);
      default:
        return FALLBACK_STATUS_TEXT;
    }
  } catch (err) {
    console.error("[phone agent] buildStatusAnswer failed:", err);
    return FALLBACK_STATUS_TEXT;
  }
}

async function orgState(organizationId: string): Promise<string> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { state: true } });
  return timeZoneForState(org?.state);
}

async function nextVisitAnswer(organizationId: string, propertyId: string): Promise<string> {
  const visit = await prisma.serviceVisit.findFirst({
    where: { organizationId, propertyId, status: "SCHEDULED", scheduledStart: { gte: new Date() } },
    orderBy: { scheduledStart: "asc" },
    select: { scheduledStart: true },
  });
  if (!visit) return "I don't see any upcoming visits scheduled -- I'll make sure someone follows up with you.";
  const tz = await orgState(organizationId);
  return `Your next scheduled visit is ${formatLocalDateTime(visit.scheduledStart, tz)}.`;
}

async function lastVisitAnswer(organizationId: string, propertyId: string): Promise<string> {
  const visit = await prisma.serviceVisit.findFirst({
    where: { organizationId, propertyId, serviceComplete: true },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });
  if (!visit) return "I don't see a completed visit on file yet -- I'll make sure someone follows up with you.";
  const tz = await orgState(organizationId);
  return `Your last completed visit was ${formatLocalDateTime(visit.completedAt, tz)}.`;
}

async function assignedTechnicianAnswer(organizationId: string, propertyId: string): Promise<string> {
  // Prefer the technician actually assigned to the next scheduled visit -- it can
  // override the route's default tech for a given day -- and only fall back to the
  // property's regular recurring-route technician if nothing's scheduled yet.
  const nextVisit = await prisma.serviceVisit.findFirst({
    where: { organizationId, propertyId, status: "SCHEDULED", scheduledStart: { gte: new Date() }, technicianId: { not: null } },
    orderBy: { scheduledStart: "asc" },
    select: { technician: { select: { name: true } } },
  });
  if (nextVisit?.technician?.name) return `Your assigned technician is ${nextVisit.technician.name}.`;

  const recurringStop = await prisma.recurringStop.findFirst({
    where: { propertyId, route: { organizationId, active: true } },
    select: { route: { select: { technician: { select: { name: true } } } } },
  });
  if (recurringStop?.route.technician?.name) return `Your assigned technician is ${recurringStop.route.technician.name}.`;

  return "I don't see an assigned technician on file -- I'll make sure someone follows up with you.";
}
