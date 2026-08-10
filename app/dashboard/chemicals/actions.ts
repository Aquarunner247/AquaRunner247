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

/**
 * One submit per ChemicalType group on the Dosing Product Catalog section --
 * dosing-calculator-spec.md Sections 1b/1c/3. Handles every enabled/price/primary toggle
 * for that group's catalog products, plus that chemical's compliance target, in one pass.
 * Re-queries the group's catalog rows itself rather than trusting a client-submitted id
 * list, so a stale/tampered form can't touch products outside its own chemicalType.
 */
export async function updateChemicalTypeSettings(formData: FormData) {
  const appUser = await requireAdmin();
  const chemicalTypeRaw = String(formData.get("chemicalType") ?? "").trim();
  const validTypes = ["FREE_CHLORINE", "PH_UP", "PH_DOWN", "ALKALINITY_UP", "CYA", "CALCIUM_HARDNESS", "SALT"];
  if (!validTypes.includes(chemicalTypeRaw)) return;
  const chemicalType = chemicalTypeRaw as
    | "FREE_CHLORINE"
    | "PH_UP"
    | "PH_DOWN"
    | "ALKALINITY_UP"
    | "CYA"
    | "CALCIUM_HARDNESS"
    | "SALT";

  const catalogProducts = await prisma.chemicalProductCatalog.findMany({ where: { chemicalType }, select: { id: true } });
  const primaryPick = String(formData.get("primary") ?? "").trim();

  for (const p of catalogProducts) {
    const isEnabled = formData.get(`enabled_${p.id}`) != null;
    const price = toDecimalOrNull(formData.get(`price_${p.id}`));
    const isPrimary = isEnabled && primaryPick === p.id;

    await prisma.orgChemicalProductSetting.upsert({
      where: { organizationId_catalogProductId: { organizationId: appUser.organizationId, catalogProductId: p.id } },
      create: { organizationId: appUser.organizationId, catalogProductId: p.id, isEnabled, price, isPrimary },
      update: { isEnabled, price, isPrimary },
    });
  }

  // Service-layer isPrimary enforcement (spec Section 1b): if no explicit radio pick
  // resolved to an enabled row above, auto-default primary to whichever enabled row was
  // enabled first (oldest updatedAt among the just-written enabled rows), so a group with
  // 2+ enabled products never ends up with zero primaries.
  const enabledSettings = await prisma.orgChemicalProductSetting.findMany({
    where: { organizationId: appUser.organizationId, isEnabled: true, catalogProduct: { chemicalType } },
    orderBy: { createdAt: "asc" },
  });
  if (enabledSettings.length > 0 && !enabledSettings.some((s) => s.isPrimary)) {
    await prisma.orgChemicalProductSetting.update({ where: { id: enabledSettings[0].id }, data: { isPrimary: true } });
  }

  const orgState = (await prisma.organization.findUnique({ where: { id: appUser.organizationId }, select: { state: true } }))?.state;
  const targetMode = String(formData.get("targetMode") ?? "STATE_MIDPOINT") === "ORG_CUSTOM" ? "ORG_CUSTOM" : "STATE_MIDPOINT";
  if (orgState) {
    const orgTargetMin = toDecimalOrNull(formData.get("targetMin"));
    const orgTargetMax = toDecimalOrNull(formData.get("targetMax"));
    const orgTargetValue = toDecimalOrNull(formData.get("targetValue"));
    await prisma.orgComplianceTarget.upsert({
      where: { organizationId_state_chemicalType: { organizationId: appUser.organizationId, state: orgState, chemicalType } },
      create: { organizationId: appUser.organizationId, state: orgState, chemicalType, targetMode, orgTargetMin, orgTargetMax, orgTargetValue },
      update: { targetMode, orgTargetMin, orgTargetMax, orgTargetValue },
    });
  }

  revalidatePath("/dashboard/chemicals");
}
