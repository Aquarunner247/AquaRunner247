import type { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ publicSlug: string }>;
  searchParams?: Promise<{ month?: string }>;
};

function fmt(v: Decimal | null | undefined): string {
  if (v == null) return "—";
  return v.toString();
}

function toISODate(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function monthTitle(d: Date) {
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function parseMonthParam(monthRaw: string | undefined): Date {
  if (!monthRaw) return new Date();
  const m = monthRaw.match(/^(\d{4})-(\d{2})$/);
  if (!m) return new Date();
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return new Date();
  }
  return new Date(year, monthIndex, 1);
}

function toChemicalsText(doses: Array<{ productName: string; quantity: Decimal; unit: string }>): string {
  if (!doses.length) return "—";
  return doses.map((dose) => `${dose.productName} ${dose.quantity.toString()} ${dose.unit}`).join("; ");
}

export default async function PublicPropertyLogPage({ params, searchParams }: PageProps) {
  const { publicSlug } = await params;
  const sp = (await searchParams) ?? {};

  const monthAnchor = parseMonthParam(sp.month);
  const monthStart = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0, 23, 59, 59, 999);

  const property = await prisma.property.findUnique({
    where: { publicSlug },
    select: {
      id: true,
      name: true,
      managerName: true,
      managerBusinessPhone: true,
      managerMobilePhone: true,
      managerPhone: true,
      addressLine1: true,
      city: true,
      region: true,
    },
  });

  if (!property) {
    return (
      <main className="mx-auto min-h-screen max-w-5xl px-4 py-8">
        <header className="border-b border-slate-200 pb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-800">Public maintenance log</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Aquatic venue log</h1>
        </header>
        <section className="mt-8 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-slate-500">
          No property found for this QR reference.
        </section>
      </main>
    );
  }

  const visits = await prisma.serviceVisit.findMany({
    where: {
      propertyId: property.id,
      status: "COMPLETED",
      completedAt: { gte: monthStart, lte: monthEnd },
      serviceComplete: true,
    },
    orderBy: { completedAt: "asc" },
    include: {
      bodyOfWater: { select: { name: true } },
      technician: { select: { name: true } },
      reading: true,
      doses: true,
      photos: { select: { id: true } },
      issues: true,
    },
  });

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-800">Public maintenance log</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{property.name}</h1>
        {property.managerName ? (
          <p className="mt-2 text-sm text-slate-600">
            Manager: <span className="font-medium text-slate-800">{property.managerName}</span>
            {property.managerBusinessPhone ? <span className="ml-2 text-slate-500">(Biz: {property.managerBusinessPhone})</span> : null}
            {property.managerMobilePhone ? <span className="ml-2 text-slate-500">(Mobile: {property.managerMobilePhone})</span> : null}
            {!property.managerBusinessPhone && !property.managerMobilePhone && property.managerPhone ? (
              <span className="ml-2 text-slate-500">({property.managerPhone})</span>
            ) : null}
          </p>
        ) : null}
        {property.addressLine1 ? (
          <p className="mt-1 text-sm text-slate-600">
            {property.addressLine1}
            {property.city ? `, ${property.city}` : ""}
            {property.region ? `, ${property.region}` : ""}
          </p>
        ) : null}
        <p className="mt-3 text-sm text-slate-500">
          {monthTitle(monthAnchor)} records. Includes an additional chemicals-added column.
        </p>
      </header>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-xs text-slate-700">
            <thead>
              <tr className="bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600">
                <th className="border border-slate-300 px-2 py-2">Date</th>
                <th className="border border-slate-300 px-2 py-2">Body of Water</th>
                <th className="border border-slate-300 px-2 py-2">Disinfectant Residual (FC)</th>
                <th className="border border-slate-300 px-2 py-2">pH</th>
                <th className="border border-slate-300 px-2 py-2">Total Alkalinity</th>
                <th className="border border-slate-300 px-2 py-2">Cyanuric Acid</th>
                <th className="border border-slate-300 px-2 py-2">Pump PSI</th>
                <th className="border border-slate-300 px-2 py-2">Vac (inHg)</th>
                <th className="border border-slate-300 px-2 py-2">Flow (GPM)</th>
                <th className="border border-slate-300 px-2 py-2">Filter PSI</th>
                <th className="border border-slate-300 px-2 py-2">Time of Backwash</th>
                <th className="border border-slate-300 px-2 py-2">Chemicals Added</th>
                <th className="border border-slate-300 px-2 py-2">Remarks</th>
                <th className="border border-slate-300 px-2 py-2">Photo</th>
              </tr>
            </thead>
            <tbody>
              {visits.length === 0 ? (
                <tr>
                  <td colSpan={14} className="border border-slate-300 px-3 py-6 text-center text-sm text-slate-500">
                    No completed service records found for this month.
                  </td>
                </tr>
              ) : (
                visits.map((visit) => (
                  <tr key={visit.id} className="odd:bg-white even:bg-slate-50">
                    <td className="border border-slate-300 px-2 py-2 align-top">
                      {visit.completedAt ? toISODate(visit.completedAt) : "—"}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 align-top">
                      <div className="font-medium text-slate-900">{visit.bodyOfWater?.name ?? "—"}</div>
                      {visit.technician?.name ? <div className="text-slate-500">Tech: {visit.technician.name}</div> : null}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 align-top">{fmt(visit.reading?.freeChlorinePpm)}</td>
                    <td className="border border-slate-300 px-2 py-2 align-top">{fmt(visit.reading?.ph)}</td>
                    <td className="border border-slate-300 px-2 py-2 align-top">{fmt(visit.reading?.alkalinityPpm)}</td>
                    <td className="border border-slate-300 px-2 py-2 align-top">{fmt(visit.reading?.cyanuricAcidPpm)}</td>
                    <td className="border border-slate-300 px-2 py-2 align-top">{fmt(visit.reading?.pumpPressurePsi)}</td>
                    <td className="border border-slate-300 px-2 py-2 align-top">{fmt(visit.reading?.vacGaugeReading)}</td>
                    <td className="border border-slate-300 px-2 py-2 align-top">{fmt(visit.reading?.flowMeterGpm)}</td>
                    <td className="border border-slate-300 px-2 py-2 align-top">{fmt(visit.reading?.filterPressurePsi)}</td>
                    <td className="border border-slate-300 px-2 py-2 align-top">
                      {visit.reading?.backwashAt
                        ? visit.reading.backwashAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 align-top">{toChemicalsText(visit.doses)}</td>
                    <td className="border border-slate-300 px-2 py-2 align-top">
                      <div>{visit.techNotes ?? "—"}</div>
                      {visit.issues.length ? <div className="mt-1 text-slate-500">{visit.issues.map((i) => i.code).join(", ")}</div> : null}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 align-top">
                      {visit.photos.length > 0 ? "On file" : "Missing"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
