import { prisma } from "@/lib/prisma";

/**
 * One-time (idempotent, upsert-by-name) seed of the global ChemicalProductCatalog --
 * the system-maintained reference list orgs enable/price/target from, never build
 * themselves from scratch. Values below are transcribed directly from
 * dosing-calculator-spec.md Section 6 (industry-standard CPO/Taylor/Orenda-aligned
 * figures), converting each product's published fl-oz-per-ppm constant into whichever
 * dosingUnit is most practical to display for that product (see per-row comments).
 *
 * Per Section 7's open items, v1 ships ONE product list for both pool and spa
 * (poolOrSpa: BOTH throughout) -- no separate spa-scale (tsp/tbsp) catalog rows yet;
 * a 400-gallon spa gets a correctly small dose through the gallons-based scaling in the
 * formula itself, just displayed in the same unit as the pool version. This supersedes
 * Section 6's own "seed spa-oriented rows with a smaller dosingUnit" suggestion, which
 * Section 7 explicitly walks back for v1.
 *
 * Usage:
 *   DATABASE_URL="<connection string>" npx tsx prisma/seed-chemical-product-catalog.ts
 */

const PRODUCTS: {
  name: string;
  chemicalType: "FREE_CHLORINE" | "PH_UP" | "PH_DOWN" | "ALKALINITY_UP" | "CYA" | "CALCIUM_HARDNESS" | "SALT";
  form: "LIQUID" | "GRANULAR" | "TABLET" | "PUCK";
  activePercent: number | null;
  dosingUnit: "OZ" | "LB" | "GAL" | "QUART" | "TABLET" | "SCOOP" | "TSP" | "TBSP";
  dosingFactor: number;
  cyaAddedPerFcPpm: number | null;
  defaultRoundingIncrement: number;
  displayOrder: number;
}[] = [
  // --- Free Chlorine (raise) ---
  // 13.3 fl oz per 1 ppm/10,000 gal -> fl oz treated as weight oz per Section 6's note,
  // converted to gallons (128 fl oz/gal) since this product is normally dosed by the gallon.
  {
    name: "Liquid Chlorine 10% (Sodium Hypochlorite)",
    chemicalType: "FREE_CHLORINE",
    form: "LIQUID",
    activePercent: 10,
    dosingUnit: "GAL",
    dosingFactor: 0.1039,
    cyaAddedPerFcPpm: null,
    defaultRoundingIncrement: 0.25,
    displayOrder: 1,
  },
  {
    name: "Liquid Chlorine 12.5% (Sodium Hypochlorite)",
    chemicalType: "FREE_CHLORINE",
    form: "LIQUID",
    activePercent: 12.5,
    dosingUnit: "OZ",
    dosingFactor: 10.7,
    cyaAddedPerFcPpm: null,
    defaultRoundingIncrement: 0.5,
    displayOrder: 2,
  },
  {
    name: "Cal-Hypo 65% (Calcium Hypochlorite)",
    chemicalType: "FREE_CHLORINE",
    form: "GRANULAR",
    activePercent: 65,
    dosingUnit: "OZ",
    dosingFactor: 2.05,
    cyaAddedPerFcPpm: null,
    defaultRoundingIncrement: 0.5,
    displayOrder: 3,
  },
  {
    name: "Cal-Hypo 73% (Calcium Hypochlorite)",
    chemicalType: "FREE_CHLORINE",
    form: "GRANULAR",
    activePercent: 73,
    dosingUnit: "OZ",
    dosingFactor: 1.83,
    cyaAddedPerFcPpm: null,
    defaultRoundingIncrement: 0.5,
    displayOrder: 4,
  },
  {
    // Spa-common per spec, but v1 ships one shared pool/spa list (see file doc comment).
    // Adds stabilizer as a side effect of raising chlorine -- the ~0.9 ppm CYA per ppm FC
    // figure from Section 6 drives the "avoid stabilizer same visit as shock" warning.
    name: "Dichlor 56% (Sodium Dichlor)",
    chemicalType: "FREE_CHLORINE",
    form: "GRANULAR",
    activePercent: 56,
    dosingUnit: "OZ",
    dosingFactor: 2.38,
    cyaAddedPerFcPpm: 0.9,
    defaultRoundingIncrement: 0.5,
    displayOrder: 5,
  },

  // --- pH Down (Muriatic Acid) ---
  // Constant is per 1.0 pH unit (not ppm) per 10,000 gal -- see
  // ChemicalProductCatalog.dosingFactor's doc comment for this exception.
  {
    name: "Muriatic Acid 31.45%",
    chemicalType: "PH_DOWN",
    form: "LIQUID",
    activePercent: 31.45,
    dosingUnit: "OZ",
    dosingFactor: 100,
    cyaAddedPerFcPpm: null,
    defaultRoundingIncrement: 1,
    displayOrder: 6,
  },

  // --- pH Up (Soda Ash) ---
  {
    name: "Soda Ash (Sodium Carbonate)",
    chemicalType: "PH_UP",
    form: "GRANULAR",
    activePercent: null,
    dosingUnit: "OZ",
    dosingFactor: 30,
    cyaAddedPerFcPpm: null,
    defaultRoundingIncrement: 1,
    displayOrder: 7,
  },

  // --- Total Alkalinity Up (Sodium Bicarbonate) ---
  {
    name: "Sodium Bicarbonate (Baking Soda)",
    chemicalType: "ALKALINITY_UP",
    form: "GRANULAR",
    activePercent: null,
    dosingUnit: "OZ",
    dosingFactor: 2.4,
    cyaAddedPerFcPpm: null,
    defaultRoundingIncrement: 0.5,
    displayOrder: 8,
  },

  // --- Cyanuric Acid / Stabilizer Up ---
  {
    name: "Cyanuric Acid (Stabilizer/Conditioner)",
    chemicalType: "CYA",
    form: "GRANULAR",
    activePercent: null,
    dosingUnit: "OZ",
    dosingFactor: 1.3,
    cyaAddedPerFcPpm: null,
    defaultRoundingIncrement: 0.5,
    displayOrder: 9,
  },

  // --- Calcium Hardness Up (Calcium Chloride) ---
  {
    name: "Calcium Chloride Dihydrate 77%",
    chemicalType: "CALCIUM_HARDNESS",
    form: "GRANULAR",
    activePercent: 77,
    dosingUnit: "OZ",
    dosingFactor: 2.4,
    cyaAddedPerFcPpm: null,
    defaultRoundingIncrement: 0.5,
    displayOrder: 10,
  },

  // --- Salt (Sodium Chloride, for SWG pools) ---
  // 8.35 lb raises 100 ppm/10,000 gal (exact, mass/volume) -> 0.0835 lb per 1 ppm.
  // LB (not OZ) since salt is dosed in bulk -- typical fresh-fill corrections run into
  // hundreds of pounds, so a coarser 5 lb rounding increment matches real bag handling.
  {
    name: "Sodium Chloride (Pool Salt)",
    chemicalType: "SALT",
    form: "GRANULAR",
    activePercent: null,
    dosingUnit: "LB",
    dosingFactor: 0.0835,
    cyaAddedPerFcPpm: null,
    defaultRoundingIncrement: 5,
    displayOrder: 11,
  },
];

