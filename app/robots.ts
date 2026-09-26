import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site-url";

/** Only the four marketing pages should be crawlable. Everything else is either signed-in
 * product, an auth screen, an API route, or -- in the case of /p/<slug> -- a public
 * inspector record that happens to need no login but still holds a real customer's
 * service history. None of that belongs in a search index. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/billing/",
        "/cpo/",
        "/dashboard/",
        "/forgot-password",
        "/login",
        "/p/",
        "/platform-admin/",
        "/portal/",
        "/reset-password",
        "/signup",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
