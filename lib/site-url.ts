/** The public origin the marketing site is served from, used for metadataBase, the
 * sitemap, and robots.txt.
 *
 * NEXT_PUBLIC_SITE_URL is preferred so the marketing origin can differ from the app's
 * (NEXT_PUBLIC_APP_URL is documented elsewhere as e.g. https://app.aquarunner247.com).
 * When only one of them is set, either is better than the hardcoded fallback. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  // Localhost is the local default; absolute metadata URLs pointing at it would be wrong
  // in any deployed environment, so fall through to the real domain instead.
  if (configured && !configured.includes("localhost")) {
    return configured.replace(/\/$/, "");
  }
  return "https://aquarunner247.com";
}
