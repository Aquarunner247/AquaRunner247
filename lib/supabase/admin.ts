import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service role key.
 * Used for admin actions like creating technician logins.
 * Never import this from client components.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to manage users.");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Creates a Supabase Auth user with the given email/password, or — if that
 * email already exists — looks up and returns its existing auth user id.
 * Mirrors the same resolution logic used in prisma/seed.ts.
 *
 * `created` distinguishes the two outcomes, and callers must handle it: on the found branch the
 * password passed here was NEVER applied -- the existing account keeps whatever password it had. So
 * an email telling the customer "your temporary password is X" is only true when `created` is true
 * (see sendWelcomeEmail). It is returned as a required field rather than inferred, so a caller that
 * cares cannot quietly skip the distinction.
 */
export async function createOrFindAuthUser(
  email: string,
  password: string,
): Promise<{ id: string; created: boolean }> {
  const supabaseAdmin = createSupabaseAdminClient();

  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!created.error && created.data.user?.id) {
    return { id: created.data.user.id, created: true };
  }

  const msg = created.error?.message ?? "";
  if (!msg.toLowerCase().includes("already")) {
    throw new Error(`Supabase createUser failed for ${email}: ${msg || "unknown error"}`);
  }

  let page = 1;
  const perPage = 200;
  for (let i = 0; i < 10; i++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found?.id) return { id: found.id, created: false };
    if (data.users.length < perPage) break;
    page += 1;
  }

  throw new Error(`User ${email} exists in Supabase but could not be listed.`);
}
