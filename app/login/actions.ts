"use server";

import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { resolvePostLoginPath } from "@/lib/auth/post-login-path";

/** Called by the staff login form right after Supabase Auth accepts the credentials --
 * that alone doesn't mean this is a staff account, since staff and customer-portal users
 * share one Supabase Auth pool (see the forgot-password flow's own doc comment). Lets the
 * form reject and sign back out immediately instead of leaving someone in a half-logged-in
 * state (a valid Supabase session, but no page in /dashboard actually works for them). */
export async function hasStaffAccess() {
  const appUser = await getCurrentAppUser();
  return Boolean(appUser);
}

/** Where the login form should send a freshly-signed-in staff user -- call only after
 * hasStaffAccess() has already confirmed this is a real staff account. */
export async function getPostLoginPath() {
  const appUser = await getCurrentAppUser();
  if (!appUser) return "/dashboard";
  return resolvePostLoginPath(appUser);
}
