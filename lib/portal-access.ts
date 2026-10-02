/**
 * What a portal login is allowed to reach.
 *
 * One definition, because the answer is needed in three places that must agree: the portal layout
 * (which redirects), the nav (which decides what to show), and the log action (which decides whether to
 * accept a reading). A nav that hides a page the layout still serves is a leak; a layout that blocks a
 * page the nav still links to is a dead end.
 */
import type { CustomerUserRole } from "@/generated/prisma/enums";

/** The daily chemistry log -- a maintenance person's whole reason for having a login. */
export const PORTAL_LOG_PATH = "/portal/log";

/**
 * Paths a MAINTENANCE login may open: the log, and the chemical safety data sheets they need while
 * handling those chemicals. Everything else in the portal -- service history, documents, alerts,
 * compliance summaries -- is the customer's own business, not their contractor's.
 */
const MAINTENANCE_PATHS = [PORTAL_LOG_PATH, "/portal/chemicals"] as const;

export function canLogReadings(role: CustomerUserRole): boolean {
  return role === "MAINTENANCE";
}

/** Where a login lands with no path of its own: a maintenance person has no use for the dashboard. */
export function portalHomePath(role: CustomerUserRole): string {
  return role === "MAINTENANCE" ? PORTAL_LOG_PATH : "/portal";
}

/**
 * Prefix matching, so a nested page under an allowed one (a body of water under the log) is allowed
 * with it, while `/portal/chemicals-everything` is not mistaken for `/portal/chemicals`.
 */
export function canOpenPortalPath(role: CustomerUserRole, pathname: string): boolean {
  if (role !== "MAINTENANCE") return true;
  return MAINTENANCE_PATHS.some((allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`));
}
