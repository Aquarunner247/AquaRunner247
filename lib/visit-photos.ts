import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const VISIT_PHOTOS_BUCKET = "visit-photos";

/** Creates the private storage bucket for service-visit photos if it doesn't exist yet. */
export async function ensureVisitPhotosBucket() {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data } = await supabaseAdmin.storage.getBucket(VISIT_PHOTOS_BUCKET);
  if (!data) {
    await supabaseAdmin.storage.createBucket(VISIT_PHOTOS_BUCKET, { public: false });
  }
  return supabaseAdmin;
}

/** Downloads a previously-uploaded visit photo's raw bytes back out of storage, for
 * copying into the cancellation safety-net archive. Throws on failure -- callers are
 * expected to catch, same convention as downloadInspectionReportFile. Callers are also
 * responsible for authorizing access to the photo before calling this. */
export async function downloadVisitPhotoFile(storagePath: string): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin.storage.from(VISIT_PHOTOS_BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(`Failed to download visit photo at ${storagePath}: ${error?.message ?? "no data"}`);
  }
  const arrayBuffer = await data.arrayBuffer();
  return { bytes: new Uint8Array(arrayBuffer), contentType: data.type || null };
}

/** Removes a visit photo's file from storage. Best-effort -- callers should log, not
 * throw, on failure (same convention as deleteInspectionReport's storage.remove step). */
export async function removeVisitPhotoFile(storagePath: string): Promise<{ ok: boolean; error?: string }> {
  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.storage.from(VISIT_PHOTOS_BUCKET).remove([storagePath]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
