import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { addDaysToYmd, localDayBounds, timeZoneForState, ymdInTimeZone } from "@/lib/timezone";

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
   * the day's visits (lib/visit-generation.ts). A day is generated the first time anybody opens the
   * schedule for it, which for a recurring route is usually well before the day arrives -- so by the
   * time a route is reordered here, next week's visits already exist carrying the old order, and
   * nothing afterwards ever revisited them.
   *
   * Only days that are ENTIRELY this route get renumbered. routeSequence is one sequence space
   * shared by every visit and errand on a technician's day (see AdHocStop.routeSequence), not a
   * per-route one, so writing this route's 0..N positions onto a day that also holds other work
   * collides with the numbers that work already occupies. The first version of this did exactly
   * that: Rich's Friday also carries Ritiro and Fifty101, and four pairs of stops ended up sharing
   * a position, leaving their order to the scheduledStart tiebreak.
   *
   * So a day qualifies only when every visit on it belongs to this route, every one is still
   * SCHEDULED, and there are no errands -- which is what an untouched future recurring day looks
   * like. A day someone has started, added to, or rearranged keeps what it has, and the schedule's
   * own Optimize is the tool for those: it renumbers the whole day across both tables at once.
   */
  const organization = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { state: true },
  });
  const timeZone = timeZoneForState(organization?.state);
  const todayYmd = ymdInTimeZone(new Date(), timeZone);
  // Strictly after today. A day in progress is the technician's, not this screen's.
  const tomorrowStart = localDayBounds(addDaysToYmd(todayYmd, 1), timeZone).start;

  const ourVisits = await prisma.serviceVisit.findMany({
    where: { recurringStopId: { in: stopIds }, scheduledStart: { gte: tomorrowStart } },
    select: { id: true, recurringStopId: true, scheduledStart: true, technicianId: true, status: true },
  });

  if (ourVisits.length > 0) {
    const dayKey = (technicianId: string | null, at: Date) => `${technicianId ?? "none"}|${ymdInTimeZone(at, timeZone)}`;
    const touchedDays = new Set(ourVisits.map((v) => dayKey(v.technicianId, v.scheduledStart)));
    const technicianIds = [...new Set(ourVisits.map((v) => v.technicianId).filter((id): id is string => id != null))];
    const windowStart = new Date(Math.min(...ourVisits.map((v) => v.scheduledStart.getTime())));
    const windowEnd = new Date(Math.max(...ourVisits.map((v) => v.scheduledStart.getTime())) + 24 * 60 * 60 * 1000);

    // Everything else those technicians have on those days, so a day can be judged whole.
    const [allVisits, errands] = await Promise.all([
      prisma.serviceVisit.findMany({
        where: { technicianId: { in: technicianIds }, scheduledStart: { gte: windowStart, lt: windowEnd } },
        select: { recurringStopId: true, scheduledStart: true, technicianId: true, status: true },
      }),
      prisma.adHocStop.findMany({
        where: { technicianId: { in: technicianIds }, scheduledDate: { gte: windowStart, lt: windowEnd } },
        select: { scheduledDate: true, technicianId: true },
      }),
    ]);

    const disqualified = new Set<string>();
    for (const v of allVisits) {
      const key = dayKey(v.technicianId, v.scheduledStart);
      if (!touchedDays.has(key)) continue;
      const ours = v.recurringStopId != null && stopIds.includes(v.recurringStopId);
      if (!ours || v.status !== "SCHEDULED") disqualified.add(key);
    }
    for (const e of errands) disqualified.add(dayKey(e.technicianId, e.scheduledDate));

    const newIndexByStop = new Map(updates.map(({ id, index }) => [id, index]));
    const renumber = ourVisits
      .filter((v) => !disqualified.has(dayKey(v.technicianId, v.scheduledStart)))
      .map((v) => ({ id: v.id, index: newIndexByStop.get(v.recurringStopId!)! }))
      .sort((a, b) => a.id.localeCompare(b.id));

    await prisma.$transaction([
      ...updates.map(({ id, index }) => prisma.recurringStop.update({ where: { id }, data: { sortOrder: index } })),
      ...renumber.map(({ id, index }) => prisma.serviceVisit.update({ where: { id }, data: { routeSequence: index } })),
    ]);
    return NextResponse.json({ ok: true, daysRenumbered: touchedDays.size - disqualified.size });
  }

  await prisma.$transaction(updates.map(({ id, index }) => prisma.recurringStop.update({ where: { id }, data: { sortOrder: index } })));

  return NextResponse.json({ ok: true });
}
