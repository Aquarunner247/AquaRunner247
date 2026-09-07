import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Storage for an org's uploaded branding logo -- shown in the customer portal
 * (app/portal/components/portal-nav.tsx) and the welcome email
 * (lib/mail/welcome-email.ts).
 *
 * PUBLIC bucket -- the one deliberate deviation from this app's usual private-bucket
 * convention (lib/customer-documents.ts, lib/visit-photos.ts, lib/sds-documents.ts are all
 * `public: false` + signed URLs, since everything else is viewed inside an authenticated
 * session). A logo needs to load in an external customer's inbox and load reliably for as
 * long as that email sits unread -- a signed URL's expiry is the wrong shape for that, and
 * there's no session to authenticate against anyway. The object key is scoped per org
 * (`${organizationId}/logo`) and cuid-based org ids aren't guessable, matching the same
 * "unguessable identifier is the access control" trust model this app already uses for
 * public QR/inspector-log pages (BodyOfWater.publicSlug).
 */
export const BRANDING_LOGOS_BUCKET = "org-branding-logos";

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB -- generous for a logo, small enough to block abuse
const ALLOWED_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export class LogoUploadError extends Error {}

/** Creates the public storage bucket for branding logos if it doesn't exist yet. */
export async function ensureBrandingLogosBucket() {
  const supabaseAdmin = createSupabaseAdminClient();
  const { data } = await supabaseAdmin.storage.getBucket(BRANDING_LOGOS_BUCKET);
  if (!data) {
    await supabaseAdmin.storage.createBucket(BRANDING_LOGOS_BUCKET, { public: true });
  }
  return supabaseAdmin;
}

/** First bytes of each allowed format -- the client-supplied `file.type` is trivially
 * spoofable (just a form field), so this checks what was actually uploaded before trusting
 * it. Dependency-free rather than pulling in an image-processing library for one check. */
function sniffContentType(bytes: Uint8Array): string | null {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Validates and uploads a logo file, replacing any previous one for this org
 * (`upsert: true` on a fixed path, so there's never more than one stored per org). Throws
 * LogoUploadError with a user-facing message on any validation failure -- the caller
 * (app/dashboard/settings/branding/actions.ts) redirects with it as-is.
 */
export async function uploadBrandingLogo(organizationId: string, file: File): Promise<string> {
  if (file.size === 0) throw new LogoUploadError("Choose a file to upload.");
  if (file.size > MAX_LOGO_BYTES) throw new LogoUploadError("Logo must be 2MB or smaller.");
  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    throw new LogoUploadError("Logo must be a PNG, JPEG, or WEBP image.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffContentType(bytes);
  if (!sniffed || sniffed !== file.type) {
    throw new LogoUploadError("That file doesn't look like a valid image of the declared type.");
  }

  const supabaseAdmin = await ensureBrandingLogosBucket();
  const storagePath = `${organizationId}/logo`;

  const { error } = await supabaseAdmin.storage
    .from(BRANDING_LOGOS_BUCKET)
    .upload(storagePath, bytes, { contentType: file.type, upsert: true });
  if (error) {
    throw new LogoUploadError("Upload failed -- please try again.");
  }

  const { data } = supabaseAdmin.storage.from(BRANDING_LOGOS_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

/** Best-effort removal, matching deleteDocumentForCustomer's "log, don't throw" convention
 * for storage-side failures -- the DB is the source of truth for whether a logo is set. */
export async function removeBrandingLogo(organizationId: string): Promise<void> {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    await supabaseAdmin.storage.from(BRANDING_LOGOS_BUCKET).remove([`${organizationId}/logo`]);
  } catch (err) {
    console.error("[branding logo] storage remove failed:", err);
  }
}