async function main() {
  for (const p of PRODUCTS) {
    await prisma.chemicalProductCatalog.upsert({
      where: { name: p.name },
      create: {
        name: p.name,
        chemicalType: p.chemicalType,
        poolOrSpa: "BOTH",
        form: p.form,
        activePercent: p.activePercent,
        dosingUnit: p.dosingUnit,
        dosingFactor: p.dosingFactor,
        cyaAddedPerFcPpm: p.cyaAddedPerFcPpm,
        defaultRoundingIncrement: p.defaultRoundingIncrement,
        isSystemDefault: true,
        displayOrder: p.displayOrder,
      },
      update: {
        chemicalType: p.chemicalType,
        poolOrSpa: "BOTH",
        form: p.form,
        activePercent: p.activePercent,
        dosingUnit: p.dosingUnit,
        dosingFactor: p.dosingFactor,
        cyaAddedPerFcPpm: p.cyaAddedPerFcPpm,
        defaultRoundingIncrement: p.defaultRoundingIncrement,
        isSystemDefault: true,
        displayOrder: p.displayOrder,
      },
    });
    console.log(`Upserted: ${p.name}`);
  }
  console.log(`\nDone -- ${PRODUCTS.length} catalog products seeded.`);
}

main()
  .catch((err) => {
    console.error("SEED FAILED:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
