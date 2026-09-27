import { cache } from "react";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { getAppUserForAuthUser } from "@/lib/auth/prisma-user";

/**
 * Memoized per request with React's cache(), because this is the most-called function in the
 * app (78 modules) and it is not cheap: supabase.auth.getUser() is a network round trip to
 * the Supabase Auth server on every call -- it re-validates the JWT rather than trusting the
 * cookie -- followed by a Prisma User lookup (two, when the authUserId miss falls through to
 * email).
 *
 * Without this, one dashboard navigation paid for it twice over: app/dashboard/layout.tsx
 * and the page beneath it each call getCurrentAppUser independently, so the same user was
 * fetched and re-validated twice while rendering a single screen. That showed up in
 * Postgres as ~36k auth session lookups against a far smaller number of page views.
 *
 * cache() dedupes only within a single server request, which is exactly the desired scope --
 * nothing is shared between users or across requests, so there is no staleness window: a
 * change to the user's row is picked up by the next request either way. The middleware's own
 * getUser() call can't be deduped from here (separate runtime, before rendering starts).
 */
const lookupAppUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  return getAppUserForAuthUser(user);
});

// A DB error here (e.g. the connection pool momentarily maxed out under load -- see the
// pool-sizing comment in lib/prisma.ts) is indistinguishable from "not staff" to a caller
// that only gets `null` back. Reporting it (rather than only console.error-ing in dev, i.e.
// never in production) at least makes a transient failure like that visible instead of
// silently looking like an account problem.
function reportDbError(e: unknown) {
  if (process.env.NODE_ENV === "development") {
    console.error("[AquaRunner] auth/current-app-user DB error:", e);
  } else {
    Sentry.captureException(e);
  }
}

export async function getCurrentAppUser() {
  try {
    return await lookupAppUser();
  } catch (e) {
    reportDbError(e);
    return null;
  }
}

export type StaffAccessStatus = "ok" | "not-staff" | "error";

/**
 * Same underlying lookup as getCurrentAppUser(), but distinguishes "checked, and this
 * genuinely isn't a staff account" from "couldn't check because of a transient error" --
 * a distinction getCurrentAppUser()'s callers don't need (everywhere else, both cases
 * should redirect to /login the same way), but the login form's staff-access gate does:
 * telling a real staff account to go log in as a customer because of a DB hiccup is
 * actively misleading, not just imprecise.
 */
export async function checkStaffAccess(): Promise<StaffAccessStatus> {
  try {
    const appUser = await lookupAppUser();
    return appUser ? "ok" : "not-staff";
  } catch (e) {
    reportDbError(e);
    return "error";
  }
}
