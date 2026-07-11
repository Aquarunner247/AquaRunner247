import type { User as SupabaseUser } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import type { CustomerUser } from "@/generated/prisma/client";

export async function getCustomerUserForAuthUser(supabaseUser: SupabaseUser): Promise<CustomerUser | null> {
  if (supabaseUser.id) {
    const byAuth = await prisma.customerUser.findUnique({
      where: { authUserId: supabaseUser.id },
    });
    if (byAuth) return byAuth;
  }

  const email = supabaseUser.email?.toLowerCase();
  if (!email) return null;

  return prisma.customerUser.findUnique({
    where: { email },
  });
}
