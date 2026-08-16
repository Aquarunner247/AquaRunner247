import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";

export const SDS_DOCUMENTS_BUCKET = "org-sds-documents";

/** Creates the private storage bucket for org-uploaded SDS overrides if it doesn't exist yet. */
export async function ensureSdsDocumentsBucket() {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data } = await supabaseAdmin.storage.getBucket(SDS_DOCUMENTS_BUCKET);
  if (!data) {
    await supabaseAdmin.storage.createBucket(SDS_DOCUMENTS_BUCKET, { public: false });
  }
  return supabaseAdmin;
}

/**
 * Uploads an org's own SDS for one catalog product, overriding the system default.
 * Upserts the OrgChemicalProductSetting row (find-or-create by [organizationId,
 * catalogProductId]) rather than requiring one to already exist -- a product an org hasn't
 * enabled/priced yet still has no settings row, but they should still be able to attach
 * their own SDS to it. Caller is responsible for confirming the requester is an admin of
 * `organizationId` before calling this -- this function only checks that `catalogProductId`
 * is real, not who's asking.
 */
export async function uploadSdsForOrgProduct(organizationId: string, catalogProductId: string, formData: FormData) {
  const catalogProduct = await prisma.chemicalProductCatalog.findUnique({ where: { id: catalogProductId }, select: { id: true } });
  if (!catalogProduct) return;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  if (file.type !== "application/pdf") return;

  const supabaseAdmin = await ensureSdsDocumentsBucket();

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const storagePath = `${organizationId}/${catalogProductId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(SDS_DOCUMENTS_BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    console.error("[sds documents] upload failed:", uploadError);
    return;
  }

  const existing = await prisma.orgChemicalProductSetting.findUnique({
    where: { organizationId_catalogProductId: { organizationId, catalogProductId } },
    select: { sdsStoragePath: true },
  });

  await prisma.orgChemicalProductSetting.upsert({
    where: { organizationId_catalogProductId: { organizationId, catalogProductId } },
    create: {
      organizationId,
      catalogProductId,
      sdsStoragePath: storagePath,
      sdsFileName: file.name,
      sdsContentType: file.type,
      sdsFileSize: file.size,
      sdsUploadedAt: new Date(),
    },
    update: {
      sdsStoragePath: storagePath,
      sdsFileName: file.name,
      sdsContentType: file.type,
      sdsFileSize: file.size,
      sdsUploadedAt: new Date(),
    },
  });

  // Clean up the previous upload's storage object now that the row points at the new one --
  // best-effort, a leftover orphaned object isn't worth failing the whole upload over.
  if (existing?.sdsStoragePath) {
    try {
      await supabaseAdmin.storage.from(SDS_DOCUMENTS_BUCKET).remove([existing.sdsStoragePath]);
    } catch (err) {
      console.error("[sds documents] cleanup of previous upload failed:", err);
    }
  }
}

/** Removes an org's uploaded SDS override for one product, reverting to the catalog's
 * system default (or "not available" if the catalog has none either). Caller is
 * responsible for confirming the requester is an admin of `organizationId`. */
export async function removeSdsForOrgProduct(organizationId: string, catalogProductId: string) {
  const setting = await prisma.orgChemicalProductSetting.findUnique({
    where: { organizationId_catalogProductId: { organizationId, catalogProductId } },
    select: { id: true, sdsStoragePath: true },
  });
  if (!setting?.sdsStoragePath) return;

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    await supabaseAdmin.storage.from(SDS_DOCUMENTS_BUCKET).remove([setting.sdsStoragePath]);
  } catch (err) {
    console.error("[sds documents] storage remove failed:", err);
  }

  await prisma.orgChemicalProductSetting.update({
    where: { id: setting.id },
    data: { sdsStoragePath: null, sdsFileName: null, sdsContentType: null, sdsFileSize: null, sdsUploadedAt: null },
  });
}

/** Short-lived signed URL for viewing/downloading a private-bucket SDS override. */
export async function getSdsSignedUrl(storagePath: string): Promise<string | null> {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data } = await supabaseAdmin.storage.from(SDS_DOCUMENTS_BUCKET).createSignedUrl(storagePath, 3600);
  return data?.signedUrl ?? null;
}

export type ResolvedSds =
  | { kind: "org-upload"; fileName: string; url: string }
  | { kind: "system-default"; sourceLabel: string | null; url: string }
  | { kind: "none" };

/**
 * Resolution precedence: an org's own upload always wins over the system default, and the
 * system default (a plain external link, already public -- no signed URL needed) wins over
 * showing nothing. Callers pass in a pre-fetched signed URL for the org-upload case (signed
 * URLs are generated per-request, not cached/stored) rather than this function fetching one
 * itself, so a page listing many products can batch the signed-URL calls however it likes.
 */
export function resolveSds(
  catalogProduct: { sdsDocumentUrl: string | null; sdsSourceLabel: string | null },
  orgSetting: { sdsStoragePath: string | null; sdsFileName: string | null } | null | undefined,
  orgUploadSignedUrl: string | null,
): ResolvedSds {
  if (orgSetting?.sdsStoragePath && orgUploadSignedUrl) {
    return { kind: "org-upload", fileName: orgSetting.sdsFileName ?? "SDS.pdf", url: orgUploadSignedUrl };
  }
  if (catalogProduct.sdsDocumentUrl) {
    return { kind: "system-default", sourceLabel: catalogProduct.sdsSourceLabel, url: catalogProduct.sdsDocumentUrl };
  }
  return { kind: "none" };
}
