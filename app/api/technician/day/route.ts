import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { technicianDay } from "@/lib/technician-day";
import { prisma } from "@/lib/prisma";
import { timeZoneForState, ymdInTimeZone } from "@/lib/timezone";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/technician/day?date=YYYY-MM-DD -- the whole day in one round trip.
 *
 * The first read endpoint in the app. See NATIVE-REBUILD-PLAN.md Phase 1b: every pre-existing
 * endpoint under app/api/ was a write, so a stop could not be opened without the server
 * rendering a page, which is why there is no working offline mode today.
 *
 * `date` is optional and defaults to today in the ORGANIZATION's timezone, not the server's or
 * the device's -- the same rule the schedule page uses. A technician in Nevada must not get
 * tomorrow's route because a server in UTC has already rolled over.
 *
 * A technician gets their own day and only their own. `?technicianId=` is accepted for ADMIN and
 * OFFICE, because an admin can be assigned stops and can also look at somebody else's day --
 * see app/dashboard/routes/page.tsx, which puts no role filter on the technician picker.
 */
export async function GET(request: Request) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const url = new URL(request.url);
  const requestedDate = url.searchParams.get("date");
  if (requestedDate != null && !YMD_RE.test(requestedDate)) {
    return NextResponse.json({ error: "BAD_DATE" }, { status: 400 });
  }

  const requestedTechnician = url.searchParams.get("technicianId");
  const isAdminOrOffice = appUser.role === "ADMIN" || appUser.role === "OFFICE";
  if (requestedTechnician && requestedTechnician !== appUser.id && !isAdminOrOffice) {
    // Not 404: the caller is authenticated and the refusal is about authority, not existence.
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const technicianId = requestedTechnician ?? appUser.id;

  const org = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { state: true },
  });

  // A requested technician must be inside the caller's own organization. Without this an admin
  // could read another company's day by guessing an id -- the query below filters by
  // technicianId, so the organizationId scoping has to be established here.
  if (requestedTechnician && requestedTechnician !== appUser.id) {
    const member = await prisma.user.findFirst({
      where: { id: requestedTechnician, organizationId: appUser.organizationId },
      select: { id: true },
    });
    if (!member) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const ymd = requestedDate ?? ymdInTimeZone(new Date(), timeZoneForState(org?.state ?? null));

  const day = await technicianDay({
    organizationId: appUser.organizationId,
    technicianId,
    orgState: org?.state ?? null,
    ymd,
  });

  return NextResponse.json(day);
}
