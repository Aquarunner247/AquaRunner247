import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { calculateGallons, type VolumeShapeKey } from "@/lib/volume-calculator";
import { computeAndSaveDosingRecommendation } from "@/lib/dosing-calculator";
import { VolumeShape } from "@/generated/prisma/client";

type VolumePayload = {
  shape?: string;
  lengthFt?: number | null;
  widthFt?: number | null;
  radiusFt?: number | null;
  shallowDepthFt?: number | null;
  deepDepthFt?: number | null;
  freeformMeasurementA?: number | null;
  freeformMeasurementB?: number | null;
  shallowSectionLengthFt?: number | null;
  shallowSectionWidthFt?: number | null;
  shallowSectionDepthFt?: number | null;
  deepSectionLengthFt?: number | null;
  deepSectionWidthFt?: number | null;
  deepSectionDepthFt?: number | null;
};

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lets a technician calculate and set a body of water's volume mid-visit, when no admin
 * configured one ahead of time -- otherwise the Dosing Card has nothing to show and no
 * path forward, even though the tech is standing at the pool with a tape measure. Separate
 * from the admin-only saveVolumeCalculation server action (customers/[id]/actions.ts) --
 * that action's ADMIN-only permission model is untouched; this route uses the same
 * three-way visit-access check as reading/route.ts (ADMIN/OFFICE/the visit's own
 * technician), since it's a field action tied to a specific visit, not a general property
 * edit.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;
  const visit = await prisma.serviceVisit.findUnique({
    where: { id },
    select: { id: true, organizationId: true, technicianId: true, bodyOfWaterId: true },
  });
  if (!visit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const canEdit =
    appUser.organizationId === visit.organizationId &&
    (appUser.role === "ADMIN" || appUser.role === "OFFICE" || visit.technicianId === appUser.id);
  if (!canEdit) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  let raw: VolumePayload;
  try {
    raw = (await request.json()) as VolumePayload;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const shapeRaw = String(raw.shape ?? "").trim();
  const shape = (Object.values(VolumeShape) as string[]).includes(shapeRaw) ? (shapeRaw as VolumeShapeKey) : "RECTANGLE";

  const dims = {
    lengthFt: numOrNull(raw.lengthFt),
    widthFt: numOrNull(raw.widthFt),
    radiusFt: numOrNull(raw.radiusFt),
    shallowDepthFt: numOrNull(raw.shallowDepthFt),
    deepDepthFt: numOrNull(raw.deepDepthFt),
    freeformMeasurementA: numOrNull(raw.freeformMeasurementA),
    freeformMeasurementB: numOrNull(raw.freeformMeasurementB),
    shallowSectionLengthFt: numOrNull(raw.shallowSectionLengthFt),
    shallowSectionWidthFt: numOrNull(raw.shallowSectionWidthFt),
    shallowSectionDepthFt: numOrNull(raw.shallowSectionDepthFt),
    deepSectionLengthFt: numOrNull(raw.deepSectionLengthFt),
    deepSectionWidthFt: numOrNull(raw.deepSectionWidthFt),
    deepSectionDepthFt: numOrNull(raw.deepSectionDepthFt),
  };

  // Never trust a client-submitted gallons number -- recompute server-side, same posture
  // as the admin saveVolumeCalculation action.
  const gallons = calculateGallons({ shape, ...dims });
  if (gallons == null) return NextResponse.json({ error: "INVALID_DIMENSIONS" }, { status: 400 });

  await prisma.$transaction([
    prisma.volumeCalculation.upsert({
      where: { bodyOfWaterId: visit.bodyOfWaterId },
      create: { bodyOfWaterId: visit.bodyOfWaterId, shape, ...dims, calculatedGallons: gallons, lastCalculatedAt: new Date() },
      update: { shape, ...dims, calculatedGallons: gallons, lastCalculatedAt: new Date() },
    }),
    prisma.bodyOfWater.update({ where: { id: visit.bodyOfWaterId }, data: { volumeGallons: gallons } }),
  ]);

  // No-ops (returns null) if this visit has no reading yet -- nothing to compute a
  // recommendation against. The tech will get normal dosing behavior once they do save a
  // reading, now that volume exists.
  const dosing = await computeAndSaveDosingRecommendation(visit.id);

  return NextResponse.json({ ok: true, calculatedGallons: gallons, dosing });
}
