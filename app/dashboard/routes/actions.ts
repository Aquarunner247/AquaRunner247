"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ScheduleFrequency } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { geocodeAddress, buildFullAddress } from "@/lib/geocode";
import { getOrganizationRuleset, requiresMultipleDailyVisits } from "@/lib/compliance";

async function requireAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");
  return appUser;
}

const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Parses a <input type="date"> value ("YYYY-MM-DD") into the UTC-midnight Date a @db.Date
 * column round-trips as. Anchoring at UTC rather than `new Date("2026-03-01")`-in-local
 * keeps the stored day equal to the day that was typed regardless of server time zone.
 * Returns null for an empty field, which is the meaningful "no bound" value for both
 * startsOn (no start) and endsOn (never ends) -- so a bad value is rejected by the caller
 * rather than silently becoming "unbounded".
 */
function parseDateFieldOrNull(raw: string): { ok: true; value: Date | null } | { ok: false } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { ok: false };
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return { ok: false };
  return { ok: true, value: parsed };
}

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

  const startsOn = parseDateFieldOrNull(String(formData.get("startsOn") ?? ""));
  const endsOn = parseDateFieldOrNull(String(formData.get("endsOn") ?? ""));
  if (!startsOn.ok || !endsOn.ok) return;
  if (startsOn.value && endsOn.value && endsOn.value < startsOn.value) return;

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
      startsOn: startsOn.value,
      endsOn: endsOn.value,
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

/**
 * Sets a soft stop-count cap for Smart Route Placement suggestions (and the load badge
 * on this page) — advisory only, never enforced against manual assignment via
 * addRouteStop. Blank input clears it back to unlimited.
 */
