import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

type ReorderPayload = { visitIds?: string[] };

export async function PATCH(request: Request) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = (await request.json()) as ReorderPayload;
  const visitIds = Array.isArray(body.visitIds) ? body.visitIds : [];
  if (visitIds.length === 0) return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });

  const visits = await prisma.serviceVisit.findMany({
    where: { id: { in: visitIds }, organizationId: appUser.organizationId },
    select: { id: true, technicianId: true },
  });

  const canEditAll =
    appUser.role === "ADMIN" ||
    appUser.role === "OFFICE" ||
    visits.every((v) => v.technicianId === appUser.id);
  if (!canEditAll || visits.length !== visitIds.length) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  await prisma.$transaction(
    visitIds.map((id, index) =>
      prisma.serviceVisit.update({ where: { id }, data: { routeSequence: index } }),
    ),
  );

  return NextResponse.json({ ok: true });
}
