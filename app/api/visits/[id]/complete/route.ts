import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { sendServiceSummaryEmail } from "@/lib/email";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;
  const visit = await prisma.serviceVisit.findUnique({
    where: { id },
    include: {
      reading: true,
      photos: { select: { id: true } },
      property: { select: { name: true, managerEmail: true } },
      bodyOfWater: { select: { id: true, name: true } },
      technician: { select: { name: true, email: true } },
      doses: { select: { productName: true, quantity: true, unit: true } },
      checklistCompletions: { where: { completed: true }, select: { label: true } },
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

  // Cyanuric acid only needs checking once every 30 days per body of water.
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentCya = await prisma.visitWaterReading.findFirst({
    where: {
      visit: { bodyOfWaterId: visit.bodyOfWaterId, id: { not: visit.id }, completedAt: { gte: thirtyDaysAgo } },
      cyanuricAcidPpm: { not: null },
    },
    select: { id: true },
  });
  const cyaRequired = !recentCya;

  const requiredReadings = [
    visit.reading?.ph,
    visit.reading?.freeChlorinePpm,
    visit.reading?.alkalinityPpm,
    visit.reading?.pumpPressurePsi,
    visit.reading?.vacGaugeReading,
    visit.reading?.flowMeterGpm,
    visit.reading?.filterPressurePsi,
    ...(cyaRequired ? [visit.reading?.cyanuricAcidPpm] : []),
  ];
  const missingReadings = requiredReadings.some((v) => v == null);
  if (missingReadings) {
    return NextResponse.json({ error: "MISSING_REQUIRED_READINGS" }, { status: 400 });
  }

  // Rule selected: at least one photo per body of water. This visit targets one body.
  if (visit.photos.length < 1) {
    return NextResponse.json({ error: "MISSING_REQUIRED_PHOTO" }, { status: 400 });
  }

  const completedAt = new Date();
  const completed = await prisma.serviceVisit.update({
    where: { id: visit.id },
    data: {
      status: "COMPLETED",
      serviceComplete: true,
      completedAt,
      startedAt: visit.startedAt ?? completedAt,
    },
    select: {
      id: true,
      status: true,
      serviceComplete: true,
      completedAt: true,
    },
  });

  // Best-effort: send a service summary email to the property's contact on file.
  // Never blocks or fails visit completion if email sending has an issue.
  if (visit.property.managerEmail) {
    try {
      await sendServiceSummaryEmail({
        to: visit.property.managerEmail,
        propertyName: visit.property.name,
        bodyOfWaterName: visit.bodyOfWater.name,
        technicianName: visit.technician?.name ?? visit.technician?.email ?? null,
        completedAt,
        reading: visit.reading
          ? {
              ph: visit.reading.ph != null ? Number(visit.reading.ph) : null,
              freeChlorinePpm: visit.reading.freeChlorinePpm != null ? Number(visit.reading.freeChlorinePpm) : null,
              alkalinityPpm: visit.reading.alkalinityPpm != null ? Number(visit.reading.alkalinityPpm) : null,
              cyanuricAcidPpm: visit.reading.cyanuricAcidPpm != null ? Number(visit.reading.cyanuricAcidPpm) : null,
              temperatureF: visit.reading.temperatureF != null ? Number(visit.reading.temperatureF) : null,
              backwashAt: visit.reading.backwashAt,
            }
          : null,
        doses: visit.doses.map((d) => ({ productName: d.productName, quantity: Number(d.quantity), unit: d.unit })),
        checklistLabels: visit.checklistCompletions.map((c) => c.label).filter(Boolean),
        techNotes: visit.techNotes,
      });
    } catch {
      // Non-critical — visit is already marked complete regardless of email outcome.
    }
  }

  return NextResponse.json({ ok: true, visit: completed });
}
