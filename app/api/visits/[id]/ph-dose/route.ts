import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { computePhDose } from "@/lib/dosing-calculator";

/**
 * pH has no ppm-delta dose formula (see lib/dosing-calculator.ts's module doc comment) --
 * this endpoint exists solely to turn a technician-entered Base/Acid Demand drop count
 * into a dose, using the org's primary pH product for whichever direction is needed. The
 * drop count itself is never persisted; this is a pure calculation on each call.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;
  const visit = await prisma.serviceVisit.findUnique({
    where: { id },
    select: { organizationId: true, bodyOfWater: { select: { volumeGallons: true } } },
  });
  if (!visit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (visit.organizationId !== appUser.organizationId) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  let body: { drops?: number; direction?: "RAISE" | "LOWER" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const drops = Number(body.drops);
  const direction = body.direction;
  if (!Number.isFinite(drops) || drops <= 0 || (direction !== "RAISE" && direction !== "LOWER")) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const chemicalType = direction === "RAISE" ? "PH_UP" : "PH_DOWN";
  const setting = await prisma.orgChemicalProductSetting.findFirst({
    where: { organizationId: appUser.organizationId, isEnabled: true, catalogProduct: { chemicalType } },
    orderBy: { isPrimary: "desc" },
    include: { catalogProduct: true },
  });
  if (!setting) {
    return NextResponse.json({ error: "NO_PRODUCT_CONFIGURED" }, { status: 400 });
  }

  const gallons = visit.bodyOfWater.volumeGallons != null ? Number(visit.bodyOfWater.volumeGallons) : null;
  const result = computePhDose(drops, setting.catalogProduct, gallons);
  if (!result) return NextResponse.json({ error: "NO_VOLUME_CONFIGURED" }, { status: 400 });

  return NextResponse.json({ ok: true, ...result });
}
