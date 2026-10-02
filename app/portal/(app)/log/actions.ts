"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePortalPage } from "@/lib/auth/portal-page-guard";
import { canLogReadings, PORTAL_LOG_PATH, portalHomePath } from "@/lib/portal-access";
import { isWithinReadingBounds } from "@/lib/reading-bounds";
import { timeZoneForState, localDayBounds, ymdInTimeZone } from "@/lib/timezone";

const READING_KEYS = [
  "freeChlorinePpm",
  "brominePpm",
  "ph",
  "alkalinityPpm",
  "cyanuricAcidPpm",
  "temperatureF",
  "pumpPressurePsi",
  "vacGaugeReading",
  "filterPressurePsi",
  "flowMeterGpm",
] as const;

/**
 * Records a maintenance person's own chemistry reading for one body of water.
 *
 * It never touches the technician's service visit for that day. A reading from the pool company is what
 * they measured and what the customer was emailed; overwriting it would edit a service record after the
 * fact and lose the technician's actual numbers. So this writes its OWN log-only visit and the two sit
 * side by side -- lib/reading-log-days.ts then collapses the day to one line in the log, showing the
 * later of the two, which is how an aquatic maintenance log reads anyway.
 *
 * Within the day it upserts rather than accumulating: the same person correcting a value, or logging
 * again an hour later, updates the row they already own instead of leaving two of their own entries to
 * disagree with each other.
 *
 * Scope comes from the login's own customerId, never the form -- a CustomerUser is bound to one customer
 * by construction, which is the whole reason this lives in the portal rather than being a staff role.
 */
export async function logPortalReading(formData: FormData) {
  const customerUser = await requirePortalPage(PORTAL_LOG_PATH);
  if (!canLogReadings(customerUser.role)) redirect(portalHomePath(customerUser.role));

  const bodyId = String(formData.get("bodyId") ?? "").trim();
  if (!bodyId) return;

  const body = await prisma.bodyOfWater.findFirst({
    where: { id: bodyId, property: { customerId: customerUser.customerId } },
    select: {
      id: true,
      propertyId: true,
      property: { select: { organizationId: true, organization: { select: { state: true } } } },
    },
  });
  if (!body) return;

  const data: Record<string, number | null> = {};
  let anyValue = false;
  for (const key of READING_KEYS) {
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) {
      data[key] = null;
      continue;
    }
    const value = Number(raw);
    // Out of range is dropped rather than rejecting the whole submission: a mistyped alkalinity should
    // not throw away a correct chlorine reading taken at the same moment, and this is a compliance log
    // where a missing field is honest and a wrong one is not. Same bounds the technician form uses.
    if (!Number.isFinite(value) || !isWithinReadingBounds(key, value)) {
      data[key] = null;
      continue;
    }
    data[key] = value;
    anyValue = true;
  }
  // Nothing worth recording. Creating a visit for it would put a "visited" mark on the log for a day
  // with no numbers behind it.
  if (!anyValue) redirect(`${PORTAL_LOG_PATH}?error=empty`);

  const now = new Date();
  const timeZone = timeZoneForState(body.property.organization.state);
  const { start: dayStart, end: dayEnd } = localDayBounds(ymdInTimeZone(now, timeZone), timeZone);

  // This person's own entry for this body today, if they already made one.
  const existing = await prisma.serviceVisit.findFirst({
    where: {
      bodyOfWaterId: body.id,
      logOnlyRecord: true,
      loggedByCustomerUserId: customerUser.id,
      completedAt: { gte: dayStart, lt: dayEnd },
    },
    select: { id: true },
  });

  const visitId =
    existing?.id ??
    (
      await prisma.serviceVisit.create({
        data: {
          organizationId: body.property.organizationId,
          propertyId: body.propertyId,
          bodyOfWaterId: body.id,
          scheduledStart: now,
          status: "COMPLETED",
          // serviceComplete is what getMonthlyReadingRows requires to count a row at all. It does not
          // claim a service was performed -- logOnlyRecord is what says this was a reading logged with
          // nobody dispatched, and every query that means "work happened" excludes those.
          serviceComplete: true,
          completedAt: now,
          logOnlyRecord: true,
          loggedByCustomerUserId: customerUser.id,
        },
        select: { id: true },
      })
    ).id;

  // completedAt moves to the latest entry, which is what makes "the latest reading of the day" true for
  // repeat entries by the same person as well as across authors.
  if (existing) {
    await prisma.serviceVisit.update({ where: { id: existing.id }, data: { completedAt: now } });
  }

  await prisma.visitWaterReading.upsert({
    where: { visitId },
    create: { visitId, ...data, capturedAt: now },
    update: { ...data, capturedAt: now },
  });

  revalidatePath(PORTAL_LOG_PATH);
  redirect(`${PORTAL_LOG_PATH}?saved=${encodeURIComponent(bodyId)}`);
}
