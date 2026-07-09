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

export async function createChecklistItem(formData: FormData) {
  const appUser = await requireAdmin();
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return;

  const maxSort = await prisma.checklistItemDefinition.aggregate({
    where: { organizationId: appUser.organizationId },
    _max: { sortOrder: true },
  });

  await prisma.checklistItemDefinition.create({
    data: {
      organizationId: appUser.organizationId,
      label,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      active: true,
    },
  });

  revalidatePath("/dashboard/checklist");
}

export async function deleteChecklistItem(formData: FormData) {
  const appUser = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const item = await prisma.checklistItemDefinition.findFirst({
    where: { id, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!item) return;

  await prisma.checklistItemDefinition.delete({ where: { id: item.id } });
  revalidatePath("/dashboard/checklist");
}
