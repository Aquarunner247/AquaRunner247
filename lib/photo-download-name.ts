/**
 * The filename a customer gets when they save a service photo.
 *
 * Supabase storage paths look like `<orgId>/<visitId>/1759300000000-IMG_4821.jpg`, so a saved file was
 * named after a timestamp and whatever the phone called it -- when it saved at all. A customer asked to
 * keep a photo and could not, which is the whole reason this exists: the email now carries an explicit
 * download link, and a link is only as useful as the name on the other end of it.
 *
 * Pure, so the naming can be tested without storage or a mail client.
 */

/** Long enough to stay readable, short enough for every filesystem and mail client. */
const MAX_BASE_LENGTH = 70;

function slug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Keeps the real extension where there is one, because the extension is what decides whether a phone
 * or a laptop opens the file in a photo viewer at all. Falls back to .jpg: every photo this app stores
 * comes from a camera capture, and a name with no extension is the version that does not open.
 */
function extensionOf(storagePath: string): string {
  const match = /\.([a-zA-Z0-9]{2,5})$/.exec(storagePath);
  const ext = match?.[1]?.toLowerCase();
  if (!ext) return "jpg";
  return ext === "jpeg" ? "jpg" : ext;
}

/**
 * e.g. `Borgata-Condominiums-Clubhouse-Pool-2026-10-03-2.jpg`
 *
 * Property, body of water and the service day, so a customer saving photos from several visits ends up
 * with files they can tell apart in a downloads folder -- which is what they were trying to do.
 * `index` is 1-based and only appears from the second photo of a body onwards.
 */
export function photoDownloadFilename(opts: {
  propertyName: string;
  bodyName: string;
  /** The service day as YYYY-MM-DD, already resolved in the pool's timezone. */
  ymd: string;
  index: number;
  storagePath: string;
}): string {
  const parts = [slug(opts.propertyName), slug(opts.bodyName), opts.ymd].filter((p) => p.length > 0);
  const base = parts.join("-").slice(0, MAX_BASE_LENGTH).replace(/-$/, "");
  const suffix = opts.index > 1 ? `-${opts.index}` : "";
  const name = `${base || "service-photo"}${suffix}`;
  return `${name}.${extensionOf(opts.storagePath)}`;
}
