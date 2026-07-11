/**
 * Parses a CSV shaped like the downloadable QR-log spreadsheet
 * (see app/api/qr/[slug]/export/route.ts) — one row per day of a month, with the same
 * column set — so historical readings from before this app can be imported.
 * Columns are matched by keyword, not exact position, so minor header differences
 * (capitalization, reordering) in a hand-edited spreadsheet don't break the import.
 */

export type ImportedReadingRow = {
  day: number;
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
  if (h.includes("day")) return "day";
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
    if (cells.some((c) => c.trim().toLowerCase() === "day")) {
      headerIndex = i;
      columnMap = cells.map(matchColumn);
      break;
    }
  }
  if (headerIndex === -1) {
    return { rows: [], error: 'Could not find a header row with a "Day" column in this file.' };
  }

  const rows: ImportedReadingRow[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cells = splitCsvLine(line);
    if (cells.every((c) => !c.trim())) continue;

    let day: number | null = null;
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
          const d = Number(raw.trim());
          if (Number.isFinite(d)) day = d;
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
