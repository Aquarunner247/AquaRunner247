import { siteUrl } from "@/lib/site-url";

/**
 * JSON-LD for the marketing site.
 *
 * Kept pure and Prisma-free so the shapes can be asserted in a test, same reason
 * lib/marketing-routes.ts and lib/native-shell.ts are.
 *
 * DELIBERATELY ABSENT, and none of these should be added without something real behind them:
 *
 * - `aggregateRating` / `review`. There are no reviews. Inventing them is both dishonest and a
 *   documented way to earn a Google structured-data manual action, which costs far more than the
 *   stars would ever return.
 * - `offers` with a price. The tiers are stated on /pricing, and a price repeated here would be a
 *   second place to drift -- the same failure the trial-reminder email avoided by reading the live
 *   Stripe amount rather than a hardcoded tier label. A wrong price in structured data can surface
 *   in search results, which is worse than no price at all.
 * - `telephone`. DEFAULT_BUSINESS_PHONE is empty; there is no published number to cite.
 */

/** The legal entity, from the notice address in content/legal/terms-of-service.md -- not a
 *  marketing invention, and it must stay in step with that document. */
export function organizationJsonLd() {
  const base = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "AquaRunner247 LLC",
    alternateName: "AquaRunner 24/7",
    url: base,
    logo: `${base}/icons/icon-512.png`,
    address: {
      "@type": "PostalAddress",
      streetAddress: "732 S 6th St, Ste N",
      addressLocality: "Las Vegas",
      addressRegion: "NV",
      postalCode: "89101",
      addressCountry: "US",
    },
  } as const;
}

/**
 * The product itself.
 *
 * `applicationCategory: BusinessApplication` rather than anything consumer-facing, which matches
 * what the Play listing and the EULA both say: this is staff software for a pool service company,
 * not an app a homeowner installs.
 */
export function softwareApplicationJsonLd() {
  const base = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "AquaRunner 24/7",
    url: base,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Android, iOS, Web",
    description:
      "Field and office software for pool service companies: routes in driving order, water chemistry logging, proof-of-service photos, and state-specific commercial compliance records with a QR code on every body of water.",
    publisher: { "@type": "Organization", name: "AquaRunner247 LLC", url: base },
  } as const;
}

/**
 * Serialised for a <script type="application/ld+json">.
 *
 * `<` is escaped because a literal `</script>` inside the JSON would close the tag early and let
 * the remainder parse as markup. Nothing here is user-supplied today, but the escape costs
 * nothing and this function is the obvious place to pass something that is.
 */
export function jsonLdScriptContent(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
