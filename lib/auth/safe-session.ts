import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { User as AppUser } from "@/generated/prisma/client";
import { createClient } from "@/lib/supabase/server";
import { getAppUserForAuthUser } from "@/lib/auth/prisma-user";

/**
 * Session + app user for root layout. Never throws — avoids 500s when DB is down or Prisma misconfigured.
 */
export async function getOptionalSessionForLayout(): Promise<{
  user: SupabaseUser | null;
  appUser: AppUser | null;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { user: null, appUser: null };

    try {
      const appUser = await getAppUserForAuthUser(user);
      return { user, appUser };
    } catch (e) {
      if (process.env.NODE_ENV === "development") {
        console.error("[AquaRunner] getAppUserForAuthUser failed (check DATABASE_URL / migrations):", e);
      }
      return { user, appUser: null };
    }
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("[AquaRunner] Supabase session read failed (check NEXT_PUBLIC_SUPABASE_*):", e);
    }
    return { user: null, appUser: null };
  }
}
