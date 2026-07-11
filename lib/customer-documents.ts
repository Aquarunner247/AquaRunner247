import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const CUSTOMER_DOCUMENTS_BUCKET = "customer-documents";

/** Creates the private storage bucket for customer documents if it doesn't exist yet. */
export async function ensureCustomerDocumentsBucket() {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data } = await supabaseAdmin.storage.getBucket(CUSTOMER_DOCUMENTS_BUCKET);
  if (!data) {
    await supabaseAdmin.storage.createBucket(CUSTOMER_DOCUMENTS_BUCKET, { public: false });
  }
  return supabaseAdmin;
}
