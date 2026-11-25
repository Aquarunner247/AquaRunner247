/**
 * The technician's day, as data rather than as a rendered page.
 *
 * Phase 1b of NATIVE-REBUILD-PLAN.md. Every one of the eighteen existing endpoints under
 * app/api/visits/ and app/api/routes/ is a PATCH, POST or DELETE -- there was not a single GET in
 * the app, because reads only ever happened by server-rendering a page. That is exactly why a
 * stop cannot be opened with no signal, and this is the first half of fixing it.
 *
 * The select and the mapping live here, not in the route handler, so there is ONE definition of
 * the wire shape. app/dashboard/schedule/page.tsx still runs its own copy of this query for the
 * server render; the two must agree, and the day they stop agreeing the native client starts
 * showing a different day from the website. Adopting this function there is Phase 3 work -- that
 * page also handles ad-hoc stops, the week tab and the admin all-technicians view, none of which
 * belong here.
 *
 * DELIBERATELY COARSE. A technician about to lose signal needs the whole day in one round trip
 * while they still have it, not twelve chatty requests discovered one tap at a time.
 */

import { prisma } from "@/lib/prisma";
import { coalesceCoord } from "@/lib/geocode";
import { resolveRouteEndpoints } from "@/lib/route-endpoints";
import { isoWeekdayOfYmd, localDayBounds, timeZoneForState } from "@/lib/timezone";
import type { RouteEndpoint } from "@/lib/route-endpoints";

/** One stop as the day view needs it. Mirrors `routeStops` in app/dashboard/schedule/page.tsx. */
export type TechnicianDayStop = {
  id: string;
  status: string;
  pushedAt: string | null;
  abandonedAlertSentAt: string | null;
  movedToVisitId: string | null;
  propertyId: string;
  propertyName: string;
  bodyName: string;
  bodyType: string | null;
  serviceGroup: string | null;
  address: string;
  scheduledStart: string;
  startedAt: string | null;
  completedAt: string | null;
  departedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  geofenceMeters: number | null;
};

export type TechnicianDay = {
  /** Echoed back so a cached response can be matched to the day it describes. */
  date: string;
  /** The technician whose day this is -- a mirror keyed only by date would collide on shared devices. */
  technicianId: string;
  timeZone: string;
  stops: TechnicianDayStop[];
  /**
   * Where the day starts and finishes, for the map pins and the driving line.
   *
   * Passed through in resolveRouteEndpoints' own shape rather than flattened: a half-set
   * coordinate pair is not a place, and that function already collapses one to null. Flattening
   * it back into six loose fields would reintroduce exactly the half-set state it exists to
   * prevent.
   */
  endpoints: { start: RouteEndpoint | null; end: RouteEndpoint | null };
};

/**
 * NOT a Prisma-free module, unlike most of lib/. It is a query, so it cannot be -- but the shape
 * it returns is plain JSON on purpose, so a native client and the WebView consume the same thing.
 */
export async function technicianDay(args: {
  organizationId: string;
  technicianId: string;
  orgState: string | null;
  /** Local yyyy-mm-dd. */
  ymd: string;
}): Promise<TechnicianDay> {
  const timeZone = timeZoneForState(args.orgState);
  const { start, end } = localDayBounds(args.ymd, timeZone);

  // Resolved against the ROUTE that runs on this weekday, so a Thursday override applies on
  // Thursdays only -- same rule as the schedule page, see lib/route-endpoints.ts.
  const [dayRoute, technician, visits] = await Promise.all([
    prisma.recurringRoute.findFirst({
      where: {
        organizationId: args.organizationId,
        technicianId: args.technicianId,
        active: true,
        dayOfWeek: isoWeekdayOfYmd(args.ymd),
      },
      select: {
        startLatitude: true,
        startLongitude: true,
        startAddress: true,
        endLatitude: true,
        endLongitude: true,
        endAddress: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: args.technicianId },
      select: {
        startLatitude: true,
        startLongitude: true,
        startAddress: true,
        endLatitude: true,
        endLongitude: true,
        endAddress: true,
      },
    }),
    prisma.serviceVisit.findMany({
      where: { technicianId: args.technicianId, scheduledStart: { gte: start, lt: end } },
      orderBy: [{ routeSequence: "asc" }, { scheduledStart: "asc" }],
      select: {
        id: true,
        status: true,
        scheduledStart: true,
        startedAt: true,
        completedAt: true,
        departedAt: true,
        pushedAt: true,
        abandonedAlertSentAt: true,
        movedToVisitId: true,
        routeSequence: true,
        property: {
          select: {
            id: true,
            name: true,
            addressLine1: true,
            city: true,
            region: true,
            latitude: true,
            longitude: true,
            geofenceMeters: true,
          },
        },
        // Prefer the body of water's OWN pin over the property's single shared coordinate: a
        // property with a front pool and a back pool is two places to drive to.
        bodyOfWater: {
          select: { name: true, type: true, serviceGroup: true, latitude: true, longitude: true },
        },
      },
    }),
  ]);

  return {
    date: args.ymd,
    technicianId: args.technicianId,
    timeZone,
    endpoints: resolveRouteEndpoints({ route: dayRoute, technician }),
    stops: visits.map((v) => ({
      id: v.id,
      status: v.status,
      pushedAt: v.pushedAt ? v.pushedAt.toISOString() : null,
      abandonedAlertSentAt: v.abandonedAlertSentAt ? v.abandonedAlertSentAt.toISOString() : null,
      movedToVisitId: v.movedToVisitId,
      propertyId: v.property.id,
      propertyName: v.property.name,
      bodyName: v.bodyOfWater.name,
      bodyType: v.bodyOfWater.type,
      serviceGroup: v.bodyOfWater.serviceGroup,
      address: [v.property.addressLine1, v.property.city, v.property.region].filter(Boolean).join(", "),
      scheduledStart: v.scheduledStart.toISOString(),
      startedAt: v.startedAt ? v.startedAt.toISOString() : null,
      completedAt: v.completedAt ? v.completedAt.toISOString() : null,
      departedAt: v.departedAt ? v.departedAt.toISOString() : null,
      latitude: coalesceCoord(v.bodyOfWater.latitude, v.property.latitude),
      longitude: coalesceCoord(v.bodyOfWater.longitude, v.property.longitude),
      geofenceMeters: v.property.geofenceMeters,
    })),
  };
}
