import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { localDayBounds, timeZoneForState, ymdInTimeZone } from "@/lib/timezone";

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
   * Days already generated have to follow, or this screen quietly stops being the source of truth.
   *
   * visit-generation copies sortOrder into ServiceVisit.routeSequence ONCE, when it first creates
   * the day's visits (lib/visit-generation.ts). A day is generated the first time anybody opens
   * the schedule for it, which for a recurring route is usually well before the day arrives -- so
   * by the time a route is reordered here, next week's visits already exist carrying the old
   * order, and nothing afterwards ever revisited them. Reported 2026-10-16 on Rich's Friday:
   * eleven stops reordered in the builder, all eleven still in the previous order on the schedule
   * for both that day and the following Friday.
   *
   * Scoped deliberately:
   *
   *   - Today and later only. A past day is a record of what happened in the order it happened.
   *   - SCHEDULED only. A stop someone has arrived at, finished, skipped or moved is no longer
   *     waiting to be ordered, and renumbering it would rewrite the day under a technician who is
   *     working it. On today's route that means the untouched stops re-order and the ones already
   *     dealt with keep their place.
   *
   * In the same transaction as the sortOrder writes, and over the same id-sorted list, so the two
   * can never disagree and the lock-ordering argument above still holds.
   */
  const organization = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { state: true },
  });
  const timeZone = timeZoneForState(organization?.state);
  const { start: todayStart } = localDayBounds(ymdInTimeZone(new Date(), timeZone), timeZone);

  await prisma.$transaction(
    updates.flatMap(({ id, index }) => [
      prisma.recurringStop.update({ where: { id }, data: { sortOrder: index } }),
      prisma.serviceVisit.updateMany({
        where: { recurringStopId: id, status: "SCHEDULED", scheduledStart: { gte: todayStart } },
        data: { routeSequence: index },
      }),
    ]),
  );

  return NextResponse.json({ ok: true });
}
