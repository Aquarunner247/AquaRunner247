import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

/**
 * Removes a logged chemical dose.
 *
 * This existed nowhere before, and its absence is what turned a mis-tap into permanent bad data: the
 * "Add to visit" button writes a dose immediately, so an accidental press billed a customer for a
 * chemical that was never poured AND recorded it as added in the compliance log, with no way to take
 * it back from either. Happened at Fifty101 on 2026-10-01.
 *
 * A dose is a billing record and part of what the customer was told, so deletion is deliberately
 * narrow rather than a general-purpose edit: one row at a time, scoped to a visit the caller can
 * already edit.
 *
 * A technician may remove one while the visit is still open -- correcting their own mistake on site is
 * the whole point. Once the visit is COMPLETED the customer has been emailed and the charge is part of
 * that record, so only an ADMIN or OFFICE user can remove it, which is the same boundary the rest of
 * the visit respects.
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string; doseId: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id, doseId } = await context.params;

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

  // Scoped to this visit, so a dose id from another visit -- or another organization -- cannot be
  // deleted by guessing it.
  const dose = await prisma.visitChemicalDose.findFirst({
    where: { id: doseId, visitId: visit.id },
    select: { id: true },
  });
  if (!dose) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.visitChemicalDose.delete({ where: { id: dose.id } });

  return NextResponse.json({ ok: true });
}
