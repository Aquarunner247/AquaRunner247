-- Distinguishes a chemical that LOWERS its measurement from one that raises it.
--
-- chemicalType could not express this for free chlorine. Sodium Thiosulfate reduces chlorine but
-- shares chemicalType FREE_CHLORINE with ten products that raise it, and form GRANULAR with most of
-- them, so the dose picker -- which chose on isPrimary alone -- selected a raiser for a reading that
-- was ABOVE target. Fifty101's pool read 12ppm against its own 10ppm ceiling on 2026-10-01 and was
-- told to add 1.25 gallons of Liquid Chlorine 12%; 1.2 gallons were added.

ALTER TABLE "ChemicalProductCatalog" ADD COLUMN "lowersValue" BOOLEAN NOT NULL DEFAULT false;

-- Sodium thiosulfate is the only free-chlorine reducer in the catalog.
UPDATE "ChemicalProductCatalog" SET "lowersValue" = true WHERE name ILIKE 'Sodium Thiosulfate%';

-- The *_DOWN types are already unambiguous by type, but flagging them too means one rule covers the
-- whole catalog rather than free chlorine being a special case the picker has to remember.
UPDATE "ChemicalProductCatalog" SET "lowersValue" = true WHERE "chemicalType" IN ('PH_DOWN', 'ALKALINITY_DOWN');
