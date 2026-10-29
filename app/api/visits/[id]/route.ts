import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { visitDeletionRefusal, DELETION_REFUSAL_MESSAGE } from "@/lib/visit-deletable";

/**
 * Delete a stop somebody added by hand and immediately regretted.
 *
 * The narrow case only. Skipping remains the answer for everything the route generated, because
 * a scheduled stop nobody serviced is a miss and "Skipped" is the record of it -- lib/visit-
 * deletable.ts holds the rules and the reasoning for each refusal.
 *
 * This exists because of 2026-10-29: a double-tap on Add stop put three identical OYO stops on a
 * technician's day, and the only tool in the product would have left three misleading skips
 * behind. Undoing it needed a hand-written DELETE against production, which is not a thing an
 * operator should ever need for a mistyped stop.
 *
 * ADMIN and OFFICE only. A technician deleting their own stops could quietly shorten their day,
 * and the whole value of the schedule is that it is a record rather than a to-do list.
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (appUser.role !== "ADMIN" && appUser.role !== "OFFICE") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await context.params;
  const visit = await prisma.serviceVisit.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      recurringStopId: true,
      createdById: true,
      status: true,
      startedAt: true,
      completedAt: true,
      movedFrom: { select: { id: true } },
      // `reading` is a one-to-one, so it cannot go through _count like the lists can.
      reading: { select: { visitId: true } },
      _count: { select: { doses: true, photos: true } },
    },
  });
  if (!visit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (visit.organizationId !== appUser.organizationId) {
    // Same shape as a missing row on purpose: whether another organization's visit exists is
    // not something this endpoint should confirm.
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const refusal = visitDeletionRefusal({
    recurringStopId: visit.recurringStopId,
    createdById: visit.createdById,
    status: visit.status,
    startedAt: visit.startedAt,
    completedAt: visit.completedAt,
    childRecordCount: (visit.reading ? 1 : 0) + visit._count.doses + visit._count.photos,
    movedFromId: visit.movedFrom?.id ?? null,
  });
  if (refusal) {
    return NextResponse.json({ error: refusal, message: DELETION_REFUSAL_MESSAGE[refusal] }, { status: 409 });
  }

  /**
   * Guarded on the same conditions the rule just checked.
   *
   * Between the read above and this write, a technician could have arrived at the stop -- GPS
   * auto-arrival fires from a background watcher without anybody tapping anything, so this race
   * is real rather than theoretical. deleteMany with the conditions inline means that loses
   * safely: zero rows deleted, and the caller is told why.
   */
  const deleted = await prisma.serviceVisit.deleteMany({
    where: {
      id: visit.id,
      organizationId: appUser.organizationId,
      recurringStopId: null,
      createdById: { not: null },
      status: "SCHEDULED",
      startedAt: null,
      completedAt: null,
    },
  });

  if (deleted.count === 0) {
    return NextResponse.json(
      { error: "already-started", message: DELETION_REFUSAL_MESSAGE["already-started"] },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, deleted: visit.id });
}
