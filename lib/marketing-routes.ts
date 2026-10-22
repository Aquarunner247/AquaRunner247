/**
 * The public marketing site, as a route predicate.
 *
 * This lives apart from the pages themselves because the app shell needs it: `SideNav` renders the
 * staff rail on every route it is not told to skip, so a marketing page missing from this list gets
 * the staff nav overlaid beside it for any logged-in visitor. That is exactly how /privacy and
 * /terms ended up with a navy rail down their left edge -- they were added to the marketing site
 * long after the gate in SideNav was written, and the gate was a hardcoded list of four paths.
 *
 * Kept pure (no next/navigation, no React) so it can be tested directly; `server-only` would
 * otherwise block it in vitest, which is the established pattern in this repo.
 */
const MARKETING_PATHS = [
  "/pricing",
  "/features",
  "/for-property-managers",
  // Every legal page is part of the marketing site for nav purposes. /dpa and /subprocessors
  // were routed on 2026-10-21 and missed here, which reintroduced the navy rail this file
  // exists to prevent; /eula and /licenses landed with them on 2026-10-22.
  "/privacy",
  "/terms",
  "/dpa",
  "/subprocessors",
  "/eula",
  "/licenses",
] as const;

export function isMarketingRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  return MARKETING_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
