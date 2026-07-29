/**
 * Parses a CSV shaped like the downloadable QR-log spreadsheet
 * (see app/api/qr/[slug]/export/route.ts) — one row per day, with the same column set —
 * so historical readings from before this app can be imported. Normally that's one
 * month per file, but rows whose day cell is a full date (not just a bare day number)
 * carry their own month/year, so a file spanning several months works too -- see
 * ImportedReadingRow.month/year and importVenueReadings' grouping in actions.ts.
 * Columns are matched by keyword, not exact position, so minor header differences
 * (capitalization, reordering) in a hand-edited spreadsheet don't break the import.
 */

export type ImportedReadingRow = {
  day: number;
  /** Non-null only when the cell had a full date (not just a bare day number) --
   * lets the importer file a row under its own month/year instead of whatever
   * single month the admin picked in the form, so a file spanning several months
   * gets split correctly instead of every row landing in one month. */
  month: number | null;
  year: number | null;
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

type ColumnField = keyof Omit<ImportedReadingRow, "day" | "backwashed" | "backwashTime"> | "day" | "backwashed" | "backwashTime";

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function matchColumn(header: string): ColumnField | null {
  const h = header.toLowerCase();
  if (h.includes("backwash") && h.includes("time")) return "backwashTime";
  if (h.includes("backwash")) return "backwashed";
  if (h.includes("chlorine")) return "freeChlorinePpm";
  if (h.includes("alkalinity")) return "alkalinityPpm";
  if (h.includes("cyanuric") || h === "cya" || h.includes("cya ")) return "cyanuricAcidPpm";
  if (h.includes("temp")) return "temperatureF";
  if (h.includes("pump") && h.includes("pressure")) return "pumpPressurePsi";
  if (h.includes("vacuum")) return "vacGaugeReading";
  if (h.includes("filter") && h.includes("pressure")) return "filterPressurePsi";
  if (h.includes("flow")) return "flowMeterGpm";
  if (h === "ph" || h.startsWith("ph ") || h.startsWith("ph(")) return "ph";
  if (h.includes("day") || h.includes("date")) return "day";
  return null;
}

type ParsedDateCell = { day: number; month: number | null; year: number | null };

/** "26" -> 2026, "98" -> 1998. Two-digit years only ever show up in hand-edited
 * spreadsheets of recent readings, so a 1969/2068 split-century cutoff is plenty. */
function normalizeTwoDigitYear(y: number): number {
  if (y >= 100) return y;
  return y >= 69 ? 1900 + y : 2000 + y;
}

/**
 * Extracts the day-of-month -- and, when the cell is a full date rather than a bare
 * day number, the month/year too -- from formats: bare "7"/"07", M/D/YYYY, M/D/YY,
 * YYYY-MM-DD, or anything else JS Date can parse. Assumes US month/day order for
 * slash dates, since that's the convention used everywhere else in this app.
 * month/year come back null whenever the cell doesn't actually carry that info (a
 * bare day number) or the extra info looks invalid -- callers fall back to an
 * explicitly-chosen month/year in that case, same as when this only returned a day.
 */
function parseDateFromCell(raw: string): ParsedDateCell | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Bare number, e.g. "7" or "07" -- day only, no month/year in the cell.
  if (/^\d{1,2}$/.test(trimmed)) {
    const bare = Number(trimmed);
    if (bare >= 1 && bare <= 31) return { day: bare, month: null, year: null };
  }

  // M/D/YYYY or M/D/YY, e.g. 7/7/2026, 07/07/26
  const slash = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slash) {
    const day = Number(slash[2]);
    const monthRaw = Number(slash[1]);
    if (day >= 1 && day <= 31) {
      const month = monthRaw >= 1 && monthRaw <= 12 ? monthRaw : null;
      return { day, month, year: month != null ? normalizeTwoDigitYear(Number(slash[3])) : null };
    }
  }

  // ISO format, e.g. 2026-07-07
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const day = Number(iso[3]);
    const monthRaw = Number(iso[2]);
    if (day >= 1 && day <= 31) {
      const month = monthRaw >= 1 && monthRaw <= 12 ? monthRaw : null;
      return { day, month, year: month != null ? Number(iso[1]) : null };
    }
  }

  // Fallback: let JS try to parse it (handles things like "July 7, 2026")
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return { day: parsed.getDate(), month: parsed.getMonth() + 1, year: parsed.getFullYear() };
  }

  return null;
}

