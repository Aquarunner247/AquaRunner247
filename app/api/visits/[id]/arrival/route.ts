import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

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
    select: { id: true, technicianId: true, organizationId: true, status: true, startedAt: true },
  });
  if (!visit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const canEdit =
    appUser.organizationId === visit.organizationId &&
    (appUser.role === "ADMIN" || appUser.role === "OFFICE" || visit.technicianId === appUser.id);
  if (!canEdit) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (visit.startedAt || visit.status === "COMPLETED" || visit.status === "CANCELLED") {
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

  const updated = await prisma.serviceVisit.update({
    where: { id },
    data: {
      startedAt: new Date(),
      status: visit.status === "SCHEDULED" ? "IN_PROGRESS" : visit.status,
      arrivalLatitude: latitude,
      arrivalLongitude: longitude,
      arrivalAccuracyMeters: accuracyMeters,
    },
    select: { id: true, startedAt: true, status: true },
  });

  return NextResponse.json({ ok: true, visit: updated });
}
