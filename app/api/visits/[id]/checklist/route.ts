import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { readJsonBody } from "@/lib/api/request-body";

type ChecklistPayload = {
  checklistItemId?: string;
  completed?: boolean;
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
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

  const parsed = await readJsonBody<ChecklistPayload>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const checklistItemId = body.checklistItemId?.trim() ?? "";
  const completed = Boolean(body.completed);
  if (!checklistItemId) return NextResponse.json({ error: "INVALID_ITEM" }, { status: 400 });

  const item = await prisma.checklistItemDefinition.findFirst({
    where: { id: checklistItemId, organizationId: visit.organizationId },
    select: { id: true, label: true, billable: true, chargeAmount: true },
  });
  if (!item) return NextResponse.json({ error: "INVALID_ITEM" }, { status: 400 });

  /**
   * The price is snapshotted at the moment it is ticked, exactly as `label` already is and as
   * VisitChemicalDose does with unitCharge: raising the price of a filter clean next month must not
   * rewrite what a visit last month charged for one.
   *
   * Cleared when the item is un-ticked, so an accidental tap leaves no charge behind. Only a
   * billable item carries one at all.
   */
  const chargeAmount = completed && item.billable ? item.chargeAmount : null;

  const completion = await prisma.visitChecklistCompletion.upsert({
    where: { visitId_checklistItemId: { visitId: id, checklistItemId: item.id } },
    create: { visitId: id, checklistItemId: item.id, label: item.label, completed, chargeAmount },
    update: { completed, label: item.label, chargeAmount },
  });

  return NextResponse.json({ ok: true, completion });
}
