/**
 * The starting residential checklist, supplied by Lindley's Pool & Spa Service on 2026-10-14.
 *
 * Separate from DEFAULT_CHECKLIST_ITEMS, which is the commercial list and stays untouched: a
 * backyard pool has no pump room to clean or weir doors to count, and a commercial property has no
 * salt cell to descale on a homeowner's schedule.
 *
 * `billable` marks the work a company normally charges extra for -- the ($) items on the supplied
 * list. No price is set here, because what to charge is each company's own decision; the admin
 * screen takes it, and VisitChecklistCompletion snapshots whatever it was when the item was ticked
 * (the same reason VisitChemicalDose snapshots unitCharge).
 *
 * Nothing is required by default. Requiring an item blocks a technician from closing the stop, and
 * that is a decision for the company to make deliberately rather than inherit from a seed.
 */
export type ResidentialChecklistSeedItem = {
  label: string;
  category: string;
  billable: boolean;
};

export const RESIDENTIAL_CHECKLIST_CATEGORIES = [
  "Daily & As-Needed",
  "Weekly Maintenance",
  "Monthly & Seasonal",
] as const;

export const DEFAULT_RESIDENTIAL_CHECKLIST: ResidentialChecklistSeedItem[] = [
  { label: "Water level", category: "Daily & As-Needed", billable: false },
  { label: "Skimmer baskets", category: "Daily & As-Needed", billable: false },
  { label: "Pump baskets", category: "Daily & As-Needed", billable: false },
  { label: "Pressure gauge", category: "Daily & As-Needed", billable: false },
  { label: "Sanitizer output", category: "Daily & As-Needed", billable: false },

  { label: "Surface skimming", category: "Weekly Maintenance", billable: false },
  { label: "Wall and floor brushing", category: "Weekly Maintenance", billable: false },
  { label: "Waterline tile", category: "Weekly Maintenance", billable: false },
  { label: "Vacuuming", category: "Weekly Maintenance", billable: false },
  { label: "pH testing and adjustment", category: "Weekly Maintenance", billable: false },
  { label: "Total Alkalinity testing and adjustment", category: "Weekly Maintenance", billable: false },
  { label: "Free Chlorine testing and adjustment", category: "Weekly Maintenance", billable: false },
  { label: "Shock treatment", category: "Weekly Maintenance", billable: true },
  { label: "Pump schedule verification", category: "Weekly Maintenance", billable: false },
  { label: "Backwashing", category: "Weekly Maintenance", billable: false },

  { label: "Filter deep cleaning", category: "Monthly & Seasonal", billable: true },
  { label: "Calcium Hardness testing and adjustment", category: "Monthly & Seasonal", billable: true },
  { label: "Cyanuric Acid (stabilizer) testing and adjustment", category: "Monthly & Seasonal", billable: true },
  { label: "Salt cell scale inspection", category: "Monthly & Seasonal", billable: true },
  { label: "O-ring and gasket lubrication", category: "Monthly & Seasonal", billable: true },
  { label: "Equipment pad leak checks", category: "Monthly & Seasonal", billable: false },
];
