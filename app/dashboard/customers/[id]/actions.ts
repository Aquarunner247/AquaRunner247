"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BodyOfWaterType, EquipmentKind } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { resolveManagementCompanyId } from "@/lib/management-companies";
import { geocodeAddress, buildFullAddress } from "@/lib/geocode";

async function requireAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");
  return appUser;
}

export async function updateCustomer(formData: FormData) {
  const appUser = await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!customerId || !name) return;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!customer) return;

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      name,
      notes: notes || null,
    },
  });

  revalidatePath("/dashboard/customers");
  revalidatePath(`/dashboard/customers/${customer.id}`);
  redirect(`/dashboard/customers/${customer.id}?tab=overview`);
}

export async function updateProperty(formData: FormData) {
  const appUser = await requireAdmin();
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!propertyId || !name) return;

  const managerName = String(formData.get("managerName") ?? "").trim();
  const managerBusinessPhone = String(formData.get("managerBusinessPhone") ?? "").trim();
  const managerMobilePhone = String(formData.get("managerMobilePhone") ?? "").trim();
  const managerEmail = String(formData.get("managerEmail") ?? "").trim();
  const managementCompanyIdInput = String(formData.get("managementCompanyId") ?? "").trim();
  const newManagementCompanyName = String(formData.get("newManagementCompanyName") ?? "").trim();
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
  const addressLine2 = String(formData.get("addressLine2") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim();

  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId: appUser.organizationId },
    select: {
      id: true,
      customerId: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      region: true,
      postalCode: true,
    },
  });
  if (!property) return;

  const addressChanged =
    (property.addressLine1 ?? "") !== addressLine1 ||
    (property.addressLine2 ?? "") !== addressLine2 ||
    (property.city ?? "") !== city ||
    (property.region ?? "") !== region ||
    (property.postalCode ?? "") !== postalCode;

  const managementCompanyId = await resolveManagementCompanyId(
    appUser.organizationId,
    managementCompanyIdInput,
    newManagementCompanyName,
  );

  await prisma.property.update({
    where: { id: property.id },
    data: {
      name,
      managerName: managerName || null,
      managerBusinessPhone: managerBusinessPhone || null,
      managerMobilePhone: managerMobilePhone || null,
      managerPhone: [managerBusinessPhone, managerMobilePhone].filter(Boolean).join(" | ") || null,
      managerEmail: managerEmail || null,
      managementCompanyId,
      addressLine1: addressLine1 || null,
      addressLine2: addressLine2 || null,
      city: city || null,
      region: region || null,
      postalCode: postalCode || null,
    },
  });

  if (addressChanged) {
    try {
      const fullAddress = buildFullAddress({ addressLine1, addressLine2, city, region, postalCode, country: "US" });
      const geo = await geocodeAddress(fullAddress);
      if (geo) {
        await prisma.property.update({
          where: { id: property.id },
          data: { latitude: geo.latitude, longitude: geo.longitude },
        });
      }
    } catch {
      // Non-critical — admin can re-geocode manually from the Routes page.
    }
  }

  revalidatePath("/dashboard/customers");
  revalidatePath(`/dashboard/customers/${property.customerId}`);
  redirect(`/dashboard/customers/${property.customerId}?tab=overview`);
}

