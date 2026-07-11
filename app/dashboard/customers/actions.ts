"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BodyOfWaterType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { resolveManagementCompanyId } from "@/lib/management-companies";
import { geocodeAddress, buildFullAddress, readAutocompleteCoords } from "@/lib/geocode";

async function requireAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");
  return appUser;
}

export async function createCustomer(formData: FormData) {
  const appUser = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const managerName = String(formData.get("managerName") ?? "").trim();
  const managerBusinessPhone = String(formData.get("managerBusinessPhone") ?? "").trim();
  const managerMobilePhone = String(formData.get("managerMobilePhone") ?? "").trim();
  const managerEmail = String(formData.get("managerEmail") ?? "").trim();
  const maintenanceName = String(formData.get("maintenanceName") ?? "").trim();
  const maintenanceCellPhone = String(formData.get("maintenanceCellPhone") ?? "").trim();
  const maintenanceEmail = String(formData.get("maintenanceEmail") ?? "").trim();
  const managementCompanyId = String(formData.get("managementCompanyId") ?? "").trim();
  const newManagementCompanyName = String(formData.get("newManagementCompanyName") ?? "").trim();
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
  const addressLine2 = String(formData.get("addressLine2") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const initialBodyName = String(formData.get("initialBodyName") ?? "").trim();
  const initialBodyTypeRaw = String(formData.get("initialBodyType") ?? "POOL").trim();
  const initialBodyVolumeRaw = String(formData.get("initialBodyVolumeGallons") ?? "").trim();

  if (!name) return;

  const customer = await prisma.customer.create({
    data: {
      organizationId: appUser.organizationId,
      name,
      notes: notes || null,
    },
    select: { id: true },
  });

  const resolvedManagementCompanyId = await resolveManagementCompanyId(
    appUser.organizationId,
    managementCompanyId,
    newManagementCompanyName,
  );

  const property = await prisma.property.create({
    data: {
      organizationId: appUser.organizationId,
      customerId: customer.id,
      name,
      managerName: managerName || null,
      managerBusinessPhone: managerBusinessPhone || null,
      managerMobilePhone: managerMobilePhone || null,
      managerPhone: [managerBusinessPhone, managerMobilePhone].filter(Boolean).join(" | ") || null,
      managerEmail: managerEmail || null,
      maintenanceName: maintenanceName || null,
      maintenanceCellPhone: maintenanceCellPhone || null,
      maintenanceEmail: maintenanceEmail || null,
      managementCompanyId: resolvedManagementCompanyId,
      addressLine1: addressLine1 || null,
      addressLine2: addressLine2 || null,
      city: city || null,
      region: region || null,
      postalCode: postalCode || null,
      country: "US",
    },
    select: { id: true },
  });

  // If the admin picked an address-autocomplete suggestion, its coordinates are already exact —
  // skip the geocode lookup. Otherwise fall back to a best-effort geocode; failures are silent.
  const autocompleteCoords = readAutocompleteCoords(formData);
  try {
    const geo = autocompleteCoords ?? (await geocodeAddress(buildFullAddress({ addressLine1, addressLine2, city, region, postalCode, country: "US" })));
    if (geo) {
      await prisma.property.update({
        where: { id: property.id },
        data: { latitude: geo.latitude, longitude: geo.longitude },
      });
    }
  } catch {
    // Non-critical — admin can geocode manually later from the Routes page.
  }

  if (initialBodyName) {
    const initialBodyType =
      (Object.values(BodyOfWaterType) as string[]).includes(initialBodyTypeRaw)
        ? (initialBodyTypeRaw as BodyOfWaterType)
        : BodyOfWaterType.POOL;
    const initialBodyVolume = initialBodyVolumeRaw ? Number(initialBodyVolumeRaw) : null;
    await prisma.bodyOfWater.create({
      data: {
        propertyId: property.id,
        name: initialBodyName,
        type: initialBodyType,
        volumeGallons: Number.isFinite(initialBodyVolume) ? initialBodyVolume : null,
      },
    });
  }

  revalidatePath("/dashboard/customers");
  redirect("/dashboard/customers");
}

export async function createProperty(formData: FormData) {
  const appUser = await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const managerName = String(formData.get("managerName") ?? "").trim();
  if (!customerId || !name) return;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!customer) return;

  await prisma.property.create({
    data: {
      organizationId: appUser.organizationId,
      customerId,
      name,
      managerName: managerName || null,
      country: "US",
    },
  });

  revalidatePath("/dashboard/customers");
}

export async function createBodyOfWater(formData: FormData) {
  const appUser = await requireAdmin();
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const typeRaw = String(formData.get("type") ?? "POOL").trim();
  const volumeRaw = String(formData.get("volumeGallons") ?? "").trim();
  const occupancyRaw = String(formData.get("maximumOccupancy") ?? "").trim();
  if (!propertyId || !name) return;

  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!property) return;

  const type = (Object.values(BodyOfWaterType) as string[]).includes(typeRaw) ? (typeRaw as BodyOfWaterType) : BodyOfWaterType.POOL;
  const volume = volumeRaw ? Number(volumeRaw) : null;
  const occupancy = occupancyRaw ? Number(occupancyRaw) : null;

  await prisma.bodyOfWater.create({
    data: {
      propertyId,
      name,
      type,
      volumeGallons: Number.isFinite(volume) ? volume : null,
      maximumOccupancy: Number.isFinite(occupancy) ? occupancy : null,
    },
  });

  const returnPath = String(formData.get("returnPath") ?? "").trim();
  revalidatePath("/dashboard/customers");
  if (returnPath.startsWith("/dashboard/customers")) {
    revalidatePath(returnPath);
  }
}
