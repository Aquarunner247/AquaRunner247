import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

type ReorderPayload = { stopIds?: string[] };

export async function PATCH(request: Request, context: { params: Promise<{ routeId: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (appUser.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { routeId } = await context.params;
  const body = (await request.json()) as ReorderPayload;
  const stopIds = Array.isArray(body.stopIds) ? body.stopIds : [];
  if (stopIds.length === 0) return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });

  const stops = await prisma.recurringStop.findMany({
    where: { id: { in: stopIds }, routeId, route: { organizationId: appUser.organizationId } },
    select: { id: true },
  });
  if (stops.length !== stopIds.length) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  await prisma.$transaction(stopIds.map((id, index) => prisma.recurringStop.update({ where: { id }, data: { sortOrder: index } })));

  return NextResponse.json({ ok: true });
}
