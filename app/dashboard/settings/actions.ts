"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

async function requireAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");
  return appUser;
}

export async function updateBusinessIdentity(formData: FormData) {
  const appUser = await requireAdmin();

  const businessName = String(formData.get("businessName") ?? "").trim();
  const businessPhone = String(formData.get("businessPhone") ?? "").trim();

  await prisma.organization.update({
    where: { id: appUser.organizationId },
    data: {
      businessName: businessName || null,
      businessPhone: businessPhone || null,
    },
  });

  revalidatePath("/dashboard/settings");
}
