import { prisma } from "@/lib/prisma";
import { formatLocalTime } from "@/lib/timezone";
import { monthWindowInTimeZone, bucketVisitsByLogDay } from "@/lib/reading-log-days";

export type MonthlyReadingRow = {
  day: number;
  visited: boolean;
  freeChlorinePpm: number | null;
  brominePpm: number | null;
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

const num = (d: unknown) => (d == null ? null : Number(d));

/**
 * The aquatic maintenance log for one body of water: one row per calendar day of the month.
 *
 * `timeZone` is the POOL's zone, and the month window and the day each reading lands on are both
 * resolved in it. They used to be built with `new Date(year, monthIndex, 1)` and
 * `completedAt.getDate()`, which are the SERVER's zone -- UTC in production. A reading taken at 6pm in
 * Nevada is 01:00 UTC the next day, so it was filed on the following day's row, and one taken on the
 * last evening of a month fell outside the window and vanished from the log entirely. Nobody noticed
 * while technicians worked mornings; it is unmissable for anyone logging readings at the end of a shift.
 */
export async function getMonthlyReadingRows(bodyId: string, year: number, monthIndex: number, timeZone: string) {
  const { start: monthStart, endExclusive: monthEndExclusive, totalDays } = monthWindowInTimeZone(
    year,
    monthIndex,
    timeZone,
  );

  const visits = await prisma.serviceVisit.findMany({
    // DELIBERATELY does not filter logOnlyRecord. Every other query that reasons about a completed
    // visit excludes those rows, because they are not work anyone performed -- but this is the one
    // place they belong. An imported logbook row and a CPO-logged reading exist precisely so the
    // compliance log is complete, so adding `logOnlyRecord: false` here would empty months of the
    // public inspector record. See ServiceVisit.logOnlyRecord.
    where: {
      bodyOfWaterId: bodyId,
      status: "COMPLETED",
      serviceComplete: true,
      completedAt: { gte: monthStart, lt: monthEndExclusive },
    },
    orderBy: { completedAt: "asc" },
    include: { reading: true },
  });

  // Ordered by completedAt ascending above, so the latest reading of each day is the one kept.
  const byDay = bucketVisitsByLogDay(visits, timeZone);

  const rows: MonthlyReadingRow[] = Array.from({ length: totalDays }, (_, i) => {
    const day = i + 1;
    const v = byDay.get(day);
    const r = v?.reading;
    const backwashAt = r?.backwashAt ?? null;
    return {
      day,
      visited: Boolean(v),
      freeChlorinePpm: num(r?.freeChlorinePpm),
      brominePpm: num(r?.brominePpm),
      ph: num(r?.ph),
      alkalinityPpm: num(r?.alkalinityPpm),
      cyanuricAcidPpm: num(r?.cyanuricAcidPpm),
      temperatureF: num(r?.temperatureF),
      pumpPressurePsi: num(r?.pumpPressurePsi),
      vacGaugeReading: num(r?.vacGaugeReading),
      filterPressurePsi: num(r?.filterPressurePsi),
      flowMeterGpm: num(r?.flowMeterGpm),
      backwashed: Boolean(backwashAt),
      backwashTime: backwashAt ? formatLocalTime(backwashAt, timeZone) : null,
    };
  });

  return { rows, totalDays, visitCount: visits.length };
}
