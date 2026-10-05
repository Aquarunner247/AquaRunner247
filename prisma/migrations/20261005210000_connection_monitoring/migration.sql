-- Samples how many database connections are actually in use, once a minute, from inside the database.
--
-- WHY THIS AND NOT pg_stat_statements: the `pgbouncer.get_auth` count in pg_stat_statements measures
-- connection CHURN, and every deployment kills every warm Fluid Compute instance and forces them all to
-- reconnect -- so a week of daily deploys buries the signal in reconnections that say nothing about
-- normal traffic. The read on 2026-10-05 could not separate the two.
--
-- What actually matters is the thing that caused the EMAXCONNSESSION outage on 2026-09-18: running out
-- of connections. That is a gauge, not a rate, and a deploy-time spike in it is real risk rather than
-- noise -- exactly what you would want to see. Pooler ceiling is 40, server max_connections is 60.
--
-- It runs as a pg_cron job, which executes INSIDE the database: no pooled connection, no get_auth call,
-- so the measurement cannot distort what it measures. Measuring this from the app would have added a
-- connection every minute and changed the number.
--
-- pg_cron is enabled separately (Dashboard > Integrations > Cron, or the create extension below, which
-- is a no-op if it is already on). Extensions are account-level capabilities that Supabase manages, so
-- enabling it by hand first and letting this be idempotent is deliberate.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;

CREATE SCHEMA IF NOT EXISTS monitoring;

CREATE TABLE IF NOT EXISTS monitoring.connection_sample (
    -- Truncated to the second so a double-fired minute cannot write two rows for the same instant.
    sampled_at timestamptz PRIMARY KEY DEFAULT date_trunc('second', now()),
    -- Backends against this database -- the number that matters against the pooler's ceiling.
    connections int NOT NULL,
    -- Of those, the ones that are client connections rather than Postgres's own background workers.
    client_backends int NOT NULL
);

-- Deny-all, matching every other table in this database: RLS on with no policies, so the anon key can
-- read nothing even if the `monitoring` schema is ever exposed through the API. See the 2026-07-17 RLS
-- incident -- the cost of this line is nothing and the cost of forgetting it was everything.
ALTER TABLE monitoring.connection_sample ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER so the cron job can read pg_stat_* regardless of the role it runs as, with an empty
-- search_path and fully-qualified names so nothing can be shadowed into it.
CREATE OR REPLACE FUNCTION monitoring.sample_connections() RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO monitoring.connection_sample (sampled_at, connections, client_backends)
  SELECT
    date_trunc('second', now()),
    (SELECT d.numbackends FROM pg_catalog.pg_stat_database d WHERE d.datname = current_database()),
    (SELECT count(*) FROM pg_catalog.pg_stat_activity a WHERE a.backend_type = 'client backend')
  ON CONFLICT (sampled_at) DO NOTHING;
$$;

-- 30 days kept: long enough to cover a quiet week and a busy one and compare them, short enough that
-- the table stays trivial (1,440 rows a day, ~43k at steady state).
CREATE OR REPLACE FUNCTION monitoring.trim_connection_samples() RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM monitoring.connection_sample WHERE sampled_at < now() - interval '30 days';
$$;

-- The peak is the number worth reading, so it is a view rather than something to remember how to query.
-- Hourly, because a minute-by-minute list of a quiet night tells you nothing and its maximum does.
CREATE OR REPLACE VIEW monitoring.connection_peak_by_hour AS
SELECT
  date_trunc('hour', sampled_at) AS hour,
  max(connections) AS peak_connections,
  max(client_backends) AS peak_client_backends,
  round(avg(connections), 1) AS avg_connections,
  count(*) AS samples
FROM monitoring.connection_sample
GROUP BY 1
ORDER BY 1 DESC;

-- cron.schedule upserts by job name, so re-running this migration re-points the same job rather than
-- creating a second one.
SELECT cron.schedule('monitoring-sample-connections', '* * * * *', $$SELECT monitoring.sample_connections();$$);
SELECT cron.schedule('monitoring-trim-connection-samples', '17 4 * * *', $$SELECT monitoring.trim_connection_samples();$$);
