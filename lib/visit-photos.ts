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
