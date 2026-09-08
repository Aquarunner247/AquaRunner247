"use server";

import { getCurrentAppUser, checkStaffAccess, type StaffAccessStatus } from "@/lib/auth/current-app-user";
import { resolvePostLoginPath } from "@/lib/auth/post-login-path";

/** Called by the staff login form right after Supabase Auth accepts the credentials --
 * that alone doesn't mean this is a staff account, since staff and customer-portal users
 * share one Supabase Auth pool (see the forgot-password flow's own doc comment). Lets the
 * form reject and sign back out immediately instead of leaving someone in a half-logged-in
 * state (a valid Supabase session, but no page in /dashboard actually works for them).
 * Returns "error" rather than "not-staff" when the check itself failed (e.g. a DB hiccup)
 * so the form doesn't tell a real staff account to go log in as a customer over what was
 * actually a transient failure -- see checkStaffAccess's own doc comment. */
export async function getStaffAccessStatus(): Promise<StaffAccessStatus> {
  return checkStaffAccess();
}

/** Where the login form should send a freshly-signed-in staff user -- call only after
 * getStaffAccessStatus() has already confirmed this is a real staff account. */
export async function getPostLoginPath() {
  const appUser = await getCurrentAppUser();
  if (!appUser) return "/dashboard";
  return resolvePostLoginPath(appUser);
}
