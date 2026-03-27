import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;
  const visit = await prisma.serviceVisit.findUnique({
    where: { id },
    include: {
      reading: true,
      photos: { select: { id: true } },
    },
  });
  if (!visit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const canEdit =
    appUser.organizationId === visit.organizationId &&
    (appUser.role === "ADMIN" || appUser.role === "OFFICE" || visit.technicianId === appUser.id);
  if (!canEdit) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (visit.status === "COMPLETED") {
    return NextResponse.json({ ok: true, alreadyCompleted: true });
  }

  const requiredReadings = [
    visit.reading?.ph,
    visit.reading?.freeChlorinePpm,
    visit.reading?.alkalinityPpm,
    visit.reading?.cyanuricAcidPpm,
    visit.reading?.pumpPressurePsi,
    visit.reading?.vacGaugeReading,
    visit.reading?.flowMeterGpm,
    visit.reading?.filterPressurePsi,
  ];
  const missingReadings = requiredReadings.some((v) => v == null);
  if (missingReadings) {
    return NextResponse.json({ error: "MISSING_REQUIRED_READINGS" }, { status: 400 });
  }

  // Rule selected: at least one photo per body of water. This visit targets one body.
  if (visit.photos.length < 1) {
    return NextResponse.json({ error: "MISSING_REQUIRED_PHOTO" }, { status: 400 });
  }

  const completed = await prisma.serviceVisit.update({
    where: { id: visit.id },
    data: {
      status: "COMPLETED",
      serviceComplete: true,
      completedAt: new Date(),
      startedAt: visit.startedAt ?? new Date(),
    },
    select: {
      id: true,
      status: true,
      serviceComplete: true,
      completedAt: true,
    },
  });

  return NextResponse.json({ ok: true, visit: completed });
}
