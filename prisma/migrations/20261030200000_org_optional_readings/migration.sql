-- Which optional water readings an organization tracks.
--
-- Calcium hardness and salt are the only two reading fields no state's compliance log requires.
-- They rendered on every visit regardless, under an "Optional" heading, which put two sliders
-- most technicians ignore onto a screen read in direct sun.
--
-- Default FALSE for everyone, including existing organizations. A reading nobody asked for
-- should not start appearing because of a schema change, and the one organization on the system
-- today has never filled either field.
--
-- Visible, not mandatory: salt applies to a salt pool and not to the chlorine pool next door,
-- and the same company services both.
ALTER TABLE "Organization" ADD COLUMN "trackCalciumHardness" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN "trackSaltPpm"         BOOLEAN NOT NULL DEFAULT false;
