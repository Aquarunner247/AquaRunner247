"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

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

  const scheduledDateRaw = String(formData.get("scheduledDate") ?? "").trim();
  const scheduledDate = scheduledDateRaw ? new Date(`${scheduledDateRaw}T00:00:00`) : new Date();
  if (Number.isNaN(scheduledDate.getTime())) return;

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

  await prisma.adHocStop.create({
    data: {
      organizationId: appUser.organizationId,
      technicianId,
      propertyId,
      scheduledDate,
      description,
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
