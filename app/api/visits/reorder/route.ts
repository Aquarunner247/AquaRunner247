import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

type ReorderItem = { kind: "visit" | "adhoc"; id: string };
type ReorderPayload = { items?: ReorderItem[] };

export async function PATCH(request: Request) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = (await request.json()) as ReorderPayload;
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });

  const visitIds = items.filter((i) => i.kind === "visit").map((i) => i.id);
  const adHocIds = items.filter((i) => i.kind === "adhoc").map((i) => i.id);

  const [visits, adHocStops] = await Promise.all([
    visitIds.length
      ? prisma.serviceVisit.findMany({ where: { id: { in: visitIds }, organizationId: appUser.organizationId }, select: { id: true, technicianId: true } })
      : Promise.resolve([]),
    adHocIds.length
      ? prisma.adHocStop.findMany({ where: { id: { in: adHocIds }, organizationId: appUser.organizationId }, select: { id: true, technicianId: true } })
      : Promise.resolve([]),
  ]);

  const canEditAll =
    appUser.role === "ADMIN" ||
    appUser.role === "OFFICE" ||
    (visits.every((v) => v.technicianId === appUser.id) && adHocStops.every((s) => s.technicianId === appUser.id));
  if (!canEditAll || visits.length !== visitIds.length || adHocStops.length !== adHocIds.length) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // Index into the combined payload is the new routeSequence for whichever table each item
  // belongs to -- a single shared sequence space per technician/day (not two independent
  // counters), which is what makes an ad-hoc stop's position among real visits unambiguous.
  await prisma.$transaction(
    items.map((item, index) =>
      item.kind === "visit"
        ? prisma.serviceVisit.update({ where: { id: item.id }, data: { routeSequence: index } })
        : prisma.adHocStop.update({ where: { id: item.id }, data: { routeSequence: index } }),
    ),
  );

  return NextResponse.json({ ok: true });
}
