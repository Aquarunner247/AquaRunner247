import { prisma } from "@/lib/prisma";

/**
 * One-time (idempotent, upsert-by-name) seed of the global ChemicalProductCatalog -- the
 * system-maintained reference list orgs enable/price/primary-pick from, never build
 * themselves from scratch.
 *
 * Every dosingConstant below is transcribed directly from a physical Taylor Technologies
 * pool-chemistry manual's printed treatment tables (not an industry-standard
 * approximation -- a prior version of this catalog used those and was removed for that
 * reason). Each row cites its source table letter. All constants were cross-validated
 * against the tables' own additive-column property (e.g. the 20,000-gal column always
 * equals 2x the 10,000-gal column) before being transcribed here.
 *
 * dosingConstant is amount of dosingUnit per 10,000 gallons, per:
 *   - 1 ppm of target-current delta, for every row EXCEPT the 3 pH rows
 *   - 1 drop of Taylor Base/Acid Demand Reagent, for the 3 isDemandBased pH rows (there is
 *     no ppm-delta formula for pH -- see lib/dosing-calculator.ts's computePhDose)
 *
 * Usage:
 *   DATABASE_URL="<connection string>" node --env-file=.env node_modules/.bin/tsx prisma/seed-chemical-product-catalog.ts
 */

// SDS (Safety Data Sheet) links below are external -- we link to the document as published
// on the manufacturer/distributor's own site, never a copy we downloaded and re-host, so
// orgs always see the current version. Each was individually fetched and read this session
// to confirm it's a real, correctly-matched document (right chemical, right concentration)
// before being added here -- not an industry-generic filler. Left null on the three
// Cal-Hypo grades (45%/60%/75%) where no distinct, verified source was found for that
// specific concentration -- using a mismatched-concentration document would misrepresent
// the actual hazard data, so "org must upload their own" is the honest default there.
const HASA = "HASA Inc.";

