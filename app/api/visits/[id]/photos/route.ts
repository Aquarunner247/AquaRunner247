import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { VISIT_PHOTOS_BUCKET, ensureVisitPhotosBucket } from "@/lib/visit-photos";

function decimalOrNull(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await context.params;
  const visit = await prisma.serviceVisit.findUnique({
    where: { id },
    select: { id: true, technicianId: true, organizationId: true, status: true, bodyOfWaterId: true },
  });
  if (!visit) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const canEdit =
    appUser.organizationId === visit.organizationId &&
    (appUser.role === "ADMIN" || appUser.role === "OFFICE" || visit.technicianId === appUser.id);
  if (!canEdit) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  if (visit.status === "COMPLETED") {
    return NextResponse.json({ error: "VISIT_ALREADY_COMPLETED" }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("photo");
  if (!(file instanceof File) || !file.name) {
    return NextResponse.json({ error: "PHOTO_REQUIRED" }, { status: 400 });
  }

  const capturedAtRaw = formData.get("capturedAt");
  const capturedAt = typeof capturedAtRaw === "string" && capturedAtRaw ? new Date(capturedAtRaw) : new Date();

  const latitude = decimalOrNull(typeof formData.get("latitude") === "string" ? (formData.get("latitude") as string) : null);
  const longitude = decimalOrNull(typeof formData.get("longitude") === "string" ? (formData.get("longitude") as string) : null);
  const accuracyMeters = decimalOrNull(typeof formData.get("accuracyMeters") === "string" ? (formData.get("accuracyMeters") as string) : null);

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const storagePath = `${visit.organizationId}/${id}/${Date.now()}-${safeName}`;

  const supabaseAdmin = await ensureVisitPhotosBucket();
  const { error: uploadError } = await supabaseAdmin.storage
    .from(VISIT_PHOTOS_BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });
  if (uploadError) {
    console.error("[visit photos] upload failed:", uploadError);
    return NextResponse.json({ error: "UPLOAD_FAILED" }, { status: 500 });
  }

  const photo = await prisma.visitPhoto.create({
    data: {
      visitId: id,
      storagePath,
      contentType: file.type || "image/jpeg",
      takenAt: capturedAt,
      latitude,
      longitude,
      accuracyMeters,
    },
  });

  return NextResponse.json({ ok: true, photoId: photo.id });
}
