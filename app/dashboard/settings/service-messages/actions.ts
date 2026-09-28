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

const MAX_LABEL = 80;
const MAX_BODY = 600;

function parseFields(formData: FormData): { label: string; body: string } | null {
  const label = String(formData.get("label") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!label || !body) return null;
  if (label.length > MAX_LABEL || body.length > MAX_BODY) return null;
  return { label, body };
}

export async function createServiceMessage(formData: FormData) {
  const appUser = await requireAdmin();
  const fields = parseFields(formData);
  if (!fields) return;

  // New messages go last so adding one never reorders what technicians are used to seeing.
  const last = await prisma.serviceMessageTemplate.aggregate({
    where: { organizationId: appUser.organizationId },
    _max: { sortOrder: true },
  });

  await prisma.serviceMessageTemplate.create({
    data: {
      organizationId: appUser.organizationId,
      label: fields.label,
      body: fields.body,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/dashboard/settings/service-messages");
  redirect("/dashboard/settings/service-messages?saved=1");
}

export async function updateServiceMessage(formData: FormData) {
  const appUser = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const fields = parseFields(formData);
  if (!id || !fields) return;

  const existing = await prisma.serviceMessageTemplate.findFirst({
    where: { id, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!existing) return;

  await prisma.serviceMessageTemplate.update({ where: { id: existing.id }, data: fields });

  revalidatePath("/dashboard/settings/service-messages");
  redirect("/dashboard/settings/service-messages?saved=1");
}

/**
 * Deactivates rather than deletes. A message that has already been sent should stay explicable,
 * and visits snapshot the text they sent anyway (ServiceVisit.serviceMessage), so removing the row
 * would only lose the admin's own history of what the options were.
 */
export async function toggleServiceMessage(formData: FormData) {
  const appUser = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const existing = await prisma.serviceMessageTemplate.findFirst({
    where: { id, organizationId: appUser.organizationId },
    select: { id: true, active: true },
  });
  if (!existing) return;

  await prisma.serviceMessageTemplate.update({
    where: { id: existing.id },
    data: { active: !existing.active },
  });

  revalidatePath("/dashboard/settings/service-messages");
  redirect("/dashboard/settings/service-messages?saved=1");
}

/** Moves one message up or down. Swaps sortOrder with its neighbour rather than renumbering the
 * whole list, so two admins reordering at once can't blank each other's work. */
export async function moveServiceMessage(formData: FormData) {
  const appUser = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const direction = String(formData.get("direction") ?? "").trim();
  if (!id || (direction !== "up" && direction !== "down")) return;

  const all = await prisma.serviceMessageTemplate.findMany({
    where: { organizationId: appUser.organizationId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });
  const index = all.findIndex((m) => m.id === id);
  if (index === -1) return;
  const swapWith = direction === "up" ? all[index - 1] : all[index + 1];
  if (!swapWith) return;

  const me = all[index];
  await prisma.$transaction([
    prisma.serviceMessageTemplate.update({ where: { id: me.id }, data: { sortOrder: swapWith.sortOrder } }),
    prisma.serviceMessageTemplate.update({ where: { id: swapWith.id }, data: { sortOrder: me.sortOrder } }),
  ]);

  revalidatePath("/dashboard/settings/service-messages");
  redirect("/dashboard/settings/service-messages?saved=1");
}
