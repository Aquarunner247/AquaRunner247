"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ScheduleFrequency } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { geocodeAddress, buildFullAddress } from "@/lib/geocode";

async function requireAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");
  return appUser;
}

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export async function createRoute(formData: FormData) {
  const appUser = await requireAdmin();
  const technicianId = String(formData.get("technicianId") ?? "").trim();
  const dayOfWeekRaw = String(formData.get("dayOfWeek") ?? "").trim();
  const frequencyRaw = String(formData.get("frequency") ?? "WEEKLY").trim();
  if (!dayOfWeekRaw) return;

  const dayOfWeek = Number(dayOfWeekRaw);
  if (!Number.isFinite(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) return;

  const name = DAY_NAMES[dayOfWeek];

  const frequency = (Object.values(ScheduleFrequency) as string[]).includes(frequencyRaw)
    ? (frequencyRaw as ScheduleFrequency)
    : ScheduleFrequency.WEEKLY;

  if (technicianId) {
    const tech = await prisma.user.findFirst({
      where: { id: technicianId, organizationId: appUser.organizationId },
      select: { id: true },
    });
    if (!tech) return;
  }

  await prisma.recurringRoute.create({
    data: {
      organizationId: appUser.organizationId,
      name,
      technicianId: technicianId || null,
      dayOfWeek,
      frequency,
      active: true,
    },
  });

  revalidatePath("/dashboard/routes");
}

export async function updateRouteTechnician(formData: FormData) {
  const appUser = await requireAdmin();
  const routeId = String(formData.get("routeId") ?? "").trim();
  const technicianIdRaw = String(formData.get("technicianId") ?? "").trim();
  if (!routeId) return;

  const route = await prisma.recurringRoute.findFirst({
    where: { id: routeId, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!route) return;

  let technicianId: string | null = null;
  if (technicianIdRaw) {
    const tech = await prisma.user.findFirst({
      where: { id: technicianIdRaw, organizationId: appUser.organizationId },
      select: { id: true },
    });
    if (!tech) return;
    technicianId = tech.id;
  }

  await prisma.recurringRoute.update({
    where: { id: route.id },
    data: { technicianId },
  });

  // Visits are generated ahead of time (see ensureVisitsGeneratedForDate) and copy the
  // route's technicianId onto the ServiceVisit at creation time — reassigning the route
  // alone wouldn't move already-generated future stops to the new tech. Sync any
  // not-yet-started ones now so the change takes effect immediately, not just for visits
  // generated after this point.
  await prisma.serviceVisit.updateMany({
    where: { recurringStop: { routeId: route.id }, status: "SCHEDULED" },
    data: { technicianId },
  });

  revalidatePath("/dashboard/routes");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/schedule");
}

export async function deleteRoute(formData: FormData) {
  const appUser = await requireAdmin();
  const routeId = String(formData.get("routeId") ?? "").trim();
  if (!routeId) return;

  const route = await prisma.recurringRoute.findFirst({
    where: { id: routeId, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!route) return;

  // Visits already generated from this route's stops aren't cascaded away by the
  // RecurringStop delete (recurringStopId is just SetNull'd), so they'd otherwise
  // keep showing up on the technician's dashboard after the route is gone.
  await prisma.serviceVisit.deleteMany({
    where: { recurringStop: { routeId: route.id }, status: "SCHEDULED" },
  });

  await prisma.recurringRoute.delete({ where: { id: route.id } });
  revalidatePath("/dashboard/routes");
  revalidatePath("/dashboard");
}

export async function addRouteStop(formData: FormData) {
  const appUser = await requireAdmin();
  const routeId = String(formData.get("routeId") ?? "").trim();
  const bodyOfWaterId = String(formData.get("bodyOfWaterId") ?? "").trim();
  const etaOffsetRaw = String(formData.get("etaOffsetMinutes") ?? "0").trim();
  if (!routeId || !bodyOfWaterId) return;

  const route = await prisma.recurringRoute.findFirst({
    where: { id: routeId, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!route) return;

  const body = await prisma.bodyOfWater.findFirst({
    where: { id: bodyOfWaterId, property: { organizationId: appUser.organizationId } },
    select: { id: true, propertyId: true },
  });
  if (!body) return;

  const stopCount = await prisma.recurringStop.count({ where: { routeId: route.id } });
  const etaOffsetMinutes = Number(etaOffsetRaw);

  await prisma.recurringStop.create({
    data: {
      routeId: route.id,
      propertyId: body.propertyId,
      bodyOfWaterId: body.id,
      sortOrder: stopCount,
      etaOffsetMinutes: Number.isFinite(etaOffsetMinutes) ? etaOffsetMinutes : 0,
    },
  });

  revalidatePath("/dashboard/routes");
}

export async function removeRouteStop(formData: FormData) {
  const appUser = await requireAdmin();
  const stopId = String(formData.get("stopId") ?? "").trim();
  if (!stopId) return;

  const stop = await prisma.recurringStop.findFirst({
    where: { id: stopId, route: { organizationId: appUser.organizationId } },
    select: { id: true },
  });
  if (!stop) return;

  await prisma.recurringStop.delete({ where: { id: stop.id } });
  revalidatePath("/dashboard/routes");
}

/**
 * Geocodes every property in the org that doesn't yet have coordinates.
 * Uses the free OpenStreetMap Nominatim service, one request per second
 * to respect their usage policy.
 */
export async function geocodeAllProperties() {
  const appUser = await requireAdmin();

  const properties = await prisma.property.findMany({
    where: {
      organizationId: appUser.organizationId,
      OR: [{ latitude: null }, { longitude: null }],
    },
    select: {
      id: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      region: true,
      postalCode: true,
      country: true,
    },
  });

  for (const property of properties) {
    const fullAddress = buildFullAddress(property);
    if (!fullAddress) continue;

    const result = await geocodeAddress(fullAddress);
    if (result) {
      await prisma.property.update({
        where: { id: property.id },
        data: { latitude: result.latitude, longitude: result.longitude },
      });
    }
    // Respect Nominatim's ~1 request/second usage policy
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }

  revalidatePath("/dashboard/routes");
}
