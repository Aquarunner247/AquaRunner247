import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { timeZoneForState, ymdInTimeZone } from "@/lib/timezone";
import { MOVE_REFUSAL_MESSAGE, nextWorkingDayAnchor, refusalForMove } from "@/lib/visit-reschedule";

/**
 * Moves a stop to the next day its technician works, for when it genuinely cannot be done today.
 *
 * Until now the only ways out were to leave it (the nightly sweep marks it Pushed, which records
 * that nobody did it but does not reschedule anything) or to skip it (CANCELLED, which says it is
 * not happening at all). Neither covers the ordinary case: locked gate, dog in the yard, ran out of
 * daylight -- come back tomorrow.
 *
 * Same visit row, moved. Not a cancel-and-recreate: the row carries the body of water, the
 * technician and the route position already, and keeping it means the stop has one history rather
 * than a cancelled ghost beside a new one.
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

  const moved = await prisma.serviceVisit.update({
    where: { id: visit.id },
    data: {
      scheduledStart,
      scheduledEnd,
      // A clean stop tomorrow. It did not happen today, so nothing about today should survive:
      // leaving startedAt set would make tomorrow's visit span two days, which is what the service
      // report prints time on site from, and leaving pushedAt set would have it read "Pushed"
      // tomorrow while somebody is standing at it.
      status: "SCHEDULED",
      startedAt: null,
      pushedAt: null,
      arrivalLatitude: null,
      arrivalLongitude: null,
      arrivalAccuracyMeters: null,
      /**
       * Detached from the recurring stop that generated it, deliberately.
       *
       * lib/visit-generation.ts treats "a visit exists for this recurringStopId on this day" as
       * already generated. A moved visit keeping its link would therefore SUPPRESS tomorrow's own
       * scheduled visit for the same body -- silently, for any property serviced two days running.
       * Detaching makes this a one-off make-up stop and leaves tomorrow's schedule intact. If that
       * produces two stops at one body tomorrow, the technician can see both and skip one; a stop
       * that quietly vanished is the worse failure.
       */
      recurringStopId: null,
    },
    select: { id: true, scheduledStart: true, status: true },
  });

  return NextResponse.json({ ok: true, visit: moved });
}
