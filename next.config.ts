import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB — too small for real inspection reports / contracts (customer documents).
      bodySizeLimit: "15mb",
    },
  },
  // Static headers only -- Content-Security-Policy needs a fresh nonce per request, so
  // that one lives in middleware.ts instead (which also sets it for redirects this list
  // doesn't otherwise cover).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nothing in this app needs to be iframed by another site, and nothing here
          // needs to iframe another site either (the branding settings page's <iframe
          // srcDoc> is same-origin inline content, unaffected by this).
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Explicitly allows geolocation/camera for this origin -- GPS auto-arrival
          // (route-day-view.tsx) and visit photo capture both depend on real browser/
          // Capacitor permission prompts working. Blocks what nothing here uses.
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=(), payment=()" },
        ],
      },
    ];
  },
};

// Uploads source maps at build time so Sentry shows real stack traces instead of minified
// ones -- silently skipped if SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT aren't set (e.g.
// local dev, or before the Vercel Sentry integration is connected), never breaks the build.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: true,
  },
});
