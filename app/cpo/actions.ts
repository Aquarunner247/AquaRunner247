"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { createBodyOfWater as createBodyOfWaterShared } from "@/app/dashboard/customers/actions";
import { createUser as createUserShared } from "@/app/dashboard/users/actions";

async function requireCpoAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/cpo");
  return appUser;
}

/** Modeled on createProperty (app/dashboard/customers/actions.ts), but with no Customer
 * entity at all -- an in-house CPO manages their own property directly, not a service
 * company's client. Always COMMERCIAL: this persona has no residential concept. */
export async function createStandaloneProperty(formData: FormData) {
  const appUser = await requireCpoAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const managerName = String(formData.get("managerName") ?? "").trim();
  const managerBusinessPhone = String(formData.get("managerBusinessPhone") ?? "").trim();
  const managerEmail = String(formData.get("managerEmail") ?? "").trim();
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const region = String(formData.get("region") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim();
  if (!name) return;

  await prisma.property.create({
    data: {
      organizationId: appUser.organizationId,
      customerId: null,
      name,
      propertyType: "COMMERCIAL",
      managerName: managerName || null,
      managerBusinessPhone: managerBusinessPhone || null,
      managerEmail: managerEmail || null,
      addressLine1: addressLine1 || null,
      city: city || null,
      region: region || null,
      postalCode: postalCode || null,
      country: "US",
    },
  });

  revalidatePath("/cpo/properties");
}

/** createBodyOfWater is already fully customer-agnostic (scoped only by propertyId +
 * organizationId) -- reused as-is, just revalidating this product's own paths too. */
export async function createBodyOfWater(formData: FormData) {
  await createBodyOfWaterShared(formData);
  revalidatePath("/cpo/properties");
  revalidatePath(`/cpo/properties/${String(formData.get("propertyId") ?? "")}`);
}

/**
 * The one genuinely new capability this product needs: logging a reading without a
 * technician being dispatched on a route. Replicates importVenueReadings's proven
 * route-free ServiceVisit pattern (app/dashboard/customers/[id]/actions.ts) directly,
 * rather than going through PATCH /api/visits/[id]/reading -- that endpoint rejects
 * visits already COMPLETED, which is exactly the state this creates the visit in.
 */
export async function logReadingNow(formData: FormData) {
  const appUser = await requireCpoAdmin();
  const bodyId = String(formData.get("bodyId") ?? "").trim();
  if (!bodyId) return;

  const body = await prisma.bodyOfWater.findFirst({
    where: { id: bodyId, property: { organizationId: appUser.organizationId } },
    select: { id: true, propertyId: true },
  });
  if (!body) return;

  function numOrNull(value: FormDataEntryValue | null): number | null {
    const s = String(value ?? "").trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  let visit = await prisma.serviceVisit.findFirst({
    where: { bodyOfWaterId: body.id, completedAt: { gte: startOfToday, lte: endOfToday } },
    select: { id: true },
  });
  if (!visit) {
    visit = await prisma.serviceVisit.create({
      data: {
        organizationId: appUser.organizationId,
        propertyId: body.propertyId,
        bodyOfWaterId: body.id,
        scheduledStart: now,
        status: "COMPLETED",
        serviceComplete: true,
        completedAt: now,
      },
      select: { id: true },
    });
  }

  const data = {
    ph: numOrNull(formData.get("ph")),
    freeChlorinePpm: numOrNull(formData.get("freeChlorinePpm")),
    brominePpm: numOrNull(formData.get("brominePpm")),
    alkalinityPpm: numOrNull(formData.get("alkalinityPpm")),
    cyanuricAcidPpm: numOrNull(formData.get("cyanuricAcidPpm")),
    temperatureF: numOrNull(formData.get("temperatureF")),
    // Gauge/meter readings -- only shown on the form at all when this org's linked state
    // ruleset requires them (see activeReadingFields in the page component), but accepted
    // here unconditionally same as every other field: this action doesn't re-derive the
    // ruleset itself, it just persists whatever the form actually submitted.
    pumpPressurePsi: numOrNull(formData.get("pumpPressurePsi")),
    vacGaugeReading: numOrNull(formData.get("vacGaugeReading")),
    filterPressurePsi: numOrNull(formData.get("filterPressurePsi")),
    flowMeterGpm: numOrNull(formData.get("flowMeterGpm")),
    capturedAt: now,
  };

  await prisma.visitWaterReading.upsert({
    where: { visitId: visit.id },
    create: { visitId: visit.id, ...data },
    update: data,
  });

  revalidatePath("/cpo");
  revalidatePath(`/cpo/properties/${body.propertyId}`);
}

/** createUser is already fully generic (branches on the submitted role, org-scoped, seat-
 * limit enforced via lib/plan-tiers.ts) -- reused as-is. The /cpo/users form always submits
 * a hidden role=ADMIN (no OFFICE/TECHNICIAN/CUSTOMER concept for this product), so this
 * just adds this product's own revalidation on top of the shared action's. */
export async function createCpoUser(formData: FormData) {
  await createUserShared(formData);
  revalidatePath("/cpo/users");
}
