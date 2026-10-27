import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { timeZoneForState, ymdInTimeZone, localDayBounds } from "@/lib/timezone";
import { nextRouteSequenceForDay } from "@/lib/day-sequence";
import { MOVE_REFUSAL_MESSAGE, nextWorkingDayAnchor, refusalForMove } from "@/lib/visit-reschedule";

/**
 * Moves a stop to the next day its technician works, for when it genuinely cannot be done today.
 *
 * Until now the only ways out were to leave it (the nightly sweep marks it Pushed, which records
 * that nobody did it but does not reschedule anything) or to skip it (CANCELLED, which says it is
 * not happening at all). Neither covers the ordinary case: locked gate, dog in the yard, ran out of
 * daylight -- come back tomorrow.
 *
 * Same visit row, moved. Not a cancel-and-recreate: the row carries the body of water and the
 * technician already, and keeping it means the stop has one history rather than a cancelled ghost
 * beside a new one.
 *
 * The route position does NOT carry across. `routeSequence` is scoped to one technician's one
 * day, so the source day's number is meaningless on the target day and actively harmful there --
 * see lib/day-sequence.ts for the collision it caused on 2026-10-22.
 */
export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;
  const visit = await prisma.serviceVisit.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      technicianId: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      propertyId: true,
      bodyOfWaterId: true,
      routeSequence: true,
      organization: { select: { state: true } },
      reading: { select: { id: true } },
      _count: { select: { doses: true, photos: true } },
    },
  });
  if (!visit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const canEdit =
    appUser.organizationId === visit.organizationId &&
    (appUser.role === "ADMIN" || appUser.role === "OFFICE" || visit.technicianId === appUser.id);
  if (!canEdit) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const refusal = refusalForMove({
    status: visit.status,
    hasReading: visit.reading != null,
    doseCount: visit._count.doses,
    photoCount: visit._count.photos,
  });
  if (refusal) {
    return NextResponse.json({ error: refusal, message: MOVE_REFUSAL_MESSAGE[refusal] }, { status: 400 });
  }

  /**
   * The days THIS technician works, from their own active recurring routes.
   *
   * Per technician, not per organization, because they differ here: two run Monday to Saturday
   * while a third runs Friday and Sunday. A Saturday stop should land on Monday for the first two
   * and on Sunday for the third, and only the assigned technician's own routes say which.
   *
   * Falls back to the organization's days when the technician has none (an unassigned visit, or
   * somebody newly added), and `nextWorkingDayAnchor` falls back again to the plain next day when
   * even that is empty. A stop that cannot be moved at all is the worst outcome of the three.
   */
  const timeZone = timeZoneForState(visit.organization.state);

  /**
   * Live routes only. A route carries a service window (startsOn/endsOn, @db.Date) and
   * lib/visit-generation.ts honours it, so a route whose window has passed generates nothing and
   * must not count as a day anybody works. Three expired one-day routes exist in production right
   * now; without this they would make Friday a working day for the account that owns them.
   *
   * Compared against UTC midnight of today's local Y-M-D, not against a raw Date -- startsOn and
   * endsOn come back as UTC midnight of a calendar date, and comparing them to an instant would be
   * off by the organization's offset, enough to include or exclude a whole boundary day. Same
   * reasoning, and the same construction, as visit-generation's own window check.
   */
  const todayUtcMidnight = new Date(`${ymdInTimeZone(new Date(), timeZone)}T00:00:00.000Z`);
  const liveWindow = {
    active: true,
    dayOfWeek: { not: null },
    AND: [
      { OR: [{ startsOn: null }, { startsOn: { lte: todayUtcMidnight } }] },
      { OR: [{ endsOn: null }, { endsOn: { gte: todayUtcMidnight } }] },
    ],
  };

  const routes = await prisma.recurringRoute.findMany({
    where: {
      organizationId: visit.organizationId,
      ...liveWindow,
      ...(visit.technicianId ? { technicianId: visit.technicianId } : {}),
    },
    select: { dayOfWeek: true },
  });
  let workingWeekdays = new Set(routes.map((r) => r.dayOfWeek).filter((d): d is number => d != null));
  if (workingWeekdays.size === 0 && visit.technicianId) {
    const orgRoutes = await prisma.recurringRoute.findMany({
      where: { organizationId: visit.organizationId, ...liveWindow },
      select: { dayOfWeek: true },
    });
    workingWeekdays = new Set(orgRoutes.map((r) => r.dayOfWeek).filter((d): d is number => d != null));
  }

  const scheduledStart = nextWorkingDayAnchor(visit.scheduledStart, timeZone, workingWeekdays);
  const scheduledEnd = visit.scheduledEnd ? nextWorkingDayAnchor(visit.scheduledEnd, timeZone, workingWeekdays) : null;

  /**
   * A new visit on the target day, and the original left where it was, marked as moved.
   *
   * Not a relocation of the same row, which is what shipped first and was wrong: moving it left
   * the recurring stop with no visit on the original day, and lib/visit-generation.ts creates one
   * whenever that is true. Cornerstone Park's Pool 2 was moved to Tuesday and regenerated on
   * Monday hours later, so the stop the technician had just moved was back on their list.
   *
   * Leaving the row behind also answers the other half: the original day keeps an honest record
   * that the stop was scheduled and did not happen, which is what the schedule now shows as Moved.
   */
  const moved = await prisma.$transaction(async (tx) => {
    /**
     * A position at the END of the target day, never the source day's number.
     *
     * Read inside the transaction so it cannot race another move onto the same day. An
     * unassigned visit has no day list to join, so it keeps no position at all.
     */
    const { start: targetDayStart, end: targetDayEnd } = localDayBounds(
      ymdInTimeZone(scheduledStart, timeZone),
      timeZone,
    );
    const routeSequence = visit.technicianId
      ? await nextRouteSequenceForDay(tx, {
          organizationId: visit.organizationId,
          technicianId: visit.technicianId,
          dayStart: targetDayStart,
          dayEnd: targetDayEnd,
        })
      : undefined;

    const created = await tx.serviceVisit.create({
      data: {
        organizationId: visit.organizationId,
        propertyId: visit.propertyId,
        bodyOfWaterId: visit.bodyOfWaterId,
        technicianId: visit.technicianId,
        routeSequence,
        scheduledStart,
        scheduledEnd,
        status: "SCHEDULED",
        /**
         * Detached from the recurring stop, deliberately.
         *
         * Generation treats "a visit exists for this recurring stop on this day" as already
         * generated, so linking the new one would SUPPRESS the target day's own scheduled visit
         * for any property serviced two days running. Detached, this is a one-off make-up stop and
         * the target day's schedule is untouched. Two stops at one body is visible and skippable;
         * one that quietly vanished is not.
         */
        recurringStopId: null,
        // `movedFrom` already records that this is a move; this records who made it.
        createdById: appUser.id,
      },
      select: { id: true, scheduledStart: true },
    });

    await tx.serviceVisit.update({
      where: { id: visit.id },
      data: { status: "CANCELLED", movedToVisitId: created.id },
    });

    return created;
  });

  return NextResponse.json({ ok: true, visit: { id: moved.id, scheduledStart: moved.scheduledStart } });
}
