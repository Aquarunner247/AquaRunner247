-- Record five migrations that are APPLIED in production but not tracked by Prisma.
--
-- Each one's columns already exist; they were applied through Supabase rather than Prisma, so
-- they landed in supabase_migrations.schema_migrations and never reached "_prisma_migrations".
-- Nothing in the deploy path runs `prisma migrate deploy` (build is plain `next build`), so this
-- is inert today -- but the first run of it against production would try to re-apply all five,
-- fail on "already exists", and leave a failed row that blocks every later migration.
--
-- This writes TRACKING ROWS ONLY. No schema is changed and no data is touched.
--
-- The checksums are the SHA-256 of each local prisma/migrations/<name>/migration.sql, which is
-- what Prisma itself stores -- verified against the already-recorded
-- 20261019120000_body_service_group, whose stored checksum matches its local file byte for byte.
-- A wrong checksum would make Prisma report the migration as "modified after being applied".
--
-- Re-runnable: NOT EXISTS rather than ON CONFLICT, because "_prisma_migrations" has no unique
-- constraint on migration_name -- its only one is the primary key on id. Running this twice
-- inserts nothing the second time; it does NOT create duplicates.
INSERT INTO "_prisma_migrations"
  (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid()::text, v.checksum, now(), v.migration_name, NULL, NULL, now(), 1
FROM (VALUES
  ('f70e86970fc5b6d2fdb081fce27ebd3a1a393d25e12666dc5c52a13128dc58fb', '20261022180000_organization_terms_acceptance'),
  ('453010e38e41b758acb84a100c2e31632bc232ffbf59946044823a348dde191f', '20261022210000_organization_trial_reminder'),
  ('e35e9b9dac6b4f7ce14a6a43db9971870d5a451ebf95cb16c2192e3dc584b417', '20261025120000_visit_abandoned_alert'),
  ('6a5d2c1e6396a7fa1c49b73c8610f87dc9af5061744cd16de7e2750f0439ef66', '20261025180000_visit_departed_at'),
  ('f8619343a7e9099e7f0f88d5630ab819e250d994b5f41ba871f788ea2156ca98', '20261027050000_visit_created_by')
) AS v(checksum, migration_name)
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" m WHERE m.migration_name = v.migration_name
);

-- Verify: five rows, each with a finished_at and no rolled_back_at.
SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
FROM "_prisma_migrations"
WHERE migration_name IN (
  '20261022180000_organization_terms_acceptance',
  '20261022210000_organization_trial_reminder',
  '20261025120000_visit_abandoned_alert',
  '20261025180000_visit_departed_at',
  '20261027050000_visit_created_by'
)
ORDER BY migration_name;
