import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { readJsonBody } from "@/lib/api/request-body";

type StatusPayload = { status?: "SCHEDULED" | "CANCELLED" };

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

  const parsed = await readJsonBody<StatusPayload>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  if (body.status !== "SCHEDULED" && body.status !== "CANCELLED") {
    return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });
  }

  const updated = await prisma.serviceVisit.update({
    where: { id },
    data: { status: body.status },
    select: { id: true, status: true },
  });

  return NextResponse.json({ ok: true, visit: updated });
}
