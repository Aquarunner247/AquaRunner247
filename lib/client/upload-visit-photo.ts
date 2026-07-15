"use client";

const PHOTO_ERROR_MESSAGES: Record<string, string> = {
  INVALID_FILE_TYPE: "That file isn't an image — try again with a photo.",
  FILE_TOO_LARGE: "That photo is too large (max 10MB) — try again.",
  PHOTO_REQUIRED: "No photo was received — try again.",
  VISIT_ALREADY_COMPLETED: "That visit is already completed.",
  FORBIDDEN: "You don't have access to that visit.",
  NOT_FOUND: "Visit not found.",
};

export type UploadVisitPhotoResult = { ok: true; photoId: string } | { ok: false; error: string };

/**
 * Uploads a single photo to a specific visit's photo log. Grabs the device's current
 * geolocation (best-effort, same as the reading capture) before posting. Used by both
 * the single-visit form and the multi-body "capture all stops" screen so a photo taken
 * from either place is stored identically (same endpoint, same visitId scoping).
 */
export async function uploadVisitPhoto(visitId: string, file: File): Promise<UploadVisitPhotoResult> {
  const formData = new FormData();
  formData.append("photo", file);
  formData.append("capturedAt", new Date().toISOString());

  if (typeof navigator !== "undefined" && navigator.geolocation) {
    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          formData.append("latitude", String(position.coords.latitude));
          formData.append("longitude", String(position.coords.longitude));
          formData.append("accuracyMeters", String(position.coords.accuracy));
          resolve();
        },
        () => resolve(),
        { enableHighAccuracy: true, timeout: 7000 },
      );
    });
  }

  const response = await fetch(`/api/visits/${visitId}/photos`, { method: "POST", body: formData });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = (body?.error && PHOTO_ERROR_MESSAGES[body.error]) || "Photo upload failed";
    return { ok: false, error };
  }
  const data = (await response.json()) as { photoId: string };
  return { ok: true, photoId: data.photoId };
}
