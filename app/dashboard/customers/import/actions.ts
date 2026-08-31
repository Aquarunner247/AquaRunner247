"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { PropertyType } from "@/generated/prisma/client";
import { validateCustomerImportRow, type CustomerImportRaw } from "@/lib/customer-import";

async function requireAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");
  return appUser;
}

export type ImportCustomersResult = {
  createdCount: number;
  failed: { rowNumber: number; name: string; errors: string[] }[];
};

/** Bulk version of createCustomer (app/dashboard/customers/actions.ts) -- same
 * Customer + Property (+ optional BodyOfWater) shape, minus the per-row geocode lookup
 * (an import can be hundreds of rows; that's a lot of synchronous external calls for a
 * single request). Imported properties go in ungeocoded, same as any property whose
 * one-at-a-time geocode lookup fails today -- geocode them afterward from Routes.
 *
 * rows are re-validated here even though the client already validated them before
 * showing the preview -- the client's checks are a UX convenience, not the trust
 * boundary for what actually gets written. */
export async function importCustomers(rows: { rowNumber: number; raw: CustomerImportRaw }[]): Promise<ImportCustomersResult> {
  const appUser = await requireAdmin();

  const failed: ImportCustomersResult["failed"] = [];
  let createdCount = 0;

  for (const { rowNumber, raw } of rows) {
    const row = validateCustomerImportRow(raw, rowNumber);
    if (row.errors.length > 0) {
      failed.push({ rowNumber, name: row.name, errors: row.errors });
      continue;
    }

    const contactFields =
      row.propertyType === PropertyType.RESIDENTIAL
        ? {
            ownerName: row.ownerName,
            ownerMobilePhone: row.ownerMobilePhone,
            ownerHomePhone: row.ownerHomePhone,
            ownerEmail: row.ownerEmail,
            accessNotes: row.accessNotes,
            hasDog: row.hasDog,
          }
        : {
            managerName: row.managerName,
            managerBusinessPhone: row.managerBusinessPhone,
            managerMobilePhone: row.managerMobilePhone,
            managerPhone: [row.managerBusinessPhone, row.managerMobilePhone].filter(Boolean).join(" | ") || null,
            managerEmail: row.managerEmail,
            maintenanceName: row.maintenanceName,
            maintenanceCellPhone: row.maintenanceCellPhone,
            maintenanceEmail: row.maintenanceEmail,
          };

    try {
      await prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: { organizationId: appUser.organizationId, name: row.name, notes: row.notes },
          select: { id: true },
        });
        const property = await tx.property.create({
          data: {
            organizationId: appUser.organizationId,
            customerId: customer.id,
            name: row.name,
            propertyType: row.propertyType,
            ...contactFields,
            addressLine1: row.addressLine1,
            addressLine2: row.addressLine2,
            city: row.city,
            region: row.region,
            postalCode: row.postalCode,
            country: "US",
          },
          select: { id: true },
        });
        if (row.bodyOfWaterName) {
          await tx.bodyOfWater.create({
            data: {
              propertyId: property.id,
              name: row.bodyOfWaterName,
              type: row.bodyOfWaterType,
              volumeGallons: row.volumeGallons,
            },
          });
        }
      });
      createdCount += 1;
    } catch (err) {
      failed.push({
        rowNumber,
        name: row.name,
        errors: [err instanceof Error ? err.message : "Something went wrong creating this row"],
      });
    }
  }

  if (createdCount > 0) revalidatePath("/dashboard/customers");
  return { createdCount, failed };
}
