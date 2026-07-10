import { prisma } from "@/lib/prisma";

export type MonthlyReadingRow = {
  day: number;
  visited: boolean;
  freeChlorinePpm: number | null;
  ph: number | null;
  alkalinityPpm: number | null;
  cyanuricAcidPpm: number | null;
  temperatureF: number | null;
  pumpPressurePsi: number | null;
  vacGaugeReading: number | null;
  filterPressurePsi: number | null;
  flowMeterGpm: number | null;
  backwashed: boolean;
  backwashTime: string | null;
};

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

const num = (d: unknown) => (d == null ? null : Number(d));

export async function getMonthlyReadingRows(bodyId: string, year: number, monthIndex: number) {
  const monthStart = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  const totalDays = daysInMonth(year, monthIndex);

  const visits = await prisma.serviceVisit.findMany({
    where: {
      bodyOfWaterId: bodyId,
      status: "COMPLETED",
      serviceComplete: true,
      completedAt: { gte: monthStart, lte: monthEnd },
    },
    orderBy: { completedAt: "asc" },
    include: { reading: true },
  });

  const byDay = new Map<number, (typeof visits)[number]>();
  for (const v of visits) {
    if (!v.completedAt) continue;
    byDay.set(v.completedAt.getDate(), v);
  }

  const rows: MonthlyReadingRow[] = Array.from({ length: totalDays }, (_, i) => {
    const day = i + 1;
    const v = byDay.get(day);
    const r = v?.reading;
    const backwashAt = r?.backwashAt ?? null;
    return {
      day,
      visited: Boolean(v),
      freeChlorinePpm: num(r?.freeChlorinePpm),
      ph: num(r?.ph),
      alkalinityPpm: num(r?.alkalinityPpm),
      cyanuricAcidPpm: num(r?.cyanuricAcidPpm),
      temperatureF: num(r?.temperatureF),
      pumpPressurePsi: num(r?.pumpPressurePsi),
      vacGaugeReading: num(r?.vacGaugeReading),
      filterPressurePsi: num(r?.filterPressurePsi),
      flowMeterGpm: num(r?.flowMeterGpm),
      backwashed: Boolean(backwashAt),
      backwashTime: backwashAt
        ? backwashAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
        : null,
    };
  });

  return { rows, totalDays, visitCount: visits.length };
}
