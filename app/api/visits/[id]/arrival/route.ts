import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { blockedStartMessage, blockingStopFor, openStopsBlockingStartWhere } from "@/lib/visit-start-gate";
import { localDayBounds, timeZoneForState, ymdInTimeZone } from "@/lib/timezone";
import { isPushedVisit } from "@/lib/visit-pushed";

function decimalOrNull(v: unknown): number | null {
  const n = Number(v);
  return typeof v === "number" || typeof v === "string" ? (Number.isFinite(n) ? n : null) : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // Body is optional -- best-effort GPS, same as VisitPhoto's own lat/long/accuracy.
  // A caller that sends no body (or a stale cached client) still logs arrival normally,
  // just without a location attached.
  let latitude: number | null = null;
  let longitude: number | null = null;
  let accuracyMeters: number | null = null;
  try {
    const body = await request.json();
    latitude = decimalOrNull(body?.latitude);
    longitude = decimalOrNull(body?.longitude);
    accuracyMeters = decimalOrNull(body?.accuracyMeters);
  } catch {
    // No/invalid JSON body -- proceed without location.
  }

  const { id } = await context.params;
  const visit = await prisma.serviceVisit.findUnique({
    where: { id },
    select: {
      id: true,
      technicianId: true,
      organizationId: true,
      status: true,
      startedAt: true,
      pushedAt: true,
      propertyId: true,
      organization: { select: { state: true } },
    },
  });
  if (!visit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const canEdit =
    appUser.organizationId === visit.organizationId &&
    (appUser.role === "ADMIN" || appUser.role === "OFFICE" || visit.technicianId === appUser.id);
  if (!canEdit) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  /**
   * Picking a swept stop back up counts as starting it, not as an arrival already logged.
   *
   * The nightly sweep stamps pushedAt and nothing ever clears it, so a resumed stop kept reading
   * "Pushed" on the schedule while someone was standing at it working. Worse, it kept the startedAt
   * from the day it was abandoned: the customer's summary prints completedAt minus startedAt, so
   * real reports have gone out saying a pool was serviced for 18, 20, even 126 hours.
   *
   * Falling through re-stamps startedAt to now, clears pushedAt, and -- because this is a start --
   * puts the resumption through the one-property-at-a-time gate like any other.
   *
   * The follow-up location PATCH that the form sends a moment later needs no special case: pushedAt
   * is null by then, so it takes the ordinary location-only path below.
   */
  const isResuming = isPushedVisit({ status: visit.status, pushedAt: visit.pushedAt });

  if ((visit.startedAt && !isResuming) || visit.status === "COMPLETED" || visit.status === "CANCELLED") {
    // Arrival's already logged (or can't be) -- the client fires the initial PATCH
    // immediately for an instant "Arrived" confirmation, without waiting on the
    // geolocation prompt, then sends a follow-up PATCH once location resolves. This is
    // that follow-up: attach location to the existing row without re-touching startedAt.
    if (visit.startedAt && (latitude != null || longitude != null)) {
      const withLocation = await prisma.serviceVisit.update({
        where: { id },
        data: { arrivalLatitude: latitude, arrivalLongitude: longitude, arrivalAccuracyMeters: accuracyMeters },
        select: { id: true, startedAt: true, status: true },
      });
      return NextResponse.json({ ok: true, visit: withLocation });
    }
    return NextResponse.json({ ok: true, visit: { id: visit.id, startedAt: visit.startedAt, status: visit.status } });
  }

  /**
   * One property at a time.
   *
   * This is the only place a visit becomes IN_PROGRESS, so gating here covers the "I've arrived"
   * button and GPS auto-arrival with one rule rather than two that could disagree.
   *
   * Only for technicians. An ADMIN or OFFICE user hitting this is doing back-office correction --
   * stamping an arrival somebody forgot, fixing a bad record -- and must not be told to go finish
   * a stop they are not standing at. They are also the escape hatch if a technician gets wedged.
   */
  if (appUser.role === "TECHNICIAN" && visit.technicianId) {
    const timeZone = timeZoneForState(visit.organization.state);
    // The CURRENT local day, not the visit's scheduled one: a stop scheduled for Tuesday and
    // worked on Thursday is still work started today, and is exactly the case that exposed this.
    const { start, end } = localDayBounds(ymdInTimeZone(new Date(), timeZone), timeZone);
    const openStops = await prisma.serviceVisit.findMany({
      where: { ...openStopsBlockingStartWhere(visit.technicianId, start, end), id: { not: visit.id } },
      select: {
        id: true,
        propertyId: true,
        property: { select: { name: true } },
        bodyOfWater: { select: { name: true } },
      },
    });
    const blocker = blockingStopFor(
      openStops.map((s) => ({
        id: s.id,
        propertyId: s.propertyId,
        propertyName: s.property.name,
        bodyName: s.bodyOfWater?.name ?? null,
      })),
      visit.propertyId,
    );
    if (blocker) {
      return NextResponse.json(
        {
          error: "OTHER_PROPERTY_IN_PROGRESS",
          message: blockedStartMessage(blocker),
          blockingVisitId: blocker.id,
          blockingPropertyName: blocker.propertyName,
          blockingBodyName: blocker.bodyName,
        },
        { status: 409 },
      );
    }
  }

  const updated = await prisma.serviceVisit.update({
    where: { id },
    data: {
      startedAt: new Date(),
      // Cleared so the stop stops reading "Pushed" the moment someone is actually on it again.
      pushedAt: null,
      status: visit.status === "SCHEDULED" ? "IN_PROGRESS" : visit.status,
      arrivalLatitude: latitude,
      arrivalLongitude: longitude,
      arrivalAccuracyMeters: accuracyMeters,
    },
    select: { id: true, startedAt: true, status: true },
  });

  return NextResponse.json({ ok: true, visit: updated });
}
