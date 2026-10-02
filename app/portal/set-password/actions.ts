"use server";

import { redirect } from "next/navigation";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Matches the minimum the admin form enforces when typing the temporary one. */
const MIN_LENGTH = 8;

export type SetPortalPasswordResult = { error: string } | undefined;

/**
 * Replaces the temporary password a portal login was created with, and clears the flag that forces
 * this screen.
 *
 * Both halves happen here, in one server action, rather than letting the browser change the password
 * and then asking the server to clear the flag -- those could come apart, and the flag is the only
 * thing standing between an emailed password and the portal. The password is set with the service
 * role key for the caller's OWN authUserId, which is read from their session and never from the form.
 *
 * The new password is never logged, and nothing here writes it anywhere but Supabase Auth.
 */
export async function setPortalPassword(formData: FormData): Promise<SetPortalPasswordResult> {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) redirect("/portal/login?error=no-access");

  // Already done, in another tab or a double submit. Not an error -- send them where they were going.
  if (!customerUser.mustChangePassword) redirect("/portal");

  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < MIN_LENGTH) return { error: `Please use at least ${MIN_LENGTH} characters.` };
  if (password !== confirmPassword) return { error: "Those two passwords don't match." };
  if (password.toLowerCase() === customerUser.email.toLowerCase()) {
    return { error: "Please don't use your email address as your password." };
  }

  if (!customerUser.authUserId) {
    // Nothing to update: the row exists but was never linked to a Supabase account, so there is no
    // password to change and no safe way to guess which account was meant.
    return { error: "This login isn't finished being set up. Please contact your pool service company." };
  }

  // The whole point of this screen is getting off the password that was emailed in plain text, and
  // re-entering it would satisfy a naive length check while leaving it exactly where it was. There is
  // no stored copy to compare against -- by design -- so the current password is tested the only way
  // it can be: by trying it. A standalone client with no session, so this cannot disturb their own.
  if (await isCurrentPassword(customerUser.email, password)) {
    return { error: "That's the password from your email. Please choose a different one." };
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { error } = await supabaseAdmin.auth.admin.updateUserById(customerUser.authUserId, { password });
  if (error) {
    // Supabase's own message is safe to show here: this is the account holder changing their own
    // password, so there is nothing to leak to them, and "password is too weak" or "too short" is more
    // useful than a generic failure.
    return { error: error.message };
  }

  // Only after the password actually changed. If the update above fails the flag stays set and they
  // land back here, which is the right way round.
  await prisma.customerUser.update({
    where: { id: customerUser.id },
    data: { mustChangePassword: false },
  });

  redirect("/portal");
}

/**
 * True when `password` is the account's current password.
 *
 * Returns false when it cannot tell -- a missing anon key, a network failure, or a rate-limited
 * attempt. Failing open is deliberate: this check exists to catch someone retyping the password from
 * their email, and refusing to let anyone set a password because an optional check was unavailable
 * would be a worse outcome than a customer keeping a password they were already given.
 */
async function isCurrentPassword(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return false;

  try {
    const probe = createSupabaseJsClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await probe.auth.signInWithPassword({ email, password });
    if (error || !data.session) return false;
    // Discard the session this just minted -- it was never meant to be used, and leaving a valid
    // refresh token lying around would be a second live credential for no reason.
    await probe.auth.signOut();
    return true;
  } catch {
    return false;
  }
}
