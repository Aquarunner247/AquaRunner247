import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;
  const visit = await prisma.serviceVisit.findUnique({
    where: { id },
    select: { id: true, technicianId: true, organizationId: true, status: true, startedAt: true },
  });
  if (!visit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const canEdit =
    appUser.organizationId === visit.organizationId &&
    (appUser.role === "ADMIN" || appUser.role === "OFFICE" || visit.technicianId === appUser.id);
  if (!canEdit) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (visit.startedAt || visit.status === "COMPLETED" || visit.status === "CANCELLED") {
    return NextResponse.json({ ok: true, visit: { id: visit.id, startedAt: visit.startedAt, status: visit.status } });
  }

  const updated = await prisma.serviceVisit.update({
    where: { id },
    data: {
      startedAt: new Date(),
      status: visit.status === "SCHEDULED" ? "IN_PROGRESS" : visit.status,
    },
    select: { id: true, startedAt: true, status: true },
  });

  return NextResponse.json({ ok: true, visit: updated });
}
