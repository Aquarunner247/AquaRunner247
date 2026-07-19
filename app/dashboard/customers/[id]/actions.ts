"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BodyOfWaterType, EquipmentKind, FilterMedia, EquipmentPurpose } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { resolveManagementCompanyId } from "@/lib/management-companies";
import { geocodeAddress, buildFullAddress, readAutocompleteCoords } from "@/lib/geocode";
import { uploadDocumentForCustomer, deleteDocumentForCustomer } from "@/lib/customer-documents";
import { createSupabaseAdminClient, createOrFindAuthUser } from "@/lib/supabase/admin";
import { sendCustomerAlertEmail } from "@/lib/email";
import { parseReadingsCsv, parseTimeOfDay } from "@/lib/csv-import";

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

/**
 * Customer info and their primary property live in one merged form in the UI, so this saves
 * both in a single action. (A customer's additional properties, if any, still have their own
 * separate edit form/action further down the page.)
 */
export async function updateCustomerAndPrimaryProperty(formData: FormData) {
  const appUser = await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!customerId || !propertyId || !name) return;

  const notes = String(formData.get("notes") ?? "").trim();
  const managerName = String(formData.get("managerName") ?? "").trim();
  const managerBusinessPhone = String(formData.get("managerBusinessPhone") ?? "").trim();
  const managerMobilePhone = String(formData.get("managerMobilePhone") ?? "").trim();
  const managerEmail = String(formData.get("managerEmail") ?? "").trim();
  const maintenanceName = String(formData.get("maintenanceName") ?? "").trim();
  const maintenanceCellPhone = String(formData.get("maintenanceCellPhone") ?? "").trim();
  const maintenanceEmail = String(formData.get("maintenanceEmail") ?? "").trim();
  const managementCompanyIdInput = String(formData.get("managementCompanyId") ?? "").trim();
  const newManagementCompanyName = String(formData.get("newManagementCompanyName") ?? "").trim();
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
  const addressLine2 = String(formData.get("addressLine2") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim();

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!customer) return;

  const property = await prisma.property.findFirst({
    where: { id: propertyId, organizationId: appUser.organizationId, customerId: customer.id },
    select: { id: true, addressLine1: true, addressLine2: true, city: true, region: true, postalCode: true },
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

  await prisma.customer.update({
    where: { id: customer.id },
    data: { name, notes: notes || null },
  });

  await prisma.property.update({
    where: { id: property.id },
    data: {
      name,
      managerName: managerName || null,
      managerBusinessPhone: managerBusinessPhone || null,
      managerMobilePhone: managerMobilePhone || null,
      managerPhone: [managerBusinessPhone, managerMobilePhone].filter(Boolean).join(" | ") || null,
      managerEmail: managerEmail || null,
      maintenanceName: maintenanceName || null,
      maintenanceCellPhone: maintenanceCellPhone || null,
      maintenanceEmail: maintenanceEmail || null,
      managementCompanyId,
      addressLine1: addressLine1 || null,
      addressLine2: addressLine2 || null,
      city: city || null,
      region: region || null,
      postalCode: postalCode || null,
    },
  });

  // If the admin picked an address-autocomplete suggestion, its coordinates are already exact —
  // skip the geocode lookup. Otherwise, only re-geocode if the address actually changed.
  const autocompleteCoords = readAutocompleteCoords(formData);
  if (autocompleteCoords) {
    await prisma.property.update({
      where: { id: property.id },
      data: { latitude: autocompleteCoords.latitude, longitude: autocompleteCoords.longitude },
    });
  } else if (addressChanged) {
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
  const maintenanceName = String(formData.get("maintenanceName") ?? "").trim();
  const maintenanceCellPhone = String(formData.get("maintenanceCellPhone") ?? "").trim();
  const maintenanceEmail = String(formData.get("maintenanceEmail") ?? "").trim();
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
      maintenanceName: maintenanceName || null,
      maintenanceCellPhone: maintenanceCellPhone || null,
      maintenanceEmail: maintenanceEmail || null,
      managementCompanyId,
      addressLine1: addressLine1 || null,
      addressLine2: addressLine2 || null,
      city: city || null,
      region: region || null,
      postalCode: postalCode || null,
    },
  });

  const autocompleteCoords = readAutocompleteCoords(formData);
  if (autocompleteCoords) {
    await prisma.property.update({
      where: { id: property.id },
      data: { latitude: autocompleteCoords.latitude, longitude: autocompleteCoords.longitude },
    });
  } else if (addressChanged) {
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
  redirect(`/dashboard/customers/${customerId}?tab=bodies`);
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

/**
 * Imports historical readings from a spreadsheet shaped like the downloadable QR-log CSV
 * (one row per day of a month). For each day with any data, creates or updates a COMPLETED
 * service visit + water reading dated to that day — so pre-existing customer records can be
 * backfilled without re-entering everything by hand.
 */
export async function importVenueReadings(formData: FormData) {
  const appUser = await requireAdmin();
  const bodyId = String(formData.get("bodyId") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const file = formData.get("file");

  const fail = (error: string) => redirect(`/dashboard/customers/${customerId}/bodies/${bodyId}?importError=${encodeURIComponent(error)}`);

  if (!bodyId || !customerId) return;
  if (!(file instanceof File) || file.size === 0) fail("No file selected.");
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) fail("Pick the month and year this file covers.");

  const body = await prisma.bodyOfWater.findFirst({
    where: { id: bodyId, property: { organizationId: appUser.organizationId, customerId } },
    select: { id: true, propertyId: true },
  });
  if (!body) return;

  const text = await (file as File).text();
  const { rows, error } = parseReadingsCsv(text);
  if (error) fail(error);
  if (rows.length === 0) fail("No day rows with data were found in this file.");

  const monthIndex = month - 1;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  let importedCount = 0;
  for (const row of rows) {
    if (row.day < 1 || row.day > daysInMonth) continue;

    const hasData =
      row.freeChlorinePpm != null ||
      row.ph != null ||
      row.alkalinityPpm != null ||
      row.cyanuricAcidPpm != null ||
      row.temperatureF != null ||
      row.pumpPressurePsi != null ||
      row.vacGaugeReading != null ||
      row.filterPressurePsi != null ||
      row.flowMeterGpm != null ||
      row.backwashed;
    if (!hasData) continue;

    const dayStart = new Date(year, monthIndex, row.day, 0, 0, 0, 0);
    const dayEnd = new Date(year, monthIndex, row.day, 23, 59, 59, 999);
    const noon = new Date(year, monthIndex, row.day, 12, 0, 0, 0);

    let visit = await prisma.serviceVisit.findFirst({
      where: { bodyOfWaterId: body.id, completedAt: { gte: dayStart, lte: dayEnd } },
      select: { id: true },
    });
    if (!visit) {
      visit = await prisma.serviceVisit.create({
        data: {
          organizationId: appUser.organizationId,
          propertyId: body.propertyId,
          bodyOfWaterId: body.id,
          scheduledStart: noon,
          status: "COMPLETED",
          serviceComplete: true,
          completedAt: noon,
        },
        select: { id: true },
      });
    }

    let backwashAt: Date | null = null;
    if (row.backwashed) {
      const parsedTime = row.backwashTime ? parseTimeOfDay(row.backwashTime) : null;
      backwashAt = parsedTime
        ? new Date(year, monthIndex, row.day, parsedTime.hours, parsedTime.minutes, 0, 0)
        : noon;
    }

    await prisma.visitWaterReading.upsert({
      where: { visitId: visit.id },
      create: {
        visitId: visit.id,
        ph: row.ph,
        freeChlorinePpm: row.freeChlorinePpm,
        alkalinityPpm: row.alkalinityPpm,
        cyanuricAcidPpm: row.cyanuricAcidPpm,
        temperatureF: row.temperatureF,
        pumpPressurePsi: row.pumpPressurePsi,
        vacGaugeReading: row.vacGaugeReading,
        filterPressurePsi: row.filterPressurePsi,
        flowMeterGpm: row.flowMeterGpm,
        backwashAt,
        capturedAt: noon,
      },
      update: {
        ph: row.ph,
        freeChlorinePpm: row.freeChlorinePpm,
        alkalinityPpm: row.alkalinityPpm,
        cyanuricAcidPpm: row.cyanuricAcidPpm,
        temperatureF: row.temperatureF,
        pumpPressurePsi: row.pumpPressurePsi,
        vacGaugeReading: row.vacGaugeReading,
        filterPressurePsi: row.filterPressurePsi,
        flowMeterGpm: row.flowMeterGpm,
        backwashAt,
        capturedAt: noon,
      },
    });

    importedCount += 1;
  }

  if (importedCount === 0) fail("No day rows with any readings were found in this file.");

  revalidatePath(`/dashboard/customers/${customerId}`);
  revalidatePath(`/dashboard/customers/${customerId}/bodies/${bodyId}`);
  redirect(`/dashboard/customers/${customerId}/bodies/${bodyId}?imported=${importedCount}`);
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
  if (!customerId) return;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!customer) return;

  await uploadDocumentForCustomer(customerId, formData);
  revalidatePath(`/dashboard/customers/${customerId}`);
}

