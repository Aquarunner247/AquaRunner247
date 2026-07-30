/**
 * Deterministic technician -> color assignment for the admin Schedule tab's
 * "All Technicians" map/list view. Order matches the validated categorical
 * palette (see dataviz skill's palette.md) — only the first 4 slots clear the
 * all-pairs colorblind-safety floor, so color is never the only identity cue:
 * every caller must also show the technician's initial (marker glyph) and/or
 * full name (legend, popup, list header) alongside it.
 */
const PALETTE = [
  "#2a78d6", // blue
  "#008300", // green
  "#e87ba4", // magenta
  "#eda100", // yellow
  "#1baf7a", // aqua
  "#eb6834", // orange
  "#4a3aa7", // violet
  "#e34948", // red
] as const;

/** Slate — a stop with no technician assigned. Deliberately outside the brand palette:
 *  it has to stay distinguishable from all 8 categorical slots above. */
export const UNASSIGNED_TECHNICIAN_COLOR = "#94A3B8";

const FALLBACK_COLOR = UNASSIGNED_TECHNICIAN_COLOR;

/**
 * `technicianIds` must already be in the stable roster order (e.g. sorted by
 * name then id) so a technician keeps the same color across tabs and dates.
 */
export function getTechnicianColorMap(technicianIds: string[]): Map<string, string> {
  const map = new Map<string, string>();
  technicianIds.forEach((id, index) => {
    map.set(id, PALETTE[index % PALETTE.length]);
  });
  return map;
}

export function getTechnicianColor(colorMap: Map<string, string>, technicianId: string | null | undefined): string {
  if (!technicianId) return FALLBACK_COLOR;
  return colorMap.get(technicianId) ?? FALLBACK_COLOR;
}

export function getTechnicianInitial(label: string | null | undefined): string {
  const trimmed = (label ?? "").trim();
  return trimmed.length > 0 ? trimmed[0]!.toUpperCase() : "?";
}