export async function updateRouteCapacity(formData: FormData) {
  const appUser = await requireAdmin();
  const routeId = String(formData.get("routeId") ?? "").trim();
  const maxCapacityRaw = String(formData.get("maxCapacity") ?? "").trim();
  if (!routeId) return;

  const route = await prisma.recurringRoute.findFirst({
    where: { id: routeId, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!route) return;

  let maxCapacity: number | null = null;
  if (maxCapacityRaw) {
    const parsed = Number(maxCapacityRaw);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    maxCapacity = Math.trunc(parsed);
  }

  await prisma.recurringRoute.update({
    where: { id: route.id },
    data: { maxCapacity },
  });

  revalidatePath("/dashboard/routes");
}

/**
 * Sets the route's service window. An empty "starts on" means no start bound, an empty
 * "ends on" means it never ends -- both are the normal cases, so a blank field clears the
 * bound rather than being rejected.
 *
 * Changing the window doesn't touch visits that already exist. Narrowing it stops FUTURE
 * generation only: a date someone already loaded the schedule for has real ServiceVisit
 * rows, and those are the service record (or a tech's assigned work), not something to
 * silently delete here. Use the route/stop delete paths for that, which are explicit about
 * only removing unstarted visits.
 */
export async function updateRouteWindow(formData: FormData) {
  const appUser = await requireAdmin();
  const routeId = String(formData.get("routeId") ?? "").trim();
  if (!routeId) return;

  const route = await prisma.recurringRoute.findFirst({
    where: { id: routeId, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!route) return;

  const startsOn = parseDateFieldOrNull(String(formData.get("startsOn") ?? ""));
  const endsOn = parseDateFieldOrNull(String(formData.get("endsOn") ?? ""));
  if (!startsOn.ok || !endsOn.ok) return;
  if (startsOn.value && endsOn.value && endsOn.value < startsOn.value) return;

  await prisma.recurringRoute.update({
    where: { id: route.id },
    data: { startsOn: startsOn.value, endsOn: endsOn.value },
  });

  revalidatePath("/dashboard/routes");
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard");
}

export async function duplicateRoute(formData: FormData) {
  const appUser = await requireAdmin();
  const routeId = String(formData.get("routeId") ?? "").trim();
  const targetDayRaw = String(formData.get("targetDayOfWeek") ?? "").trim();
  if (!routeId || !targetDayRaw) return;

  const targetDayOfWeek = Number(targetDayRaw);
  if (!Number.isFinite(targetDayOfWeek) || targetDayOfWeek < 1 || targetDayOfWeek > 7) return;

  const source = await prisma.recurringRoute.findFirst({
    where: { id: routeId, organizationId: appUser.organizationId },
    select: {
      technicianId: true,
      frequency: true,
      startsOn: true,
      endsOn: true,
      stops: {
        orderBy: { sortOrder: "asc" },
        select: { propertyId: true, bodyOfWaterId: true, sortOrder: true, etaOffsetMinutes: true },
      },
    },
  });
  if (!source) return;

  // Any day is a valid target, including one that already has a route (for this or
  // another technician) -- createRoute already allows more than one route per weekday
  // per org (e.g. two technicians each running their own Monday route), so restricting
  // duplication to unscheduled-only days was inconsistent with what manual creation
  // already supports. This just adds another route for that day, same as creating one
  // by hand would.
  await prisma.recurringRoute.create({
    data: {
      organizationId: appUser.organizationId,
      name: DAY_NAMES[targetDayOfWeek],
      technicianId: source.technicianId,
      dayOfWeek: targetDayOfWeek,
      frequency: source.frequency,
      startsOn: source.startsOn,
      endsOn: source.endsOn,
      active: true,
      stops: {
        create: source.stops.map((s) => ({
          propertyId: s.propertyId,
          bodyOfWaterId: s.bodyOfWaterId,
          sortOrder: s.sortOrder,
          etaOffsetMinutes: s.etaOffsetMinutes,
        })),
      },
    },
  });

  revalidatePath("/dashboard/routes");
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
    select: { id: true, dayOfWeek: true },
  });
  if (!route) return;

  const body = await prisma.bodyOfWater.findFirst({
    where: { id: bodyOfWaterId, property: { organizationId: appUser.organizationId } },
    select: { id: true, propertyId: true },
  });
  if (!body) return;

  // A body of water shouldn't be on two routes (or twice on the same route) for the same
  // weekday — the Routes page UI already filters these out of the dropdown, but this
  // guards against stale page state or a direct request bypassing that. Ad-hoc "Extra
  // stops" are unaffected -- they're a separate system, by design, for same-day one-offs.
  //
  // Orgs whose state requires sub-daily testing (see requiresMultipleDailyVisits) skip
  // this guard entirely -- same compliance-aware exception the page's dropdown filter
  // applies, kept in sync here since this is the actual enforcement point.
  const orgRuleset = await getOrganizationRuleset(appUser.organizationId);
  if (!requiresMultipleDailyVisits(orgRuleset)) {
    const alreadyScheduledThatDay = await prisma.recurringStop.findFirst({
      where: { bodyOfWaterId: body.id, route: { organizationId: appUser.organizationId, dayOfWeek: route.dayOfWeek } },
      select: { id: true },
    });
    if (alreadyScheduledThatDay) return;
  }

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

  // Same reason deleteRoute does this: recurringStopId is only SetNull'd on delete, so
  // visits already generated from this stop survive unlinked and keep showing up on the
  // technician's dashboard with no way to reach them from the route. Only SCHEDULED ones
  // go — anything started or completed is the service record and stays under the customer.
  await prisma.serviceVisit.deleteMany({
    where: { recurringStopId: stop.id, status: "SCHEDULED" },
  });

  await prisma.recurringStop.delete({ where: { id: stop.id } });
  revalidatePath("/dashboard/routes");
  revalidatePath("/dashboard");
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

/** Saves a manually-picked pin from the satellite locator page -- always a real, deliberate
 * click/drag, so this overwrites any existing (possibly address-level, not pool-exact)
 * coordinates without further confirmation. */
export async function setPropertyLocation(formData: FormData) {
  const appUser = await requireAdmin();
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const latitude = Number(formData.get("latitude"));
  const longitude = Number(formData.get("longitude"));
  if (!propertyId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId: appUser.organizationId },
    select: { id: true, customerId: true },
  });
  if (!property) return;

  await prisma.property.update({
    where: { id: property.id },
    data: { latitude, longitude },
  });

  revalidatePath("/dashboard/routes");
  if (property.customerId) revalidatePath(`/dashboard/customers/${property.customerId}`);
  redirect("/dashboard/routes");
}

/**
 * Saves a body of water's own pin. Separate from setPropertyLocation because a property has one
 * coordinate that every body on it shares, which can't express a front pool and a back pool
 * being two different places to drive to.
 *
 * Lives here rather than in the customer actions file so it sits beside setPropertyLocation and
 * geocodeAllProperties -- all three exist to get coordinates onto things for routing.
 *
 * `returnTo` lets the caller decide where to land afterwards (the body's own page, or the
 * Routes page when working through the missing-pins list) instead of hardcoding one.
 */
export async function setBodyOfWaterLocation(formData: FormData) {
  const appUser = await requireAdmin();
  const bodyOfWaterId = String(formData.get("bodyOfWaterId") ?? "").trim();
  const latitude = Number(formData.get("latitude"));
  const longitude = Number(formData.get("longitude"));
  if (!bodyOfWaterId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

  const body = await prisma.bodyOfWater.findFirst({
    where: { id: bodyOfWaterId, property: { organizationId: appUser.organizationId } },
    select: { id: true, property: { select: { id: true, customerId: true } } },
  });
  if (!body) return;

  await prisma.bodyOfWater.update({
    where: { id: body.id },
    data: { latitude, longitude },
  });

  revalidatePath("/dashboard/routes");
  revalidatePath("/dashboard/schedule");
  if (body.property.customerId) revalidatePath(`/dashboard/customers/${body.property.customerId}`);

  // Only ever an in-app path: anything else (a scheme, a host, a protocol-relative "//host")
  // would turn a saved pin into an open redirect.
  const returnToRaw = String(formData.get("returnTo") ?? "").trim();
  const returnTo = /^\/[^/\\]/.test(returnToRaw) ? returnToRaw : "/dashboard/routes";
  redirect(returnTo);
}