export async function deleteCustomerDocument(formData: FormData) {
  const appUser = await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const documentId = String(formData.get("documentId") ?? "").trim();
  if (!customerId || !documentId) return;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!customer) return;

  await deleteDocumentForCustomer(customerId, documentId);
  revalidatePath(`/dashboard/customers/${customerId}`);
}

export async function createCustomerLogin(formData: FormData) {
  const appUser = await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "").trim();
  if (!customerId || !name || !email || !password) return;
  if (password.length < 8) return;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!customer) return;

  // A customer-portal login and a staff login are separate tables, but both draw from the same
  // Supabase Auth email pool — check both so we never silently clobber someone else's account
  // (same class of bug fixed for staff technician creation).
  const [existingStaffUser, existingCustomerUser] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.customerUser.findUnique({ where: { email } }),
  ]);
  if (existingStaffUser) {
    redirect(`/dashboard/customers/${customerId}?tab=overview&error=email-in-use`);
  }
  if (existingCustomerUser && existingCustomerUser.customerId !== customerId) {
    redirect(`/dashboard/customers/${customerId}?tab=overview&error=email-in-use`);
  }

  const authUserId = await createOrFindAuthUser(email, password);

  if (existingCustomerUser) {
    await prisma.customerUser.update({
      where: { id: existingCustomerUser.id },
      data: { authUserId, name, active: true },
    });
  } else {
    await prisma.customerUser.create({
      data: { customerId, authUserId, email, name, active: true },
    });
  }

  revalidatePath(`/dashboard/customers/${customerId}`);
}

