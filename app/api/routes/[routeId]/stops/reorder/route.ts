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

  // Sorted by id before execution, not left in payload order: a $transaction takes its row
  // locks in array order, so two overlapping reorders of the same route would lock the same
  // rows in opposite orders and deadlock, losing one of the drags. Same fix as
  // api/visits/reorder. `index` is captured from the payload position first, so the saved
  // sortOrder is unchanged.
  const updates = stopIds
    .map((id, index) => ({ id, index }))
    .sort((a, b) => a.id.localeCompare(b.id));

  /**
   * Only the route is written here.
   *
   * This used to also renumber every generated day, which is where two of this week's bugs lived:
   * writing one route's positions onto a day that holds other work collided with it, and the rule
   * about which days qualified kept needing exceptions. Days now re-derive from the route when
   * they are next viewed (alignDaysToRoutes in lib/visit-generation.ts), so there is one place
   * that decides a day's order instead of two that had to agree.
   *
   * The cost is that a day already open elsewhere shows the old order until it reloads, which is
   * true of every other change on that screen too.
   */
  await prisma.$transaction(
    updates.map(({ id, index }) => prisma.recurringStop.update({ where: { id }, data: { sortOrder: index } })),
  );

  return NextResponse.json({ ok: true });
}
