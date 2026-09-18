import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { getOrgPayrollSettings, getPayPeriodBounds, getPayrollExportRows } from "@/lib/technician-pay";
import { buildCsv, csvResponseHeaders } from "@/lib/csv-export";

/**
 * One row per rated, completed visit -- a reference for your bookkeeper to key into
 * payroll, not a direct QuickBooks Payroll import. QBO Payroll doesn't accept a generic
 * historical-pay CSV the way Customers/transactions do, so this stays a plain export
 * (matches lib/technician-pay.ts's own framing: QuickBooks is pay's system of record,
 * this app only estimates it).
 */
export async function GET(request: Request) {
  const appUser = await getCurrentAppUser();
  if (!appUser) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (appUser.role !== "ADMIN") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  let start: Date;
  let end: Date;
  if (fromParam && toParam) {
    start = new Date(`${fromParam}T00:00:00`);
    end = new Date(`${toParam}T23:59:59.999`);
  } else {
    // No explicit range -- default to the org's own current pay period, same bounds the
    // technician earnings tracker itself uses, rather than an arbitrary fixed window.
    const settings = await getOrgPayrollSettings(appUser.organizationId);
    const period = getPayPeriodBounds(settings, new Date());
    start = period.start;
    end = period.end;
  }

  const rows = await getPayrollExportRows(appUser.organizationId, start, end);

  const csv = buildCsv(
    ["Date", "Technician", "Technician Email", "Property", "Body of Water", "Amount"],
    rows.map((r) => [r.visitDate.toISOString().slice(0, 10), r.technicianName, r.technicianEmail, r.propertyName, r.bodyOfWaterName, r.amount.toFixed(2)]),
  );

  return new NextResponse(csv, { headers: csvResponseHeaders("quickbooks-technician-pay") });
}
