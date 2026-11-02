-- Trichlor pucks in a floating dispenser, as distinct from a plumbed erosion feeder.
--
-- Additive only: no existing row changes, and every body keeps the mechanism it has.
-- Postgres allows ADD VALUE inside a transaction (PG12+) so long as the new value is not
-- USED in the same transaction, which is why nothing below references it.
ALTER TYPE "ChlorineFeedMechanism" ADD VALUE IF NOT EXISTS 'TABLET_FLOATER';
