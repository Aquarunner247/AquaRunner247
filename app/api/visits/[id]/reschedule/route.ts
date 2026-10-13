import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { timeZoneForState } from "@/lib/timezone";
import { MOVE_REFUSAL_MESSAGE, nextDayAnchor, refusalForMove } from "@/lib/visit-reschedule";

/**
 * Moves a stop to the next day, for when it genuinely cannot be done today.
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

  const timeZone = timeZoneForState(visit.organization.state);
  const scheduledStart = nextDayAnchor(visit.scheduledStart, timeZone);
  const scheduledEnd = visit.scheduledEnd ? nextDayAnchor(visit.scheduledEnd, timeZone) : null;

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
