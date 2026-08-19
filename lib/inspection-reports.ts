import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";

export const INSPECTION_REPORTS_BUCKET = "inspection-reports";

/** Creates the private storage bucket for inspection reports if it doesn't exist yet. */
export async function ensureInspectionReportsBucket() {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data } = await supabaseAdmin.storage.getBucket(INSPECTION_REPORTS_BUCKET);
  if (!data) {
    await supabaseAdmin.storage.createBucket(INSPECTION_REPORTS_BUCKET, { public: false });
  }
  return supabaseAdmin;
}

/** Callers are responsible for authorizing access to `bodyOfWaterId` before calling this. */
export async function uploadInspectionReport(bodyOfWaterId: string, formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;

  const supabaseAdmin = await ensureInspectionReportsBucket();

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const storagePath = `${bodyOfWaterId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(INSPECTION_REPORTS_BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });
  if (uploadError) {
    console.error("[inspection reports] upload failed:", uploadError);
    return;
  }

  await prisma.inspectionReport.create({
    data: {
      bodyOfWaterId,
      label: label || file.name,
      storagePath,
      contentType: file.type || null,
      fileSize: file.size,
    },
  });
}

/** Downloads a previously-uploaded report's raw bytes back out of storage, for the LLM
 * extraction step. Throws on failure (missing file, storage error) -- callers are
 * expected to catch, same convention as extractInspectionReportData. Callers are also
 * responsible for authorizing access to the report before calling this. */
export async function downloadInspectionReportFile(storagePath: string): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data, error } = await supabaseAdmin.storage.from(INSPECTION_REPORTS_BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(`Failed to download inspection report at ${storagePath}: ${error?.message ?? "no data"}`);
  }
  const arrayBuffer = await data.arrayBuffer();
  return { bytes: new Uint8Array(arrayBuffer), contentType: data.type || null };
}

/** Callers are responsible for authorizing access to `bodyOfWaterId` before calling this. */
export async function deleteInspectionReport(bodyOfWaterId: string, reportId: string) {
  const report = await prisma.inspectionReport.findFirst({
    where: { id: reportId, bodyOfWaterId },
    select: { id: true, storagePath: true },
  });
  if (!report) return;

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    await supabaseAdmin.storage.from(INSPECTION_REPORTS_BUCKET).remove([report.storagePath]);
  } catch (err) {
    console.error("[inspection reports] storage remove failed:", err);
  }

  await prisma.inspectionReport.delete({ where: { id: report.id } });
}
