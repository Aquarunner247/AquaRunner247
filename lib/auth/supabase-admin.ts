import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Create Supabase Auth user or return existing id (same pattern as prisma seed). */
export async function resolveOrCreateAuthUserId(
  supabaseAdmin: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
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
    throw new Error(created.error?.message ?? "Supabase createUser failed");
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

  throw new Error(
    `An account for ${email} may exist in Supabase but could not be found. Check the Supabase dashboard or try a different email.`,
  );
}
