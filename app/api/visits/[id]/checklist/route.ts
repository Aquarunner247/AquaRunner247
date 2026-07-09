import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

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

  const body = (await request.json()) as ChecklistPayload;
  const checklistItemId = body.checklistItemId?.trim() ?? "";
  const completed = Boolean(body.completed);
  if (!checklistItemId) return NextResponse.json({ error: "INVALID_ITEM" }, { status: 400 });

  const item = await prisma.checklistItemDefinition.findFirst({
    where: { id: checklistItemId, organizationId: visit.organizationId },
    select: { id: true, label: true },
  });
  if (!item) return NextResponse.json({ error: "INVALID_ITEM" }, { status: 400 });

  const completion = await prisma.visitChecklistCompletion.upsert({
    where: { visitId_checklistItemId: { visitId: id, checklistItemId: item.id } },
    create: { visitId: id, checklistItemId: item.id, label: item.label, completed },
    update: { completed, label: item.label },
  });

  return NextResponse.json({ ok: true, completion });
}
