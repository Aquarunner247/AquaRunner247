import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { prisma } from "@/lib/prisma";
import { suggestRouteForNewCustomer, type CandidateRouteInput } from "@/lib/route-suggestion";

type SuggestPayload = { propertyId?: string };

export async function POST(request: Request) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (appUser.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = (await request.json()) as SuggestPayload;
  const propertyId = String(body.propertyId ?? "").trim();
  if (!propertyId) return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });

  // Server re-fetches trusted, org-scoped coordinates rather than trusting client-supplied
  // lat/lng — same pattern as every other action in this codebase.
  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId: appUser.organizationId },
    select: { id: true, latitude: true, longitude: true },
  });
  if (!property) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (property.latitude == null || property.longitude == null) {
    return NextResponse.json({ suggestions: [], reason: "NOT_GEOCODED" });
  }

  const routes = await prisma.recurringRoute.findMany({
    where: { organizationId: appUser.organizationId, active: true },
    include: {
      technician: { select: { name: true, email: true } },
      stops: {
        orderBy: { sortOrder: "asc" },
        include: {
          property: { select: { id: true, name: true, latitude: true, longitude: true } },
        },
      },
    },
  });

  const candidates: CandidateRouteInput[] = routes.map((route) => ({
    routeId: route.id,
    technicianLabel: route.technician ? route.technician.name ?? route.technician.email : "Unassigned",
    maxCapacity: route.maxCapacity,
    totalStopCount: route.stops.length,
    geocodedStops: route.stops
      .filter((s) => s.property.latitude != null && s.property.longitude != null)
      .map((s) => ({
        propertyId: s.property.id,
        latitude: Number(s.property.latitude),
        longitude: Number(s.property.longitude),
      })),
  }));

  const newLocation = { latitude: Number(property.latitude), longitude: Number(property.longitude) };
  const suggestions = suggestRouteForNewCustomer(newLocation, candidates);

  // Enrich each suggestion with the route's full geocoded-stop list + metadata so the
  // map preview needs no second round trip — kept here at the API layer, not inside the
  // pure function, so that stays simple/testable.
  const routesById = new Map(routes.map((r) => [r.id, r]));
  const enriched = suggestions.map((s) => {
    const route = routesById.get(s.routeId)!;
    return {
      ...s,
      dayOfWeek: route.dayOfWeek,
      stops: route.stops
        .filter((stop) => stop.property.latitude != null && stop.property.longitude != null)
        .map((stop) => ({
          propertyId: stop.property.id,
          propertyName: stop.property.name,
          latitude: Number(stop.property.latitude),
          longitude: Number(stop.property.longitude),
        })),
    };
  });

  return NextResponse.json({ suggestions: enriched, newLocation });
}
