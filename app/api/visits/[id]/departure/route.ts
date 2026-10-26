import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

/**
 * Records that the technician left a stop they had arrived at.
 *
 * The device decides this, not the server: the background watcher in route-day-view.tsx is the
 * only thing that sees the stream of positions, and lib/departure-detection.ts holds the rule.
 * By the time this is called the decision has already been made, so this endpoint's whole job is
 * to check that the caller is allowed to make it and that the claim is still coherent.
 *
 * NO LOCATION IN THE BODY, deliberately, unlike the arrival route. Arrival stores a fix because
 * "where did this reading come from" is a real question; departure answers "how long were they
 * there", which a timestamp alone answers completely. Sending a position would be collecting
 * something nothing reads, and would widen what the Privacy Policy has to promise.
 *
 * Idempotent. The watcher may fire more than once -- a retry, a remount, two fixes landing
 * together -- and the FIRST departure is the true one: a later call would push the time outward
 * and quietly lengthen the visit. So an already-departed stop returns its existing value and
 * changes nothing.
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
      startedAt: true,
      completedAt: true,
      departedAt: true,
    },
  });
  if (!visit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const canEdit =
    appUser.organizationId === visit.organizationId &&
    (appUser.role === "ADMIN" || appUser.role === "OFFICE" || visit.technicianId === appUser.id);
  if (!canEdit) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  // Already recorded: return it rather than overwrite. See the idempotency note above.
  if (visit.departedAt != null) {
    return NextResponse.json({ ok: true, departedAt: visit.departedAt, alreadyRecorded: true });
  }

  // Nothing to leave. A stop that was never arrived at has no departure, and one already
  // completed has a better end time than this.
  if (visit.startedAt == null || visit.completedAt != null) {
    return NextResponse.json({ ok: false, reason: "NOT_IN_PROGRESS" }, { status: 409 });
  }

  const departedAt = new Date();

  // Refuse a departure that precedes arrival. Cannot happen from the watcher, but a clock set
  // wrong on a device would otherwise write a negative duration into a customer's report.
  if (departedAt.getTime() < visit.startedAt.getTime()) {
    return NextResponse.json({ ok: false, reason: "BEFORE_ARRIVAL" }, { status: 409 });
  }

  // Guarded on departedAt still being null, so two requests racing cannot both write: the
  // second updates zero rows and reads back the first one's value.
  const updated = await prisma.serviceVisit.updateMany({
    where: { id: visit.id, departedAt: null },
    data: { departedAt },
  });
  if (updated.count === 0) {
    const current = await prisma.serviceVisit.findUnique({ where: { id: visit.id }, select: { departedAt: true } });
    return NextResponse.json({ ok: true, departedAt: current?.departedAt ?? null, alreadyRecorded: true });
  }

  return NextResponse.json({ ok: true, departedAt });
}
