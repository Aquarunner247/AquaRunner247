import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { removeVisitPhotoFile } from "@/lib/visit-photos";

/**
 * Removes a service-visit photo.
 *
 * Its absence turned a wrong photo into permanent bad data, the same shape as the missing dose
 * delete: on 2026-10-11 a technician photographed the wrong pool at the wrong property, had no way
 * to undo it, and was told to take it anyway and have the office fix it afterwards. A photo is what
 * the customer actually sees of a visit, so the wrong one is worse than none.
 *
 * Permissions match the dose boundary exactly (app/api/visits/[id]/doses/[doseId]/route.ts), because
 * it is the same judgement: a technician may remove one while the visit is still open, which is the
 * case this exists for -- correcting your own mistake on site, in the moment. Once the visit is
 * COMPLETED the summary has gone to the customer, so only an ADMIN or OFFICE user can remove it.
 *
 * Deleting a photo here does NOT unsend an email that already carried it. On a completed visit the
 * customer has the original attached to their summary, and this only removes it from the record
 * going forward -- telling them is a separate, human job.
 *
 * The row goes first and the file second, deliberately. A deleted row with an orphaned file is
 * storage waste nobody sees; a deleted file with a surviving row is a broken image in the customer
 * portal and the compliance record.
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string; photoId: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id, photoId } = await context.params;

  const visit = await prisma.serviceVisit.findUnique({
    where: { id },
    select: { id: true, organizationId: true, technicianId: true, status: true },
  });
  if (!visit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const isAdminOrOffice = appUser.role === "ADMIN" || appUser.role === "OFFICE";
  const canEdit =
    appUser.organizationId === visit.organizationId && (isAdminOrOffice || visit.technicianId === appUser.id);
  if (!canEdit) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (visit.status === "COMPLETED" && !isAdminOrOffice) {
    return NextResponse.json({ error: "VISIT_ALREADY_COMPLETED" }, { status: 400 });
  }

  // Scoped to this visit, so a photo id from another visit -- or another organization -- cannot be
  // deleted by guessing it.
  const photo = await prisma.visitPhoto.findFirst({
    where: { id: photoId, visitId: visit.id },
    select: { id: true, storagePath: true },
  });
  if (!photo) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.visitPhoto.delete({ where: { id: photo.id } });

  if (photo.storagePath) {
    const removed = await removeVisitPhotoFile(photo.storagePath);
    if (!removed.ok) {
      // Best-effort, same convention as deleteInspectionReport: the record is already correct and a
      // leftover private file is not worth failing the technician's correction over.
      console.error(`[visit photo delete] storage remove failed for ${photo.storagePath}: ${removed.error}`);
    }
  }

  const remaining = await prisma.visitPhoto.count({ where: { visitId: visit.id } });
  return NextResponse.json({ ok: true, remainingPhotos: remaining });
}