export async function updateBodyOfWater(formData: FormData) {
  const appUser = await requireAdmin();
  const bodyId = String(formData.get("bodyId") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const typeRaw = String(formData.get("type") ?? "").trim();
  const volumeRaw = String(formData.get("volumeGallons") ?? "").trim();
  const occupancyRaw = String(formData.get("maximumOccupancy") ?? "").trim();
  if (!bodyId || !customerId || !name) return;

  const body = await prisma.bodyOfWater.findFirst({
    where: {
      id: bodyId,
      property: { organizationId: appUser.organizationId, customerId },
    },
    select: { id: true },
  });
  if (!body) return;

  const type = (Object.values(BodyOfWaterType) as string[]).includes(typeRaw)
    ? (typeRaw as BodyOfWaterType)
    : BodyOfWaterType.POOL;
  const volume = volumeRaw ? Number(volumeRaw) : null;
  const occupancy = occupancyRaw ? Number(occupancyRaw) : null;

  await prisma.bodyOfWater.update({
    where: { id: body.id },
    data: {
      name,
      type,
      volumeGallons: Number.isFinite(volume) ? volume : null,
      maximumOccupancy: Number.isFinite(occupancy) ? occupancy : null,
    },
  });

  revalidatePath("/dashboard/customers");
  revalidatePath(`/dashboard/customers/${customerId}`);
}

export async function deleteBodyOfWater(formData: FormData) {
  const appUser = await requireAdmin();
  const bodyId = String(formData.get("bodyId") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!bodyId || !customerId) return;

  const body = await prisma.bodyOfWater.findFirst({
    where: {
      id: bodyId,
      property: { organizationId: appUser.organizationId, customerId },
    },
    select: { id: true },
  });
  if (!body) return;

  await prisma.bodyOfWater.delete({ where: { id: body.id } });

  revalidatePath("/dashboard/customers");
  revalidatePath(`/dashboard/customers/${customerId}`);
  redirect(`/dashboard/customers/${customerId}?tab=bodies`);
}

export async function createEquipment(formData: FormData) {
  const appUser = await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const bodyId = String(formData.get("bodyId") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "").trim();
  const make = String(formData.get("make") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const serialNumber = String(formData.get("serialNumber") ?? "").trim();
  const pipeSize = String(formData.get("pipeSize") ?? "").trim();
  const portsRaw = String(formData.get("numberOfPorts") ?? "").trim();
  const lastServicedRaw = String(formData.get("lastServicedAt") ?? "").trim();
  if (!customerId || !bodyId) return;

  const body = await prisma.bodyOfWater.findFirst({
    where: {
      id: bodyId,
      property: { organizationId: appUser.organizationId, customerId },
    },
    select: { id: true },
  });
  if (!body) return;

  const kind = (Object.values(EquipmentKind) as string[]).includes(kindRaw)
    ? (kindRaw as EquipmentKind)
    : EquipmentKind.OTHER;
  const numberOfPorts = portsRaw ? Number(portsRaw) : null;
  const lastServicedAt = lastServicedRaw ? new Date(lastServicedRaw) : null;

  await prisma.equipment.create({
    data: {
      bodyOfWaterId: bodyId,
      kind,
      make: make || null,
      model: model || null,
      serialNumber: serialNumber || null,
      pipeSize: pipeSize || null,
      numberOfPorts: Number.isFinite(numberOfPorts) ? numberOfPorts : null,
      lastServicedAt: lastServicedAt && !Number.isNaN(lastServicedAt.getTime()) ? lastServicedAt : null,
    },
  });

  revalidatePath("/dashboard/customers");
  revalidatePath(`/dashboard/customers/${customerId}`);
}

export async function deleteEquipment(formData: FormData) {
  const appUser = await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const equipmentId = String(formData.get("equipmentId") ?? "").trim();
  if (!customerId || !equipmentId) return;

  const equipment = await prisma.equipment.findFirst({
    where: {
      id: equipmentId,
      bodyOfWater: {
        property: { organizationId: appUser.organizationId, customerId },
      },
    },
    select: { id: true },
  });
  if (!equipment) return;

  await prisma.equipment.delete({ where: { id: equipment.id } });

  revalidatePath("/dashboard/customers");
  revalidatePath(`/dashboard/customers/${customerId}`);
}

export async function deleteCustomer(formData: FormData) {
  const appUser = await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!customerId) return;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!customer) return;

  await prisma.$transaction(async (tx) => {
    const props = await tx.property.findMany({
      where: { customerId: customer.id, organizationId: appUser.organizationId },
      select: { id: true },
    });
    const propertyIds = props.map((p) => p.id);
    if (propertyIds.length) {
      await tx.property.deleteMany({
        where: {
          id: { in: propertyIds },
          organizationId: appUser.organizationId,
        },
      });
    }
    await tx.customer.delete({ where: { id: customer.id } });
  });

  revalidatePath("/dashboard/customers");
  redirect("/dashboard/customers");
}
