import type { MetadataRoute } from "next";
import { siteUrl } from "../lib/site-url";

/** The marketing pages only. /terms and /privacy set robots: { index: false } in their own
 * metadata, so listing them here would contradict that. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const lastModified = new Date();

  return [
    { url: `${base}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, lastModified, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/features`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/for-property-managers`, lastModified, changeFrequency: "monthly", priority: 0.7 },
  ];
}
