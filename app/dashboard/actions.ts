"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { timeZoneForState, ymdInTimeZone, localDayBounds } from "@/lib/timezone";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function resolveIssue(formData: FormData) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN" && appUser.role !== "OFFICE") redirect("/dashboard");

  const issueId = String(formData.get("issueId") ?? "").trim();
  if (!issueId) return;

  const issue = await prisma.visitIssueFlag.findFirst({
    where: { id: issueId, visit: { organizationId: appUser.organizationId } },
    select: { id: true },
  });
  if (!issue) return;

  await prisma.visitIssueFlag.update({
    where: { id: issue.id },
    data: { resolved: true, resolvedAt: new Date() },
  });

  revalidatePath("/dashboard");
}

/**
 * Adds a one-off stop that isn't a chemistry service visit — e.g. "pool store" or
 * "drop off filter at Cornerstone". Admins/office can add one for any technician;
 * technicians can only add one for themselves.
 */
export async function addAdHocStop(formData: FormData) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const description = String(formData.get("description") ?? "").trim();
  if (!description) return;

  // The form posts the org-local day being viewed as "YYYY-MM-DD". It has to be resolved
  // through localDayBounds in the ORG's zone -- the same conversion every read of these rows
  // uses (admin-schedule.tsx, schedule/page.tsx) -- and NOT via
  // `new Date("<ymd>T00:00:00")`, which has no zone suffix and so parses in the SERVER's
  // zone: always UTC on Vercel. That stored midnight UTC, which for any org behind UTC falls
  // inside the PREVIOUS local day's bounds, so every extra stop appeared a day early (a
  // Nevada org adding one for Saturday saw it on Friday, or not at all if they only checked
  // the day they picked). Exactly the failure ensureVisitsGeneratedForDate's doc comment
  // describes fixing for visit generation; this call site was left behind.
  const org = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { state: true },
  });
  const timeZone = timeZoneForState(org?.state);

  const scheduledDateRaw = String(formData.get("scheduledDate") ?? "").trim();
  // A malformed value is rejected rather than quietly falling back to today, which would
  // put the stop on a day nobody asked for. Empty means "no date posted" -> the org's today.
  if (scheduledDateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDateRaw)) return;
  const scheduledYmd = scheduledDateRaw || ymdInTimeZone(new Date(), timeZone);

  const { start: dayStart, end: dayEnd } = localDayBounds(scheduledYmd, timeZone);
  const scheduledDate = dayStart;

  const propertyIdRaw = String(formData.get("propertyId") ?? "").trim();
  let propertyId: string | null = null;
  if (propertyIdRaw) {
    const property = await prisma.property.findFirst({
      where: { id: propertyIdRaw, organizationId: appUser.organizationId },
      select: { id: true },
    });
    propertyId = property?.id ?? null;
  }

  const canPickTechnician = appUser.role === "ADMIN" || appUser.role === "OFFICE";
  const requestedTechnicianId = String(formData.get("technicianId") ?? "").trim();
  let technicianId: string | null = appUser.id;
  if (canPickTechnician) {
    if (!requestedTechnicianId) {
      technicianId = null; // unassigned, admin can leave it open
    } else {
      const tech = await prisma.user.findFirst({
        where: { id: requestedTechnicianId, organizationId: appUser.organizationId },
        select: { id: true },
      });
      technicianId = tech?.id ?? null;
    }
  }

  // Assigned to a technician means this stop now has a place in that day's interleaved
  // list (see route-day-view.tsx) -- give it a real position at the end rather than
  // leaving it unsequenced, so it shows up in the list immediately and is draggable from
  // there. Left null when unassigned: there's no single day's list for it to belong to yet
  // (see AdHocStop.routeSequence's own doc comment).
  let routeSequence: number | null = null;
  if (technicianId) {
    // dayStart/dayEnd come from localDayBounds above (org zone, end exclusive). This used to
    // bracket the day with .setHours() on the server's own clock, which is the same
    // wrong-zone window as the bug fixed above -- it counted a day 7h offset from the one
    // the stop was being added to.
    const [maxVisitSeq, maxAdHocSeq] = await Promise.all([
      prisma.serviceVisit.aggregate({
        where: { organizationId: appUser.organizationId, technicianId, scheduledStart: { gte: dayStart, lt: dayEnd } },
        _max: { routeSequence: true },
      }),
      prisma.adHocStop.aggregate({
        where: { organizationId: appUser.organizationId, technicianId, scheduledDate: { gte: dayStart, lt: dayEnd } },
        _max: { routeSequence: true },
      }),
    ]);
    routeSequence = Math.max(maxVisitSeq._max.routeSequence ?? -1, maxAdHocSeq._max.routeSequence ?? -1) + 1;
  }

  await prisma.adHocStop.create({
    data: {
      organizationId: appUser.organizationId,
      technicianId,
      propertyId,
      scheduledDate,
      description,
      routeSequence,
      createdByUserId: appUser.id,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/schedule");
}

/**
 * Toggles an ad-hoc stop's completed state. Admins/office can toggle any in their
 * org; technicians can only toggle their own.
 */
export async function toggleAdHocStop(formData: FormData) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const stopId = String(formData.get("stopId") ?? "").trim();
  if (!stopId) return;

  const isPrivileged = appUser.role === "ADMIN" || appUser.role === "OFFICE";
  const stop = await prisma.adHocStop.findFirst({
    where: {
      id: stopId,
      organizationId: appUser.organizationId,
      ...(isPrivileged ? {} : { technicianId: appUser.id }),
    },
    select: { id: true, completed: true },
  });
  if (!stop) return;

  await prisma.adHocStop.update({
    where: { id: stop.id },
    data: { completed: !stop.completed, completedAt: !stop.completed ? new Date() : null },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/schedule");
}

/**
 * Deletes an ad-hoc stop. Admins/office can delete any in their org; technicians
 * can only delete their own (e.g. one they added by mistake).
 */
export async function deleteAdHocStop(formData: FormData) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const stopId = String(formData.get("stopId") ?? "").trim();
  if (!stopId) return;

  const isPrivileged = appUser.role === "ADMIN" || appUser.role === "OFFICE";
  const stop = await prisma.adHocStop.findFirst({
    where: {
      id: stopId,
      organizationId: appUser.organizationId,
      ...(isPrivileged ? {} : { technicianId: appUser.id }),
    },
    select: { id: true },
  });
  if (!stop) return;

  await prisma.adHocStop.delete({ where: { id: stop.id } });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/schedule");
}

/**
 * Sets the signed-in user's own start/end location — where their day begins and ends, usually
 * home. Deliberately NOT admin-gated: this is the person's own address, and the whole point is
 * that a technician can set it themselves. It only ever writes the caller's own row.
 *
 * One point serves as both ends: "Optimize stop order" treats the day as a round trip from and
 * back to here (see computeOptimizedStopOrder's `start` option), so the last stop is chosen for
 * being near home rather than being whatever was left over.
 */
export async function setMyStartLocation(formData: FormData) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const latitude = Number(formData.get("latitude"));
  const longitude = Number(formData.get("longitude"));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

  const label = String(formData.get("startAddress") ?? "").trim();

  await prisma.user.update({
    where: { id: appUser.id },
    data: { startLatitude: latitude, startLongitude: longitude, startAddress: label || null },
  });

  revalidatePath("/dashboard/more");
  revalidatePath("/dashboard/schedule");
  redirect("/dashboard/more/start-location?saved=1");
}

/** Clears it, restoring the default: the route simply starts at whichever stop is first. */
export async function clearMyStartLocation() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  await prisma.user.update({
    where: { id: appUser.id },
    data: { startLatitude: null, startLongitude: null, startAddress: null },
  });

  revalidatePath("/dashboard/more");
  revalidatePath("/dashboard/schedule");
  redirect("/dashboard/more/start-location?cleared=1");
}
