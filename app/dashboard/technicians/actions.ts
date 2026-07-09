"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { createOrFindAuthUser, createSupabaseAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");
  return appUser;
}

export async function createTechnician(formData: FormData) {
  const appUser = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "TECHNICIAN").trim();
  if (!name || !email || !password) return;
  if (password.length < 8) return;

  const role = (Object.values(UserRole) as string[]).includes(roleRaw) ? (roleRaw as UserRole) : UserRole.TECHNICIAN;

  const authUserId = await createOrFindAuthUser(email, password);

  await prisma.user.upsert({
    where: { email },
    create: {
      organizationId: appUser.organizationId,
      authUserId,
      email,
      name,
      phone: phone || null,
      role,
      active: true,
    },
    update: {
      authUserId,
      name,
      phone: phone || null,
      role,
      active: true,
    },
  });

  revalidatePath("/dashboard/technicians");
}

export async function deleteTechnician(formData: FormData) {
  const appUser = await requireAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return;

  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: appUser.organizationId },
    select: { id: true, authUserId: true },
  });
  if (!user) return;

  await prisma.user.delete({ where: { id: user.id } });

  // Best-effort: also remove their Supabase Auth login so they can't sign in anymore.
  if (user.authUserId) {
    try {
      const supabaseAdmin = createSupabaseAdminClient();
      await supabaseAdmin.auth.admin.deleteUser(user.authUserId);
    } catch {
      // Non-critical — the app profile is gone either way; auth cleanup can be done manually if needed.
    }
  }

  revalidatePath("/dashboard/technicians");
}
