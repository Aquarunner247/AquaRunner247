-- Sample connections every 5 minutes instead of every minute.
--
-- Measured 2026-10-11 over 108.4 hours: monitoring.sample_connections() was 59.6% of all database
-- execution time (6,502 calls at 28.3 ms), and its own pg_cron bookkeeping in cron.job_run_details
-- another ~14% across four statements. The monitor added to warn about overload had become ~74% of
-- the workload it was watching, and the per-minute cron authentication was also the likely source of
-- most remaining pgbouncer.get_auth calls.
--
-- Not a performance fix -- the database is 0.079% busy and none of this costs anything real. It is a
-- measurement fix: the sampler buried the application's own queries in pg_stat_statements and made
-- the next read of that table much harder to interpret.
--
-- Nothing depends on minute resolution. monitoring.connection_peak_by_hour takes hourly maxima and
-- reads the same with 12 samples an hour as with 60; its own `samples` column shows the change. The
-- trade accepted here is that a spike shorter than 5 minutes can now go unrecorded, which is the
-- right trade for the sustained pool exhaustion this exists to catch.
--
-- cron.schedule upserts by job name, so this re-points the existing job rather than adding a second
-- one, and re-running it is a no-op.
-- Guarded because pg_cron is an account-level capability Supabase manages, not something a local
-- Postgres necessarily has. The 2026-10-05 migration that created this job hit exactly that and
-- failed a local migrate; without the guard this would too, and a cron schedule is not worth
-- blocking local development over.
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    PERFORM cron.schedule('monitoring-sample-connections', '*/5 * * * *', $job$SELECT monitoring.sample_connections();$job$);
  ELSE
    RAISE NOTICE 'pg_cron not installed here -- skipping the connection-sampler reschedule.';
  END IF;
END
$guard$;
