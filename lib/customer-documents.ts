import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";

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

/**
 * Shared upload logic used by both the admin ("upload for a customer") and portal
 * ("customer uploads their own document") actions — callers are responsible for
 * authorizing access to `customerId` before calling this.
 */
export async function uploadDocumentForCustomer(customerId: string, formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;

  const supabaseAdmin = await ensureCustomerDocumentsBucket();

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const storagePath = `${customerId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(CUSTOMER_DOCUMENTS_BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });
  if (uploadError) {
    console.error("[customer documents] upload failed:", uploadError);
    return;
  }

  await prisma.customerDocument.create({
    data: {
      customerId,
      label: label || file.name,
      storagePath,
      contentType: file.type || null,
      fileSize: file.size,
    },
  });
}

/** Shared delete logic — callers are responsible for authorizing access to `customerId` first. */
export async function deleteDocumentForCustomer(customerId: string, documentId: string) {
  const document = await prisma.customerDocument.findFirst({
    where: { id: documentId, customerId },
    select: { id: true, storagePath: true },
  });
  if (!document) return;

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    await supabaseAdmin.storage.from(CUSTOMER_DOCUMENTS_BUCKET).remove([document.storagePath]);
  } catch (err) {
    console.error("[customer documents] storage remove failed:", err);
  }

  await prisma.customerDocument.delete({ where: { id: document.id } });
}
