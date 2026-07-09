import { createClient } from "@/lib/supabase/server";
import { getAppUserForAuthUser } from "@/lib/auth/prisma-user";

export async function getCurrentAppUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  try {
    const appUser = await getAppUserForAuthUser(user);
    if (!appUser) return null;
    return appUser;
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("[AquaRunner] getCurrentAppUser DB error:", e);
    }
    return null;
  }
}
