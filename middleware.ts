import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Content-Security-Policy, built from an actual inventory of every external domain this
 * app's client-side code touches (checked call-by-call, not guessed) -- see the plan this
 * shipped from for the full table. Nonce-based script-src (Next.js's own documented CSP
 * pattern) rather than a static 'unsafe-inline' allowlist: a fresh nonce per request,
 * forwarded to app/layout.tsx via the x-nonce request header below, which passes it to the
 * two <Script> tags there (GTM + the inline gtag() snippet).
 *
 * style-src keeps 'unsafe-inline' deliberately -- React's style={{}} prop (used throughout
 * this app) and Leaflet's own dynamically-generated marker HTML (route-day-view.tsx's
 * drawMarkers) both emit inline style="..." attributes, and there's no practical way to
 * nonce an inline style *attribute* the way a <script>/<style> tag can be. Same tradeoff
 * Next.js's own official CSP guide makes -- inline styles are a much lower-severity risk
 * than inline scripts, and eliminating every one in this codebase would be a large,
 * unrelated refactor.
 */
function buildCsp(nonce: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const isDev = process.env.NODE_ENV !== "production";

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "https://www.googletagmanager.com",
    // Next.js's dev server needs 'unsafe-eval' for React Refresh/HMR -- production stays
    // strict, this only ever applies to a local `next dev` run.
    isDev ? "'unsafe-eval'" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Satoshi's CSS is served from Fontshare's own domain (see app/layout.tsx's <link>).
    "style-src 'self' 'unsafe-inline' https://api.fontshare.com",
    "font-src 'self' https://cdn.fontshare.com data:",
    // data: for QR-code data-URL images (lib/qr.ts); blob: for the branding-logo upload's
    // local file preview (URL.createObjectURL, app/dashboard/settings/branding).
    `img-src 'self' data: blob: https://*.tile.openstreetmap.org https://server.arcgisonline.com${supabaseUrl ? ` ${supabaseUrl}` : ""}`,
    // router.project-osrm.org: driving-route geometry, fetched client-side (lib/routing.ts).
    // google-analytics/analytics.google.com: hit collection sent by the GTM script above.
    // Sentry: error reporting (instrumentation-client.ts) -- both ingest domain shapes,
    // since which one a given DSN uses depends on the Sentry org's region.
    `connect-src 'self' https://router.project-osrm.org https://*.google-analytics.com https://*.analytics.google.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io${supabaseUrl ? ` ${supabaseUrl}` : ""}`,
    // The branding settings page's welcome-email live preview uses <iframe srcDoc> --
    // inline content, not a cross-origin load, but explicit 'self' avoids any ambiguity.
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = await updateSession(request, requestHeaders);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and images.
     * Needed so Supabase can refresh the session on navigation.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