export async function deleteCustomerLogin(formData: FormData) {
  const appUser = await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const customerUserId = String(formData.get("customerUserId") ?? "").trim();
  if (!customerId || !customerUserId) return;

  const customerUser = await prisma.customerUser.findFirst({
    where: { id: customerUserId, customer: { id: customerId, organizationId: appUser.organizationId } },
    select: { id: true, authUserId: true },
  });
  if (!customerUser) return;

  await prisma.customerUser.delete({ where: { id: customerUser.id } });

  if (customerUser.authUserId) {
    try {
      const supabaseAdmin = createSupabaseAdminClient();
      await supabaseAdmin.auth.admin.deleteUser(customerUser.authUserId);
    } catch {
      // Non-critical — the portal login row is gone either way.
    }
  }

  revalidatePath(`/dashboard/customers/${customerId}`);
}

export async function sendCustomerAlert(formData: FormData) {
  const appUser = await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!customerId || !subject || !message) return;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: appUser.organizationId },
    include: {
      customerUsers: { where: { active: true }, select: { email: true, name: true } },
      properties: { select: { managerEmail: true }, take: 1 },
    },
  });
  if (!customer) return;

  await prisma.customerAlert.create({
    data: { customerId, subject, message, createdByUserId: appUser.id },
  });

  const recipients =
    customer.customerUsers.length > 0
      ? customer.customerUsers.map((cu) => ({ email: cu.email, name: cu.name ?? customer.name }))
      : customer.properties[0]?.managerEmail
        ? [{ email: customer.properties[0].managerEmail, name: customer.name }]
        : [];

  for (const recipient of recipients) {
    await sendCustomerAlertEmail({
      to: recipient.email,
      customerName: recipient.name,
      subject,
      message,
    });
  }

  revalidatePath(`/dashboard/customers/${customerId}`);
}

/**
 * Commits a Smart Route Placement suggestion — the only place a route suggestion
 * actually creates anything. Re-validates org scoping and re-runs the same guards
 * addRouteStop uses (same-weekday duplicate, capacity) since time may have passed
 * between fetching suggestions and clicking one. No ServiceVisit is created here —
 * ensureVisitsGeneratedForDate materializes it lazily next time anyone views that
 * route's day, same as every other RecurringStop creation path.
 */
export async function assignNewCustomerToRoute(formData: FormData) {
  const appUser = await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const propertyId = String(formData.get("propertyId") ?? "").trim();
  const bodyOfWaterId = String(formData.get("bodyOfWaterId") ?? "").trim();
  const routeId = String(formData.get("routeId") ?? "").trim();
  if (!customerId || !propertyId || !bodyOfWaterId || !routeId) return;

  const property = await prisma.property.findFirst({
    where: { id: propertyId, customerId, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!property) return;

  const body = await prisma.bodyOfWater.findFirst({
    where: { id: bodyOfWaterId, propertyId: property.id },
    select: { id: true },
  });
  if (!body) return;

  const route = await prisma.recurringRoute.findFirst({
    where: { id: routeId, organizationId: appUser.organizationId, active: true },
    select: { id: true, dayOfWeek: true, maxCapacity: true },
  });
  if (!route) return;

  // Same guard addRouteStop uses (routes/actions.ts) — a body of water shouldn't be on
  // two routes (or twice) for the same weekday. Reused verbatim for consistency and to
  // catch a race where someone else assigned it manually in the interim.
  const alreadyScheduledThatDay = await prisma.recurringStop.findFirst({
    where: { bodyOfWaterId: body.id, route: { organizationId: appUser.organizationId, dayOfWeek: route.dayOfWeek } },
    select: { id: true },
  });
  if (alreadyScheduledThatDay) return;

  const stopCount = await prisma.recurringStop.count({ where: { routeId: route.id } });
  if (route.maxCapacity != null && stopCount >= route.maxCapacity) return;

  await prisma.recurringStop.create({
    data: {
      routeId: route.id,
      propertyId: property.id,
      bodyOfWaterId: body.id,
      sortOrder: stopCount,
    },
  });

  revalidatePath(`/dashboard/customers/${customerId}`);
  revalidatePath("/dashboard/routes");
  revalidatePath("/dashboard");
  redirect(`/dashboard/customers/${customerId}`);
}
