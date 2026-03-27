import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

type DosePayload = {
  productName?: string;
  quantity?: number;
  unit?: string;
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
  const productName = body.productName?.trim() ?? "";
  const unit = body.unit?.trim() ?? "";
  const quantity = Number(body.quantity);
  if (!productName || !unit || !Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "INVALID_DOSE" }, { status: 400 });
  }

  const dose = await prisma.visitChemicalDose.create({
    data: {
      visitId: id,
      productName,
      quantity,
      unit,
    },
  });

  return NextResponse.json({ ok: true, dose });
}
