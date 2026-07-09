import type { User as SupabaseUser } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import type { User as AppUser } from "@/generated/prisma/client";

export async function getAppUserForAuthUser(supabaseUser: SupabaseUser): Promise<AppUser | null> {
  if (supabaseUser.id) {
    const byAuth = await prisma.user.findUnique({
      where: { authUserId: supabaseUser.id },
    });
    if (byAuth) return byAuth;
  }

  const email = supabaseUser.email?.toLowerCase();
  if (!email) return null;

  return prisma.user.findUnique({
    where: { email },
  });
}
