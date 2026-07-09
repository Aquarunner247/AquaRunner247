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

function toDecimalOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function createChemicalProduct(formData: FormData) {
  const appUser = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim();
  const costPerUnit = toDecimalOrNull(formData.get("costPerUnit"));
  const chargePerUnit = toDecimalOrNull(formData.get("chargePerUnit"));
  if (!name || !unit || costPerUnit == null || chargePerUnit == null) return;

  await prisma.chemicalProduct.upsert({
    where: { organizationId_name: { organizationId: appUser.organizationId, name } },
    create: {
      organizationId: appUser.organizationId,
      name,
      unit,
      costPerUnit,
      chargePerUnit,
      active: true,
    },
    update: {
      unit,
      costPerUnit,
      chargePerUnit,
      active: true,
    },
  });

  revalidatePath("/dashboard/chemicals");
}

export async function updateChemicalProduct(formData: FormData) {
  const appUser = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim();
  const costPerUnit = toDecimalOrNull(formData.get("costPerUnit"));
  const chargePerUnit = toDecimalOrNull(formData.get("chargePerUnit"));
  if (!id || !name || !unit || costPerUnit == null || chargePerUnit == null) return;

  const product = await prisma.chemicalProduct.findFirst({
    where: { id, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!product) return;

  await prisma.chemicalProduct.update({
    where: { id: product.id },
    data: { name, unit, costPerUnit, chargePerUnit },
  });

  revalidatePath("/dashboard/chemicals");
  redirect("/dashboard/chemicals");
}

export async function deleteChemicalProduct(formData: FormData) {
  const appUser = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const product = await prisma.chemicalProduct.findFirst({
    where: { id, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!product) return;

  await prisma.chemicalProduct.delete({ where: { id: product.id } });
  revalidatePath("/dashboard/chemicals");
}
