import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

type DosePayload = {
  chemicalProductId?: string;
  quantity?: number;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;
  const visit = await prisma.serviceVisit.findUnique({
    where: { id },
    select: { id: true, technicianId: true, organizationId: true, status: true },
  });
  if (!visit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const canEdit =
    appUser.organizationId === visit.organizationId &&
    (appUser.role === "ADMIN" || appUser.role === "OFFICE" || visit.technicianId === appUser.id);
  if (!canEdit) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (visit.status === "COMPLETED") {
    return NextResponse.json({ error: "VISIT_ALREADY_COMPLETED" }, { status: 400 });
  }

  const body = (await request.json()) as DosePayload;
  const chemicalProductId = body.chemicalProductId?.trim() ?? "";
  const quantity = Number(body.quantity);
  if (!chemicalProductId || !Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "INVALID_DOSE" }, { status: 400 });
  }

  const product = await prisma.chemicalProduct.findFirst({
    where: { id: chemicalProductId, organizationId: visit.organizationId },
    select: { id: true, name: true, unit: true, costPerUnit: true, chargePerUnit: true },
  });
  if (!product) return NextResponse.json({ error: "INVALID_PRODUCT" }, { status: 400 });

  const dose = await prisma.visitChemicalDose.create({
    data: {
      visitId: id,
      chemicalProductId: product.id,
      productName: product.name,
      unit: product.unit,
      quantity,
      unitCost: product.costPerUnit,
      unitCharge: product.chargePerUnit,
    },
  });

  return NextResponse.json({ ok: true, dose });
}
