/**
 * Seeded onto every newly created Organization's checklist, so a new admin starts with a
 * working commercial-service checklist instead of an empty list -- taken verbatim from the
 * checklist Lindley's Pool & Spa Service (the original org) built out through real use.
 * Admins can freely edit/delete/reorder from here at /dashboard/checklist; this only sets
 * the starting point.
 */
export const DEFAULT_CHECKLIST_ITEMS: string[] = [
  "Empty skimmer baskets",
  "Vacuum",
  "Skim surface",
  "Brush down pool walls",
  "Clean waterline tile",
  "Wipe oil buildup from skimmers",
  "Charged with DE",
  "Visual check safety equipment",
  "Empty Pump Basket",
  "Check for missing weir doors",
  "Pump room clean",
  "Chemicals checked and balanced",
  "Check water level and add or drain water when necessary",
  "Verify circulation: look for normal return flow and confirm skimmers and suction openings are clear",
  "Inspect all equipment for leaks, unusual noise, pressure changes, or malfunctions",
];
