import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { buildCsv, csvResponseHeaders } from "@/lib/csv-export";

/**
 * One row per property -- billing contact info lives at the property level
 * (managerName/managerEmail/managerPhone), not the customer level, and a customer can have
 * several properties under one management company. Column headers are self-descriptive
 * rather than QuickBooks' own internal field names -- QBO's Customer CSV import has a
 * column-mapping step, so exact header text doesn't need to match its schema.
 */
export async function GET() {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (appUser.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const properties = await prisma.property.findMany({
    where: { organizationId: appUser.organizationId },
    orderBy: { name: "asc" },
    select: {
      name: true,
      managerName: true,
      managerEmail: true,
      managerPhone: true,
      managerBusinessPhone: true,
      managerMobilePhone: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      region: true,
      postalCode: true,
      customer: { select: { name: true } },
    },
  });

  const csv = buildCsv(
    ["Customer Name", "Company/Property", "Contact Name", "Email", "Phone", "Address Line 1", "Address Line 2", "City", "State", "ZIP"],
    properties.map((p) => [
      p.customer?.name ?? p.name,
      p.name,
      p.managerName,
      p.managerEmail,
      p.managerPhone ?? p.managerBusinessPhone ?? p.managerMobilePhone,
      p.addressLine1,
      p.addressLine2,
      p.city,
      p.region,
      p.postalCode,
    ]),
  );

  return new NextResponse(csv, { headers: csvResponseHeaders("quickbooks-customers") });
}
