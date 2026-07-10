import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMonthlyReadingRows, type MonthlyReadingRow } from "@/lib/reading-rows";

type RouteCtx = {
  params: Promise<{ slug: string }>;
};

const CSV_HEADER = [
  "Day",
  "Free Chlorine (ppm)",
  "pH",
  "Total Alkalinity (ppm)",
  "Cyanuric Acid (ppm)",
  "Temperature (F)",
  "Pump Pressure (psi)",
  "Vacuum Gauge (inHg)",
  "Filter Pressure (psi)",
  "Flow Rate (gpm)",
  "Backwashed",
  "Backwash Time",
];

function csvCell(value: string | number) {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function csvRow(row: MonthlyReadingRow) {
  return [
    row.day,
    row.freeChlorinePpm ?? "",
    row.ph ?? "",
    row.alkalinityPpm ?? "",
    row.cyanuricAcidPpm ?? "",
    row.temperatureF ?? "",
    row.pumpPressurePsi ?? "",
    row.vacGaugeReading ?? "",
    row.filterPressurePsi ?? "",
    row.flowMeterGpm ?? "",
    row.visited ? (row.backwashed ? "Yes" : "No") : "",
    row.backwashTime ?? "",
  ]
    .map(csvCell)
    .join(",");
}

export async function GET(req: Request, ctx: RouteCtx) {
  const { slug } = await ctx.params;
  const url = new URL(req.url);
  const now = new Date();

  const yearParam = url.searchParams.get("year");
  const monthParam = url.searchParams.get("month");
  const year = yearParam && Number.isFinite(Number(yearParam)) ? Number(yearParam) : now.getFullYear();
  const monthIndex =
    monthParam && Number.isFinite(Number(monthParam)) && Number(monthParam) >= 1 && Number(monthParam) <= 12
      ? Number(monthParam) - 1
      : now.getMonth();

  const body = await prisma.bodyOfWater.findUnique({
    where: { publicSlug: slug },
    select: { id: true, name: true, property: { select: { name: true } } },
  });
  if (!body) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { rows } = await getMonthlyReadingRows(body.id, year, monthIndex);

  const monthLabel = new Date(year, monthIndex, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
  const csv = [CSV_HEADER.join(","), ...rows.map(csvRow)].join("\n");
  const fileSafeName = `${body.property.name}-${body.name}-${monthLabel}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileSafeName}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
