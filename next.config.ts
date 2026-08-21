import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB — too small for real inspection reports / contracts (customer documents).
      bodySizeLimit: "15mb",
    },
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
