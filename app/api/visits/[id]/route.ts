import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { visitDeletionRefusal, DELETION_REFUSAL_MESSAGE } from "@/lib/visit-deletable";
import { getVisitFormData } from "@/lib/visit-form-data";
import type { VisitWire } from "@/lib/field-wire";

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

/**
 * GET /api/visits/[id] -- one stop, as the props its form already takes.
 *
 * Phase 1b of NATIVE-REBUILD-PLAN.md. Returns the assembled form props rather than raw Prisma
 * rows, from the same lib/visit-form-data.ts that app/dashboard/visits/[id]/page.tsx renders
 * from. That is the point: `readingFields` is derived from the organization's compliance ruleset,
 * and a second copy of that derivation living on the client is a technician being asked for the
 * wrong readings the first time the two drift. Neither caller computes it.
 *
 * It also fixes a shape bug in the first cut, which returned `reading` straight off Prisma:
 * JSON.stringify renders a Decimal as an object, so a client would have received something
 * structurally different from what the page passes its form. serializeReading is now applied on
 * both paths.
 *
 * Access is decided inside getVisitFormData so it cannot be decided twice -- org mismatch is
 * NOT_FOUND rather than FORBIDDEN, so another company's visit id is not confirmable as real by
 * the shape of the refusal.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;
  const result = await getVisitFormData({
    visitId: id,
    caller: { id: appUser.id, role: appUser.role, organizationId: appUser.organizationId },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.reason === "FORBIDDEN" ? 403 : 404 });
  }

  const { visit, isResidential, timeZone, form } = result.data;

  /**
   * A projection of the visit, not the whole row. The page has the full record in hand for its own
   * chrome; a client only needs what it will show -- where this is, what water it is, and the
   * access details for the person standing at the gate. Sending the rest would put fields on the
   * wire that nothing reads, which is how a payload quietly becomes an API contract.
   */
  /**
   * Annotated, not inferred. VisitWire derives `form` from the two form components' own prop
   * types, so this assignment is what proves the payload is exactly what a client can render --
   * if a form gains a required prop and assemble() does not supply it, this fails to compile
   * rather than failing in the field.
   */
  const body: VisitWire = {
    visit: {
      id: visit.id,
      status: visit.status,
      scheduledStart: visit.scheduledStart.toISOString(),
      startedAt: visit.startedAt ? visit.startedAt.toISOString() : null,
      completedAt: visit.completedAt ? visit.completedAt.toISOString() : null,
      departedAt: visit.departedAt ? visit.departedAt.toISOString() : null,
      technicianId: visit.technicianId,
      property: {
        id: visit.property.id,
        name: visit.property.name,
        propertyType: visit.property.propertyType,
        address: [visit.property.addressLine1, visit.property.city, visit.property.region].filter(Boolean).join(", "),
        latitude: visit.property.latitude != null ? Number(visit.property.latitude) : null,
        longitude: visit.property.longitude != null ? Number(visit.property.longitude) : null,
        geofenceMeters: visit.property.geofenceMeters,
        accessNotes: visit.property.accessNotes,
        ownerName: visit.property.ownerName,
        ownerMobilePhone: visit.property.ownerMobilePhone,
      },
      bodyOfWater: {
        id: visit.bodyOfWater.id,
        name: visit.bodyOfWater.name,
        type: visit.bodyOfWater.type,
        disinfectionMethod: visit.bodyOfWater.disinfectionMethod,
        volumeGallons: visit.bodyOfWater.volumeGallons != null ? Number(visit.bodyOfWater.volumeGallons) : null,
      },
    },
    isResidential,
    timeZone,
    form,
  };

  return NextResponse.json(body);
}
