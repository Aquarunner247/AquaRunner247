"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { parseChargeAmount } from "@/lib/checklist-charge";

/**
 * Which list is being edited. Residential and commercial are two separate lists that happen to
 * share a table, so every action has to say which one it means -- ordering, "add to the end" and
 * "swap with the one above" are all per-list questions. Anything unrecognized falls back to
 * COMMERCIAL, which is the column default and the only list that existed before 2026-10-14.
 */
type Scope = "COMMERCIAL" | "RESIDENTIAL";

function scopeFrom(formData: FormData): Scope {
  return String(formData.get("scope") ?? "") === "RESIDENTIAL" ? "RESIDENTIAL" : "COMMERCIAL";
}

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

  const scope = scopeFrom(formData);
  const category = String(formData.get("category") ?? "").trim();
  const billable = formData.get("billable") != null;
  const parsedCharge = parseChargeAmount(String(formData.get("chargeAmount") ?? ""));

  // Scoped to the list being added to. Unscoped, adding a residential item would get a sortOrder
  // past the end of the commercial list -- harmless on its own, but it makes the two lists share
  // one ever-growing number line, and "move up" compares against the wrong neighbours.
  const maxSort = await prisma.checklistItemDefinition.aggregate({
    where: { organizationId: appUser.organizationId, scope },
    _max: { sortOrder: true },
  });

  await prisma.checklistItemDefinition.create({
    data: {
      organizationId: appUser.organizationId,
      label,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      active: true,
      scope,
      // Commercial has no grouping and never gets one here, so it stays null and the technician
      // screen keeps rendering the flat list it always did.
      category: scope === "RESIDENTIAL" && category ? category : null,
      required: scope === "RESIDENTIAL" && formData.get("required") != null,
      billable: scope === "RESIDENTIAL" && billable,
      chargeAmount: scope === "RESIDENTIAL" && billable && parsedCharge.ok ? parsedCharge.value : null,
    },
  });

  revalidatePath("/dashboard/checklist");
}

/**
 * Required / chargeable / price for one residential item.
 *
 * Residential only, by the same reasoning as the rest of this work: commercial is settled and a
 * stray toggle there would start blocking technicians on properties nobody asked to change. The
 * check is on the stored row's scope, not on what the form claimed, so a hand-made POST cannot
 * make a commercial item required.
 *
 * Clearing "chargeable" clears the price with it rather than remembering it. A disabled price is
 * invisible on the screen, and an invisible number that comes back if the box is re-ticked is the
 * kind of thing that quietly charges a customer for a filter clean at last year's rate.
 */
export async function updateChecklistItemSettings(formData: FormData) {
  const appUser = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const item = await prisma.checklistItemDefinition.findFirst({
    where: { id, organizationId: appUser.organizationId, scope: "RESIDENTIAL" },
    select: { id: true },
  });
  if (!item) return;

  const billable = formData.get("billable") != null;
  const parsedCharge = parseChargeAmount(String(formData.get("chargeAmount") ?? ""));

  await prisma.checklistItemDefinition.update({
    where: { id: item.id },
    data: {
      required: formData.get("required") != null,
      billable,
      // An unparseable price leaves the stored one alone rather than nulling it: the admin mistyped,
      // and silently wiping a price they had already set would be the worse of the two outcomes.
      ...(billable
        ? parsedCharge.ok
          ? { chargeAmount: parsedCharge.value }
          : {}
        : { chargeAmount: null }),
    },
  });

  revalidatePath("/dashboard/checklist");
}

/** Swaps sortOrder with the adjacent item in current order -- direction is "up" or "down". */
export async function moveChecklistItem(formData: FormData) {
  const appUser = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const direction = String(formData.get("direction") ?? "").trim();
  if (!id || (direction !== "up" && direction !== "down")) return;

  // Within the one list. The two scopes are ordered independently and their sortOrder values
  // overlap, so an unscoped query would offer a commercial item as the residential list's
  // neighbour and swap a row between the two lists.
  const items = await prisma.checklistItemDefinition.findMany({
    where: { organizationId: appUser.organizationId, scope: scopeFrom(formData) },
    orderBy: { sortOrder: "asc" },
    select: { id: true, sortOrder: true },
  });

  const index = items.findIndex((item) => item.id === id);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= items.length) return;

  const current = items[index];
  const neighbor = items[swapIndex];

  await prisma.$transaction([
    prisma.checklistItemDefinition.update({ where: { id: current.id }, data: { sortOrder: neighbor.sortOrder } }),
    prisma.checklistItemDefinition.update({ where: { id: neighbor.id }, data: { sortOrder: current.sortOrder } }),
  ]);

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
