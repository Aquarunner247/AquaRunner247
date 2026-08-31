"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { PropertyType } from "@/generated/prisma/client";
import { validateCustomerImportRow, type CustomerImportRaw, type ValidatedCustomerImportRow } from "@/lib/customer-import";

async function requireAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");
  return appUser;
}

export type ImportCustomersResult = {
  createdCount: number;
  matched: { rowNumber: number; name: string }[];
  failed: { rowNumber: number; name: string; errors: string[] }[];
};

/** Value to use for a field that's blank on the existing record -- never overwrites
 * something already filled in, matching importCustomers' "add missing info, don't
 * clobber real data" contract. */
function fillBlank<T>(existing: T | null | undefined, candidate: T | null | undefined): T | null | undefined {
  return existing || candidate;
}

function contactFieldsFor(propertyType: PropertyType, row: ValidatedCustomerImportRow) {
  return propertyType === PropertyType.RESIDENTIAL
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
}

/** Bulk version of createCustomer (app/dashboard/customers/actions.ts) -- same
 * Customer + Property (+ optional BodyOfWater) shape, minus the per-row geocode lookup
 * (an import can be hundreds of rows; that's a lot of synchronous external calls for a
 * single request). Imported properties go in ungeocoded, same as any property whose
 * one-at-a-time geocode lookup fails today -- geocode them afterward from Routes.
 *
 * A row whose name matches an existing customer in this org (case-insensitive) is
 * never duplicated -- it's merged into that customer's first property instead, filling
 * in only fields that are currently blank there. Nothing already on file gets
 * overwritten, and a body of water is only added if that property doesn't already
 * have one (there's no safe way to tell whether the CSV's pool name refers to an
 * existing one or a genuinely new one, so this errs toward not creating a duplicate).
 *
 * rows are re-validated here even though the client already validated them before
 * showing the preview -- the client's checks are a UX convenience, not the trust
 * boundary for what actually gets written. */
export async function importCustomers(rows: { rowNumber: number; raw: CustomerImportRaw }[]): Promise<ImportCustomersResult> {
  const appUser = await requireAdmin();

  const failed: ImportCustomersResult["failed"] = [];
  const matched: ImportCustomersResult["matched"] = [];
  let createdCount = 0;

  for (const { rowNumber, raw } of rows) {
    const row = validateCustomerImportRow(raw, rowNumber);
    if (row.errors.length > 0) {
      failed.push({ rowNumber, name: row.name, errors: row.errors });
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const existingCustomer = await tx.customer.findFirst({
          where: { organizationId: appUser.organizationId, name: { equals: row.name, mode: "insensitive" } },
          select: {
            id: true,
            notes: true,
            properties: {
              orderBy: { createdAt: "asc" },
              take: 1,
              select: {
                id: true,
                propertyType: true,
                addressLine1: true,
                addressLine2: true,
                city: true,
                region: true,
                postalCode: true,
                managerName: true,
                managerBusinessPhone: true,
                managerMobilePhone: true,
                managerEmail: true,
                maintenanceName: true,
                maintenanceCellPhone: true,
                maintenanceEmail: true,
                ownerName: true,
                ownerMobilePhone: true,
                ownerHomePhone: true,
                ownerEmail: true,
                accessNotes: true,
                hasDog: true,
                bodiesOfWater: { select: { id: true }, take: 1 },
              },
            },
          },
        });

        if (existingCustomer) {
          await tx.customer.update({
            where: { id: existingCustomer.id },
            data: { notes: fillBlank(existingCustomer.notes, row.notes) },
          });

          const existingProperty = existingCustomer.properties[0];
          if (!existingProperty) {
            await tx.property.create({
              data: {
                organizationId: appUser.organizationId,
                customerId: existingCustomer.id,
                name: row.name,
                propertyType: row.propertyType,
                ...contactFieldsFor(row.propertyType, row),
                addressLine1: row.addressLine1,
                addressLine2: row.addressLine2,
                city: row.city,
                region: row.region,
                postalCode: row.postalCode,
                country: "US",
              },
              select: { id: true },
            });
          } else {
            const contactPatch =
              existingProperty.propertyType === PropertyType.RESIDENTIAL
                ? {
                    ownerName: fillBlank(existingProperty.ownerName, row.ownerName),
                    ownerMobilePhone: fillBlank(existingProperty.ownerMobilePhone, row.ownerMobilePhone),
                    ownerHomePhone: fillBlank(existingProperty.ownerHomePhone, row.ownerHomePhone),
                    ownerEmail: fillBlank(existingProperty.ownerEmail, row.ownerEmail),
                    accessNotes: fillBlank(existingProperty.accessNotes, row.accessNotes),
                    // Only ever turns a dog flag on -- a later row omitting it should
                    // never erase a dog someone already recorded.
                    hasDog: existingProperty.hasDog || row.hasDog,
                  }
                : {
                    managerName: fillBlank(existingProperty.managerName, row.managerName),
                    managerBusinessPhone: fillBlank(existingProperty.managerBusinessPhone, row.managerBusinessPhone),
                    managerMobilePhone: fillBlank(existingProperty.managerMobilePhone, row.managerMobilePhone),
                    managerEmail: fillBlank(existingProperty.managerEmail, row.managerEmail),
                    maintenanceName: fillBlank(existingProperty.maintenanceName, row.maintenanceName),
                    maintenanceCellPhone: fillBlank(existingProperty.maintenanceCellPhone, row.maintenanceCellPhone),
                    maintenanceEmail: fillBlank(existingProperty.maintenanceEmail, row.maintenanceEmail),
                  };
            await tx.property.update({
              where: { id: existingProperty.id },
              data: {
                ...contactPatch,
                addressLine1: fillBlank(existingProperty.addressLine1, row.addressLine1),
                addressLine2: fillBlank(existingProperty.addressLine2, row.addressLine2),
                city: fillBlank(existingProperty.city, row.city),
                region: fillBlank(existingProperty.region, row.region),
                postalCode: fillBlank(existingProperty.postalCode, row.postalCode),
              },
            });
            if (existingProperty.bodiesOfWater.length === 0 && row.bodyOfWaterName) {
              await tx.bodyOfWater.create({
                data: {
                  propertyId: existingProperty.id,
                  name: row.bodyOfWaterName,
                  type: row.bodyOfWaterType,
                  volumeGallons: row.volumeGallons,
                },
              });
            }
          }

          matched.push({ rowNumber, name: row.name });
          return;
        }

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
            ...contactFieldsFor(row.propertyType, row),
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
        createdCount += 1;
      });
    } catch (err) {
      failed.push({
        rowNumber,
        name: row.name,
        errors: [err instanceof Error ? err.message : "Something went wrong creating this row"],
      });
    }
  }

  if (createdCount > 0 || matched.length > 0) revalidatePath("/dashboard/customers");
  return { createdCount, matched, failed };
}
