import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { uploadInspectionReport } from "@/lib/inspection-reports";
import { looksLikeInspectionReport, pickInspectionReportTarget, type BodyOfWaterCandidate } from "@/lib/inspection-report-detection";

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

export type UploadDocumentResult =
  | { kind: "inspection-report"; bodyOfWaterName: string; propertyName: string }
  | { kind: "document" }
  | { kind: "error"; error: string }
  | { kind: "skipped" };

/**
 * Shared upload logic used by both the admin ("upload for a customer") and portal
 * ("customer uploads their own document") actions — callers are responsible for
 * authorizing access to `customerId` before calling this.
 *
 * Before filing this as a generic document, checks whether it's actually an inspection
 * report (see lib/inspection-report-detection.ts) that belongs under a specific body of
 * water's own InspectionReport section instead — that section has no other way to receive
 * a file today, so without this check an inspection report uploaded here would sit in the
 * flat documents list forever. Only reroutes when the target body is unambiguous; anything
 * uncertain still lands here as a normal document (the customer detail page flags it with
 * a manual "attach to…" picker instead of guessing).
 */
export async function uploadDocumentForCustomer(customerId: string, formData: FormData): Promise<UploadDocumentResult> {
  const label = String(formData.get("label") ?? "").trim();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { kind: "skipped" };

  const nameForDetection = label || file.name;
  if (looksLikeInspectionReport(nameForDetection)) {
    const candidates: BodyOfWaterCandidate[] = (
      await prisma.bodyOfWater.findMany({
        where: { property: { customerId } },
        select: { id: true, name: true, property: { select: { name: true } } },
      })
    ).map((b) => ({ id: b.id, name: b.name, propertyName: b.property.name }));
    const target = pickInspectionReportTarget(candidates, nameForDetection);
    if (target) {
      await uploadInspectionReport(target.id, formData);
      return { kind: "inspection-report", bodyOfWaterName: target.name, propertyName: target.propertyName };
    }
  }

  const supabaseAdmin = await ensureCustomerDocumentsBucket();

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const storagePath = `${customerId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(CUSTOMER_DOCUMENTS_BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });
  if (uploadError) {
    console.error("[customer documents] upload failed:", uploadError);
    return { kind: "error", error: uploadError.message };
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
  return { kind: "document" };
}

/**
 * Moves an already-uploaded generic document into a specific body of water's inspection
 * reports — used when a document was flagged as "looks like an inspection report" but
 * couldn't be auto-attached (ambiguous body match) and an admin picks the target manually.
 * Downloads the original bytes and re-uploads them through uploadInspectionReport (so the
 * new row gets the exact same bucket/creation logic as any other inspection report), then
 * only removes the original afterward — a storage/DB failure partway through leaves the
 * source document intact instead of losing the file outright.
 */
export async function moveCustomerDocumentToInspectionReport(
  customerId: string,
  documentId: string,
  bodyOfWaterId: string,
): Promise<{ ok: boolean; error?: string }> {
  const document = await prisma.customerDocument.findFirst({ where: { id: documentId, customerId } });
  if (!document) return { ok: false, error: "Document not found." };

  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin.storage.from(CUSTOMER_DOCUMENTS_BUCKET).download(document.storagePath);
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not read the original file." };
  }

  const bytes = await data.arrayBuffer();
  const file = new File([bytes], document.label, { type: document.contentType ?? undefined });
  const moveFormData = new FormData();
  moveFormData.set("label", document.label);
  moveFormData.set("file", file);
  await uploadInspectionReport(bodyOfWaterId, moveFormData);

  await deleteDocumentForCustomer(customerId, documentId);
  return { ok: true };
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