function numOrNull(raw: string | undefined): number | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function parseReadingsCsv(text: string): { rows: ImportedReadingRow[]; error?: string } {
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);

  let headerIndex = -1;
  let columnMap: (ColumnField | null)[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    // Reuse matchColumn itself to find the header row, instead of a separate stricter
    // exact-match check — otherwise a real day/date column (e.g. "Day/Time", "Service Date")
    // that matchColumn would happily classify never gets the row recognized as a header in
    // the first place.
    if (cells.some((c) => matchColumn(c) === "day")) {
      headerIndex = i;
      columnMap = cells.map(matchColumn);
      break;
    }
  }
  if (headerIndex === -1) {
    return { rows: [], error: 'Could not find a header row with a "Day" or "Date" column in this file.' };
  }

  const rows: ImportedReadingRow[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cells = splitCsvLine(line);
    if (cells.every((c) => !c.trim())) continue;

    let day: number | null = null;
    let month: number | null = null;
    let year: number | null = null;
    let freeChlorinePpm: number | null = null;
    let ph: number | null = null;
    let alkalinityPpm: number | null = null;
    let cyanuricAcidPpm: number | null = null;
    let temperatureF: number | null = null;
    let pumpPressurePsi: number | null = null;
    let vacGaugeReading: number | null = null;
    let filterPressurePsi: number | null = null;
    let flowMeterGpm: number | null = null;
    let backwashedRaw = "";
    let backwashTime: string | null = null;

    for (let c = 0; c < columnMap.length; c++) {
      const field = columnMap[c];
      if (!field) continue;
      const raw = cells[c] ?? "";
      switch (field) {
        case "day": {
          const parsedDate = parseDateFromCell(raw);
          if (parsedDate !== null) {
            day = parsedDate.day;
            month = parsedDate.month;
            year = parsedDate.year;
          }
          break;
        }
        case "backwashed":
          backwashedRaw = raw.trim().toLowerCase();
          break;
        case "backwashTime":
          backwashTime = raw.trim() || null;
          break;
        case "freeChlorinePpm":
          freeChlorinePpm = numOrNull(raw);
          break;
        case "ph":
          ph = numOrNull(raw);
          break;
        case "alkalinityPpm":
          alkalinityPpm = numOrNull(raw);
          break;
        case "cyanuricAcidPpm":
          cyanuricAcidPpm = numOrNull(raw);
          break;
        case "temperatureF":
          temperatureF = numOrNull(raw);
          break;
        case "pumpPressurePsi":
          pumpPressurePsi = numOrNull(raw);
          break;
        case "vacGaugeReading":
          vacGaugeReading = numOrNull(raw);
          break;
        case "filterPressurePsi":
          filterPressurePsi = numOrNull(raw);
          break;
        case "flowMeterGpm":
          flowMeterGpm = numOrNull(raw);
          break;
      }
    }

    if (day == null) continue;

    rows.push({
      day,
      month,
      year,
      freeChlorinePpm,
      ph,
      alkalinityPpm,
      cyanuricAcidPpm,
      temperatureF,
      pumpPressurePsi,
      vacGaugeReading,
      filterPressurePsi,
      flowMeterGpm,
      backwashed: backwashedRaw === "yes" || backwashedRaw === "y" || backwashedRaw === "true",
      backwashTime,
    });
  }

  return { rows };
}

/** Parses "2:30 PM" / "14:30" style time-of-day strings from the Backwash Time column. */
export function parseTimeOfDay(raw: string): { hours: number; minutes: number } | null {
  const trimmed = raw.trim();
  const m = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const ampm = m[3]?.toUpperCase();
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}
