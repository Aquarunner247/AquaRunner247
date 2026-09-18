import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { buildCsv, csvResponseHeaders } from "@/lib/csv-export";

const DEFAULT_RANGE_DAYS = 30;

/**
 * One row per chemical dose logged in the date range -- unitCost is read off
 * VisitChemicalDose itself (snapshotted at the time the dose was logged), not the current
 * ChemicalProduct.costPerUnit, so a price change since then doesn't retroactively change a
 * past export. A dose with no snapshotted cost (logged before pricing was ever set, or the
 * product's cost genuinely isn't tracked) still gets a row -- Unit Cost/Total Cost just come
 * back blank rather than silently dropping the usage record.
 */
export async function GET(request: Request) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (appUser.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const start = fromParam ? new Date(`${fromParam}T00:00:00`) : new Date(Date.now() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  const end = toParam ? new Date(`${toParam}T23:59:59.999`) : new Date();

  const doses = await prisma.visitChemicalDose.findMany({
    where: { visit: { organizationId: appUser.organizationId, completedAt: { gte: start, lte: end } } },
    orderBy: { createdAt: "asc" },
    select: {
      productName: true,
      quantity: true,
      unit: true,
      unitCost: true,
      visit: { select: { completedAt: true, property: { select: { name: true } } } },
    },
  });

  const csv = buildCsv(
    ["Date", "Property", "Chemical", "Quantity", "Unit", "Unit Cost", "Total Cost"],
    doses.map((d) => {
      const qty = Number(d.quantity);
      const unitCost = d.unitCost != null ? Number(d.unitCost) : null;
      return [
        d.visit.completedAt ? d.visit.completedAt.toISOString().slice(0, 10) : "",
        d.visit.property.name,
        d.productName,
        qty,
        d.unit,
        unitCost != null ? unitCost.toFixed(4) : "",
        unitCost != null ? (qty * unitCost).toFixed(2) : "",
      ];
    }),
  );

  return new NextResponse(csv, { headers: csvResponseHeaders("quickbooks-chemical-expenses") });
}
