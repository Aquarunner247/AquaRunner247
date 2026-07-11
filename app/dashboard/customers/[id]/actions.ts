"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BodyOfWaterType, EquipmentKind, FilterMedia, EquipmentPurpose } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { resolveManagementCompanyId } from "@/lib/management-companies";
import { geocodeAddress, buildFullAddress } from "@/lib/geocode";
import { CUSTOMER_DOCUMENTS_BUCKET, ensureCustomerDocumentsBucket } from "@/lib/customer-documents";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

function parseEquipmentFields(formData: FormData) {
  const kindRaw = String(formData.get("kind") ?? "").trim();
  const kind = (Object.values(EquipmentKind) as string[]).includes(kindRaw)
    ? (kindRaw as EquipmentKind)
    : EquipmentKind.OTHER;

  const make = String(formData.get("make") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const serialNumber = String(formData.get("serialNumber") ?? "").trim();
  const pipeSize = String(formData.get("pipeSize") ?? "").trim();
  const portsRaw = String(formData.get("numberOfPorts") ?? "").trim();
  const lastServicedRaw = String(formData.get("lastServicedAt") ?? "").trim();
  const horsepowerRaw = String(formData.get("horsepower") ?? "").trim();
  const voltage = String(formData.get("voltage") ?? "").trim();
  const btuRaw = String(formData.get("btu") ?? "").trim();
  const asmeCertified = formData.get("asmeCertified") === "on";
  const vgbaYearRaw = String(formData.get("vgbaYear") ?? "").trim();
  const manufacturedSump = formData.get("manufacturedSump") === "on";
  const equalizerAbandoned = formData.get("equalizerAbandoned") === "on";
  const minFlowRaw = String(formData.get("minFlowGpm") ?? "").trim();
  const maxFlowRaw = String(formData.get("maxFlowGpm") ?? "").trim();
  const filterMediaRaw = String(formData.get("filterMedia") ?? "").trim();
  const flowRateGpmRaw = String(formData.get("flowRateGpm") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const purposeRaw = String(formData.get("purpose") ?? "").trim();

  const numberOfPorts = portsRaw ? Number(portsRaw) : null;
  const lastServicedAt = lastServicedRaw ? new Date(lastServicedRaw) : null;
  const horsepower = horsepowerRaw ? Number(horsepowerRaw) : null;
  const btu = btuRaw ? Number(btuRaw) : null;
  const vgbaYear = vgbaYearRaw ? Number(vgbaYearRaw) : null;
  const minFlow = minFlowRaw ? Number(minFlowRaw) : null;
  const maxFlow = maxFlowRaw ? Number(maxFlowRaw) : null;
  const flowRateGpm = flowRateGpmRaw ? Number(flowRateGpmRaw) : null;
  const quantity = quantityRaw ? Number(quantityRaw) : null;
  const filterMedia = (Object.values(FilterMedia) as string[]).includes(filterMediaRaw)
    ? (filterMediaRaw as FilterMedia)
    : null;
  const purpose = (Object.values(EquipmentPurpose) as string[]).includes(purposeRaw)
    ? (purposeRaw as EquipmentPurpose)
    : null;

  const isSpaPurposeKind = kind === EquipmentKind.PUMP || kind === EquipmentKind.MAIN_DRAIN_COVER;
  const hasVgbaYear = kind === EquipmentKind.MAIN_DRAIN_COVER || kind === EquipmentKind.SKIMMER_COVER;
  const hasQuantity =
    kind === EquipmentKind.VALVE ||
    kind === EquipmentKind.FILTER ||
    kind === EquipmentKind.MAIN_DRAIN_COVER ||
    kind === EquipmentKind.SKIMMER_COVER;

  return {
    kind,
    data: {
      kind,
      make: make || null,
      model: model || null,
      // Filter and Main Drain Cover show a different field in place of serial # (see below),
      // so serialNumber is only ever submitted — and stored — for every other kind.
      serialNumber: kind === EquipmentKind.FILTER || kind === EquipmentKind.MAIN_DRAIN_COVER ? null : serialNumber || null,
      pipeSize: pipeSize || null,
      numberOfPorts: Number.isFinite(numberOfPorts) ? numberOfPorts : null,
      lastServicedAt: lastServicedAt && !Number.isNaN(lastServicedAt.getTime()) ? lastServicedAt : null,
      horsepower: kind === EquipmentKind.PUMP && Number.isFinite(horsepower) ? horsepower : null,
      voltage: kind === EquipmentKind.PUMP ? voltage || null : null,
      btu: kind === EquipmentKind.HEATER && Number.isFinite(btu) ? btu : null,
      asmeCertified: kind === EquipmentKind.HEATER ? asmeCertified : null,
      vgbaYear: hasVgbaYear && Number.isFinite(vgbaYear) ? vgbaYear : null,
      manufacturedSump: kind === EquipmentKind.MAIN_DRAIN_COVER ? manufacturedSump : null,
      flowRateGpm: kind === EquipmentKind.MAIN_DRAIN_COVER && Number.isFinite(flowRateGpm) ? flowRateGpm : null,
      equalizerAbandoned: kind === EquipmentKind.SKIMMER_COVER ? equalizerAbandoned : null,
      filterMedia: kind === EquipmentKind.FILTER ? filterMedia : null,
      quantity: hasQuantity && Number.isFinite(quantity) ? quantity : null,
      purpose: isSpaPurposeKind ? purpose : null,
    },
    minFlowRaw,
    maxFlowRaw,
    minFlow,
    maxFlow,
  };
}

// The min/max filter flow shown on the public QR log and CSV export live on the body of
// water itself (SNHD posts them per body, not per piece of equipment) — a Filter's entered
// values write through to those fields rather than being stored again on the Equipment row.
async function writeThroughFilterFlow(
  bodyId: string,
  kind: EquipmentKind,
  minFlowRaw: string,
  maxFlowRaw: string,
  minFlow: number | null,
  maxFlow: number | null,
) {
  if (kind !== EquipmentKind.FILTER || (!minFlowRaw && !maxFlowRaw)) return;
  await prisma.bodyOfWater.update({
    where: { id: bodyId },
    data: {
      minimumRequiredFlowGpm: minFlow != null && Number.isFinite(minFlow) ? minFlow : undefined,
      maximumFilterFlowGpm: maxFlow != null && Number.isFinite(maxFlow) ? maxFlow : undefined,
    },
  });
}

export async function createEquipment(formData: FormData) {
  const appUser = await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const bodyId = String(formData.get("bodyId") ?? "").trim();
  if (!customerId || !bodyId) return;

  const body = await prisma.bodyOfWater.findFirst({
    where: {
      id: bodyId,
      property: { organizationId: appUser.organizationId, customerId },
    },
    select: { id: true },
  });
  if (!body) return;

  const { kind, data, minFlowRaw, maxFlowRaw, minFlow, maxFlow } = parseEquipmentFields(formData);

  await prisma.equipment.create({
    data: { ...data, bodyOfWaterId: bodyId },
  });

  await writeThroughFilterFlow(bodyId, kind, minFlowRaw, maxFlowRaw, minFlow, maxFlow);

  revalidatePath("/dashboard/customers");
  revalidatePath(`/dashboard/customers/${customerId}`);
}

export async function updateEquipment(formData: FormData) {
  const appUser = await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const equipmentId = String(formData.get("equipmentId") ?? "").trim();
  if (!customerId || !equipmentId) return;

  const equipment = await prisma.equipment.findFirst({
    where: {
      id: equipmentId,
      bodyOfWater: { property: { organizationId: appUser.organizationId, customerId } },
    },
    select: { id: true, bodyOfWaterId: true },
  });
  if (!equipment) return;

  const { kind, data, minFlowRaw, maxFlowRaw, minFlow, maxFlow } = parseEquipmentFields(formData);

  await prisma.equipment.update({
    where: { id: equipment.id },
    data,
  });

  await writeThroughFilterFlow(equipment.bodyOfWaterId, kind, minFlowRaw, maxFlowRaw, minFlow, maxFlow);

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

export async function uploadCustomerDocument(formData: FormData) {
  const appUser = await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const file = formData.get("file");
  if (!customerId || !(file instanceof File) || file.size === 0) return;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!customer) return;

  const supabaseAdmin = await ensureCustomerDocumentsBucket();

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const storagePath = `${appUser.organizationId}/${customerId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(CUSTOMER_DOCUMENTS_BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });
  if (uploadError) {
    console.error("[customer documents] upload failed:", uploadError);
    return;
  }

  await prisma.customerDocument.create({
    data: {
      customerId,
      label: label || file.name,
      storagePath,
      contentType: file.type || null,
      fileSize: file.size,
    },
  });

  revalidatePath(`/dashboard/customers/${customerId}`);
}

export async function deleteCustomerDocument(formData: FormData) {
  const appUser = await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const documentId = String(formData.get("documentId") ?? "").trim();
  if (!customerId || !documentId) return;

  const document = await prisma.customerDocument.findFirst({
    where: { id: documentId, customer: { id: customerId, organizationId: appUser.organizationId } },
    select: { id: true, storagePath: true },
  });
  if (!document) return;

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    await supabaseAdmin.storage.from(CUSTOMER_DOCUMENTS_BUCKET).remove([document.storagePath]);
  } catch (err) {
    console.error("[customer documents] storage remove failed:", err);
  }

  await prisma.customerDocument.delete({ where: { id: document.id } });
  revalidatePath(`/dashboard/customers/${customerId}`);
}
