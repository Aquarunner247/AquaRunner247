"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { parseFormNumber as toDecimalOrNull } from "@/lib/form-utils";
import { uploadSdsForOrgProduct, removeSdsForOrgProduct } from "@/lib/sds-documents";

async function requireAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");
  return appUser;
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

const CHEMICAL_TYPES = ["FREE_CHLORINE", "PH_UP", "PH_DOWN", "ALKALINITY_UP", "ALKALINITY_DOWN", "CYA", "CALCIUM_HARDNESS", "SALT"] as const;
type ChemicalTypeValue = (typeof CHEMICAL_TYPES)[number];
/** PH_DOWN/ALKALINITY_DOWN share a compliance target with their _UP counterpart -- see
 * OrgComplianceTarget's schema doc comment. Writing a target for these here would
 * round-trip fine on this page but be silently ignored by the dosing calculator, which
 * always resolves to the _UP row. */
const NO_OWN_TARGET: ChemicalTypeValue[] = ["PH_DOWN", "ALKALINITY_DOWN"];

/**
 * One submit per ChemicalType group on the Dosing Product Catalog section. Handles every
 * enabled/price/primary toggle for that group's catalog products, plus that chemical's
 * compliance target (skipped for PH_DOWN/ALKALINITY_DOWN, see NO_OWN_TARGET), in one pass.
 * Re-queries the group's catalog rows itself rather than trusting a client-submitted id
 * list, so a stale/tampered form can't touch products outside its own chemicalType.
 */
export async function updateChemicalTypeSettings(formData: FormData) {
  const appUser = await requireAdmin();
  const chemicalTypeRaw = String(formData.get("chemicalType") ?? "").trim();
  if (!CHEMICAL_TYPES.includes(chemicalTypeRaw as ChemicalTypeValue)) return;
  const chemicalType = chemicalTypeRaw as ChemicalTypeValue;

  const catalogProducts = await prisma.chemicalProductCatalog.findMany({ where: { chemicalType }, select: { id: true } });
  const primaryPick = String(formData.get("primary") ?? "").trim();

  // Re-fetch the org's own billing product ids rather than trusting the submitted
  // `billing_${id}` value directly -- same "don't trust a client-submitted id" posture as
  // catalogProducts being re-queried instead of read off the form.
  const orgBillingProducts = await prisma.chemicalProduct.findMany({
    where: { organizationId: appUser.organizationId },
    select: { id: true },
  });
  const orgBillingProductIds = new Set(orgBillingProducts.map((p) => p.id));

  const existingSettings = await prisma.orgChemicalProductSetting.findMany({
    where: { organizationId: appUser.organizationId, catalogProductId: { in: catalogProducts.map((p) => p.id) } },
  });
  const existingByProductId = new Map(existingSettings.map((s) => [s.catalogProductId, s]));

  for (const p of catalogProducts) {
    const isEnabled = formData.get(`enabled_${p.id}`) != null;
    const price = toDecimalOrNull(formData.get(`price_${p.id}`));
    const isPrimary = isEnabled && primaryPick === p.id;
    const billingRaw = String(formData.get(`billing_${p.id}`) ?? "").trim();
    const linkedBillingProductId = billingRaw && orgBillingProductIds.has(billingRaw) ? billingRaw : null;

    // Skip the write entirely when nothing actually changed -- the isPrimary fallback
    // below relies on updatedAt reflecting the last REAL change to a row, which an
    // unconditional upsert on every submit would defeat.
    const existing = existingByProductId.get(p.id);
    const unchanged =
      existing != null &&
      existing.isEnabled === isEnabled &&
      (existing.price != null ? Number(existing.price) : null) === price &&
      existing.isPrimary === isPrimary &&
      (existing.linkedBillingProductId ?? null) === linkedBillingProductId;
    if (unchanged) continue;

    await prisma.orgChemicalProductSetting.upsert({
      where: { organizationId_catalogProductId: { organizationId: appUser.organizationId, catalogProductId: p.id } },
      create: { organizationId: appUser.organizationId, catalogProductId: p.id, isEnabled, price, isPrimary, linkedBillingProductId },
      update: { isEnabled, price, isPrimary, linkedBillingProductId },
    });
  }

  // Service-layer isPrimary enforcement: if no explicit radio pick resolved to an enabled
  // row above, auto-default primary to whichever enabled row was enabled first (oldest
  // updatedAt among the just-written enabled rows), so a group with 2+ enabled products
  // never ends up with zero primaries.
  const enabledSettings = await prisma.orgChemicalProductSetting.findMany({
    where: { organizationId: appUser.organizationId, isEnabled: true, catalogProduct: { chemicalType } },
    orderBy: { updatedAt: "asc" },
  });
  if (enabledSettings.length > 0 && !enabledSettings.some((s) => s.isPrimary)) {
    await prisma.orgChemicalProductSetting.update({ where: { id: enabledSettings[0].id }, data: { isPrimary: true } });
  }

  if (!NO_OWN_TARGET.includes(chemicalType)) {
    const orgState = (await prisma.organization.findUnique({ where: { id: appUser.organizationId }, select: { state: true } }))?.state ?? null;
    const orgTargetMin = toDecimalOrNull(formData.get("targetMin"));
    const orgTargetMax = toDecimalOrNull(formData.get("targetMax"));
    const orgTargetValue = toDecimalOrNull(formData.get("targetValue"));

    // Only write when there's actually something to persist -- an empty target form
    // (state-midpoint default, nothing entered) has nothing meaningful to store.
    if (orgTargetMin != null || orgTargetMax != null || orgTargetValue != null) {
      await prisma.orgComplianceTarget.upsert({
        where: { organizationId_chemicalType: { organizationId: appUser.organizationId, chemicalType } },
        create: { organizationId: appUser.organizationId, state: orgState, chemicalType, orgTargetMin, orgTargetMax, orgTargetValue },
        update: { state: orgState, orgTargetMin, orgTargetMax, orgTargetValue },
      });
    }
  }

  revalidatePath("/dashboard/chemicals");
}

export async function uploadChemicalSds(formData: FormData) {
  const appUser = await requireAdmin();
  const catalogProductId = String(formData.get("catalogProductId") ?? "").trim();
  if (!catalogProductId) return;
  await uploadSdsForOrgProduct(appUser.organizationId, catalogProductId, formData);
  revalidatePath("/dashboard/chemicals");
}

export async function removeChemicalSds(formData: FormData) {
  const appUser = await requireAdmin();
  const catalogProductId = String(formData.get("catalogProductId") ?? "").trim();
  if (!catalogProductId) return;
  await removeSdsForOrgProduct(appUser.organizationId, catalogProductId);
  revalidatePath("/dashboard/chemicals");
}
