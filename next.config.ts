import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { withBotId } from "botid/next/config";

// Derived from the env var rather than hardcoded so this stays correct across environments
// without editing code -- local dev's Supabase stack is a plain http://127.0.0.1:54321,
// production is the project's https://*.supabase.co host. Everything this app fetches
// through next/image today lives in the visit-photos bucket (see PhotoThumbnail), served
// from this same project, so one host covers it.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB — too small for real inspection reports / contracts (customer documents).
      bodySizeLimit: "15mb",
    },
  },
  images: {
    remotePatterns: supabaseUrl
      ? [
          {
            protocol: supabaseUrl.protocol.replace(":", "") as "http" | "https",
            hostname: supabaseUrl.hostname,
            port: supabaseUrl.port,
            pathname: "/storage/v1/object/sign/**",
          },
        ]
      : [],
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
      // Genuinely static /public files -- same content for every visitor regardless of
      // org/session, so a shared CDN cache is safe here. Deliberately NOT extended to any
      // actual page/route: this app's root layout (app/layout.tsx) calls
      // supabase.auth.getUser() unconditionally on every request (to feed SideNav/
      // OnboardingCallBanner), which forces Next.js to treat every single route -- public
      // pages included -- as fully dynamic. Confirmed by testing: adding `export const
      // revalidate` to app/p/[publicSlug]/page.tsx had zero effect (still "ƒ Dynamic" in
      // the build output, still `Cache-Control: private, no-store` on the live response).
      // Real Function-response caching anywhere in this app requires first decoupling that
      // nav from the root layout (e.g. Partial Prerendering, or fetching auth state
      // client-side instead) -- a separate, larger change, not attempted here.
      // Filenames aren't content-hashed, so max-age is deliberately short of `immutable`:
      // a day of caching plus a week of stale-while-revalidate cuts real repeat-request/
      // origin load for icons/manifest without leaving a swapped-out asset stuck for long
      // if one ever changes without a filename change. Separate rules, not one regex
      // alternation -- Next.js's route-source parser rejects capturing groups.
      ...["/favicon-32.png", "/manifest.webmanifest", "/icons/:path*", "/images/:path*", "/marketing/:path*", "/templates/:path*"].map(
        (source) => ({
          source,
          headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
        }),
      ),
      // The service worker is the one /public file that must NOT be cached like the
      // above -- browsers already re-check it periodically regardless, but a stale cached
      // copy here would delay that check and delay every update rollout behind it.
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

// withBotId adds the proxy rewrites BotID's client-side check needs (see
// instrumentation-client.ts's initBotId call, and checkBotId in the two protected
// endpoints: app/api/waitlist/route.ts and app/signup/actions.ts's signUp). Applied to the
// plain config first, same as BotID's own docs examples, before the Sentry wrapper.
//
// Uploads source maps at build time so Sentry shows real stack traces instead of minified
// ones -- silently skipped if SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT aren't set (e.g.
// local dev, or before the Vercel Sentry integration is connected), never breaks the build.
export default withSentryConfig(withBotId(nextConfig), {
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