const PRODUCTS: {
  name: string;
  chemicalType: "FREE_CHLORINE" | "PH_UP" | "PH_DOWN" | "ALKALINITY_UP" | "ALKALINITY_DOWN" | "CYA" | "CALCIUM_HARDNESS" | "SALT";
  form: "LIQUID" | "GRANULAR";
  activePercent: number | null;
  dosingUnit: "OZ" | "FL_OZ";
  dosingConstant: number;
  isDemandBased?: boolean;
  displayOrder: number;
  sdsDocumentUrl?: string;
  sdsSourceLabel?: string;
}[] = [
  // --- Free Chlorine (raise) -- Table A ---
  {
    name: "Liquid Chlorine 10%",
    chemicalType: "FREE_CHLORINE",
    form: "LIQUID",
    activePercent: 10,
    dosingUnit: "FL_OZ",
    dosingConstant: 12.8,
    displayOrder: 1,
    sdsDocumentUrl: "https://www.hasa.com/hubfs/Product%20Assets/10%20Sodium%20Hypochlorite%20Solution/Hasa-10.0-Sodium-Hypochlorite-Solution-SDS-r0718.pdf",
    sdsSourceLabel: HASA,
  },
  {
    name: "Liquid Chlorine 12%",
    chemicalType: "FREE_CHLORINE",
    form: "LIQUID",
    activePercent: 12,
    dosingUnit: "FL_OZ",
    dosingConstant: 10.7,
    displayOrder: 2,
    sdsDocumentUrl: "https://www.hasa.com/hubfs/Product%20Assets/12.5%20Sodium%20Hypochlorite%20Solution/Hasa-Bleach-12.5-SDS-r0718.pdf",
    sdsSourceLabel: HASA,
  },
  {
    name: "Lithium Hypochlorite 35%",
    chemicalType: "FREE_CHLORINE",
    form: "GRANULAR",
    activePercent: 35,
    dosingUnit: "OZ",
    dosingConstant: 3.82,
    displayOrder: 3,
    sdsDocumentUrl: "https://landmarkaquatic.com/wp-content/uploads/2024/06/Lithium-Hypochlorite-SDS-Spear-Corporation.pdf",
    sdsSourceLabel: "Spear Corporation",
  },
  // Cal-Hypo 45%/60%/75%: no distinct verified SDS found for these specific concentrations
  // -- deliberately no default, see this file's header comment.
  { name: "Cal-Hypo 45%", chemicalType: "FREE_CHLORINE", form: "GRANULAR", activePercent: 45, dosingUnit: "OZ", dosingConstant: 2.97, displayOrder: 4 },
  { name: "Cal-Hypo 60%", chemicalType: "FREE_CHLORINE", form: "GRANULAR", activePercent: 60, dosingUnit: "OZ", dosingConstant: 2.23, displayOrder: 5 },
  // Confirmed this session: at 65% this is Calcium Hypochlorite, not Dichlor (dichlor tops
  // out ~62-63% available chlorine; cal-hypo commonly runs 65-68%).
  {
    name: "Cal-Hypo / Dichlor 65%",
    chemicalType: "FREE_CHLORINE",
    form: "GRANULAR",
    activePercent: 65,
    dosingUnit: "OZ",
    dosingConstant: 2.05,
    displayOrder: 6,
    sdsDocumentUrl: "https://accomn.com/userfiles/modules/file_upload_library_3/3073/Calcium-Hypochlorite-65-Freestyle.pdf",
    sdsSourceLabel: "Harcros Chemicals Inc.",
  },
  { name: "Cal-Hypo 75%", chemicalType: "FREE_CHLORINE", form: "GRANULAR", activePercent: 75, dosingUnit: "OZ", dosingConstant: 1.77, displayOrder: 7 },
  {
    name: "Trichlor 90%",
    chemicalType: "FREE_CHLORINE",
    form: "GRANULAR",
    activePercent: 90,
    dosingUnit: "OZ",
    dosingConstant: 1.48,
    displayOrder: 8,
    sdsDocumentUrl: "https://spearcorp.com/wp-content/uploads/2016/10/Tri-Chlor-SDS.pdf",
    sdsSourceLabel: "Spear Corporation",
  },
  {
    name: "Chlorine Gas 100%",
    chemicalType: "FREE_CHLORINE",
    form: "GRANULAR",
    activePercent: 100,
    dosingUnit: "OZ",
    dosingConstant: 1.34,
    displayOrder: 9,
    sdsDocumentUrl: "https://olinchloralkali.com/wp-content/uploads/sites/5/2025/08/Chlorine-98-100_US_EN.pdf",
    sdsSourceLabel: "Olin Chlor Alkali",
  },

  // --- Free Chlorine (lower) -- Table C ---
  {
    name: "Sodium Thiosulfate 100%",
    chemicalType: "FREE_CHLORINE",
    form: "GRANULAR",
    activePercent: 100,
    dosingUnit: "OZ",
    dosingConstant: 2.63,
    displayOrder: 10,
    sdsDocumentUrl: "https://www.hasa.com/hubfs/Product%20Assets/Neutralizer/Neutralizer%20-%20Safety%20Data%20Sheet.pdf",
    sdsSourceLabel: HASA,
  },

  // --- pH (raise) -- Table D, Base Demand titration ---
  {
    name: "Soda Ash (Sodium Carbonate) 100%",
    chemicalType: "PH_UP",
    form: "GRANULAR",
    activePercent: 100,
    dosingUnit: "OZ",
    dosingConstant: 5.13,
    isDemandBased: true,
    displayOrder: 20,
    sdsDocumentUrl: "https://www.hasa.com/hubfs/Product%20Assets/Soda%20Ash/Soda%20Ash%20-%20Safety%20Data%20Sheet.pdf",
    sdsSourceLabel: HASA,
  },

  // --- pH (lower) -- Tables E/F, Acid Demand titration ---
  {
    name: "Muriatic Acid 31.45% (pH)",
    chemicalType: "PH_DOWN",
    form: "LIQUID",
    activePercent: 31.45,
    dosingUnit: "FL_OZ",
    dosingConstant: 9.16,
    isDemandBased: true,
    displayOrder: 21,
    sdsDocumentUrl: "https://www.hasa.com/hubfs/Product%20Assets/Muriatic%20Acid/Muriatic%20Acid%20-%20Safety%20Data%20Sheet.pdf",
    sdsSourceLabel: HASA,
  },
  {
    name: "Dry Acid (Sodium Bisulfate) 93.2% (pH)",
    chemicalType: "PH_DOWN",
    form: "GRANULAR",
    activePercent: 93.2,
    dosingUnit: "OZ",
    dosingConstant: 12.3,
    isDemandBased: true,
    displayOrder: 22,
    sdsDocumentUrl: "https://www.hasa.com/hubfs/Product%20Assets/Dry%20Acid/Dry%20Acid%20-%20SDS.pdf",
    sdsSourceLabel: HASA,
  },

  // --- Total Alkalinity (raise) -- Table G ---
  {
    name: "Baking Soda (Sodium Bicarbonate) 100%",
    chemicalType: "ALKALINITY_UP",
    form: "GRANULAR",
    activePercent: 100,
    dosingUnit: "OZ",
    dosingConstant: 2.24,
    displayOrder: 30,
    sdsDocumentUrl: "https://www.hasa.com/hubfs/Product%20Assets/Alkalinity%20Up/Alkalinity%20Up%20-%20Safety%20Data%20Sheet.pdf",
    sdsSourceLabel: HASA,
  },

  // --- Total Alkalinity (lower) -- Tables H/I -- same chemicals, same SDS, as the pH-down rows above ---
  {
    name: "Dry Acid (Sodium Bisulfate) 93.2% (Alkalinity)",
    chemicalType: "ALKALINITY_DOWN",
    form: "GRANULAR",
    activePercent: 93.2,
    dosingUnit: "OZ",
    dosingConstant: 3.44,
    displayOrder: 31,
    sdsDocumentUrl: "https://www.hasa.com/hubfs/Product%20Assets/Dry%20Acid/Dry%20Acid%20-%20SDS.pdf",
    sdsSourceLabel: HASA,
  },
  {
    name: "Muriatic Acid 31.45% (Alkalinity)",
    chemicalType: "ALKALINITY_DOWN",
    form: "LIQUID",
    activePercent: 31.45,
    dosingUnit: "FL_OZ",
    dosingConstant: 2.56,
    displayOrder: 32,
    sdsDocumentUrl: "https://www.hasa.com/hubfs/Product%20Assets/Muriatic%20Acid/Muriatic%20Acid%20-%20Safety%20Data%20Sheet.pdf",
    sdsSourceLabel: HASA,
  },

  // --- Calcium Hardness (raise) -- Table J ---
  {
    name: "Calcium Chloride 77%",
    chemicalType: "CALCIUM_HARDNESS",
    form: "GRANULAR",
    activePercent: 77,
    dosingUnit: "OZ",
    dosingConstant: 1.92,
    displayOrder: 40,
    sdsDocumentUrl: "https://www.hasa.com/hubfs/Product%20Assets/Calcium%20Chloride/Calcium%20Chloride%20(Dry)%20-%20Safety%20Data%20Sheet.pdf",
    sdsSourceLabel: HASA,
  },

  // --- Cyanuric Acid (raise) -- Table K ---
  {
    name: "Cyanuric Acid (Stabilizer)",
    chemicalType: "CYA",
    form: "GRANULAR",
    activePercent: 100,
    dosingUnit: "OZ",
    dosingConstant: 1.328,
    displayOrder: 50,
    sdsDocumentUrl: "https://www.hasa.com/hubfs/Product%20Assets/Pool%20Conditioner/Pool%20Conditioner%20-%20SDS.pdf",
    sdsSourceLabel: HASA,
  },

  // --- Salt (raise) -- Table L ---
  {
    name: "Sodium Chloride (Salt)",
    chemicalType: "SALT",
    form: "GRANULAR",
    activePercent: 100,
    dosingUnit: "OZ",
    dosingConstant: 1.333,
    displayOrder: 60,
    sdsDocumentUrl: "https://images.thdstatic.com/catalog/pdfImages/51/5121859b-c36d-4b0a-bdbc-214859e991bb.pdf",
    sdsSourceLabel: "Cargill / Diamond Crystal",
  },
];

async function main() {
  console.log(`Seeding ${PRODUCTS.length} chemical product catalog rows...`);
  for (const p of PRODUCTS) {
    await prisma.chemicalProductCatalog.upsert({
      where: { name: p.name },
      create: { ...p, isSystemDefault: true },
      update: { ...p, isSystemDefault: true },
    });
    console.log(`  ${p.name} (${p.chemicalType})`);
  }
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
