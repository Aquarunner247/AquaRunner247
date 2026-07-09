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
 */
export async function createOrFindAuthUser(email: string, password: string): Promise<string> {
  const supabaseAdmin = createSupabaseAdminClient();

  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!created.error && created.data.user?.id) {
    return created.data.user.id;
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
    if (found?.id) return found.id;
    if (data.users.length < perPage) break;
    page += 1;
  }

  throw new Error(`User ${email} exists in Supabase but could not be listed.`);
}
