import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { readJsonBody } from "@/lib/api/request-body";

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

  const parsed = await readJsonBody<DosePayload>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
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

  /**
   * Idempotency window. An identical dose -- same visit, same product, same quantity -- logged again
   * within a minute is a repeat of one request, not a second pour.
   *
   * Two things produce that, and the second cannot be fixed on the client. A technician on a slow
   * connection taps Add dose again because nothing visibly happened (the button is now disabled while
   * in flight, which covers this one). And lib/client/offline-queue.ts is at-least-once: if the POST
   * reaches the server but the response is lost, the fetch throws, the request is queued, and the
   * replay writes a second row. Seen live at Ritiro on 2026-10-01 -- three 2-gallon rows of Liquid
   * Chlorine inside one second, which charged the customer 41.94 instead of 13.98 and reported 6
   * gallons of usage instead of 2.
   *
   * A minute is chosen so a genuine second pour is never swallowed: a technician adding more chlorine
   * would enter a larger quantity, not the same amount twice inside a minute. Returns the existing
   * row so the client's optimistic list still gets a real dose id.
   */
  const recent = await prisma.visitChemicalDose.findFirst({
    where: {
      visitId: id,
      chemicalProductId: product.id,
      quantity,
      createdAt: { gte: new Date(Date.now() - 60_000) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    return NextResponse.json({ ok: true, dose: recent, deduplicated: true });
  }

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
