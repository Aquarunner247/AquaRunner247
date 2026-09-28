
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { PoolConfig } from "pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined; pool: Pool | undefined };

/**
 * Prisma 7 uses `pg`. `sslmode=require` in the URL plus default TLS verification can cause P1011 (self-signed chain)
 * on poolers. For remote DBs we set `ssl: { rejectUnauthorized: false }` and strip `sslmode` so `pg` does not
 * also force verify-full. Opt into strict verification with DATABASE_SSL_REJECT_UNAUTHORIZED=true.
 */
function stripSslModeQuery(connectionString: string): string {
  const q = connectionString.indexOf("?");
  if (q === -1) return connectionString;
  const base = connectionString.slice(0, q);
  const rest = connectionString.slice(q + 1);
  const parts = rest.split("&").filter((p) => p.length > 0 && !/^sslmode=/i.test(p));
  return parts.length > 0 ? `${base}?${parts.join("&")}` : base;
}

function buildPoolConfig(): PoolConfig {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is not set");
  }

  const strict =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" ||
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "1";
  const relaxed =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false" ||
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "0";

  const lower = raw.toLowerCase();
  /** Typical Docker/local Postgres without TLS query params */
  const localPlain =
    /@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//i.test(raw) && !lower.includes("sslmode=");

  let connectionString = raw;
  const config: PoolConfig = {
    connectionString: raw,
    /**
     * Sized against the Supabase Session pooler's Pool Size (Project Settings > Database >
     * Connection pooling), raised from 15 to 40 on 2026-09-19 alongside a Nano -> Micro compute
     * upgrade (60 raw max_connections) after a real EMAXCONNSESSION incident. Fluid Compute can
     * run several function instances concurrently, each holding its own Pool (cached per-instance,
     * not shared), so `max` must stay well below that ceiling.
     *
     * `max: 2` with a 60s idle timeout, rather than the earlier `max: 4` with 10s. Those two
     * numbers have to move together: the old pairing meant a warm instance re-authenticated
     * through the pooler on almost every request, because Fluid Compute keeps instances alive far
     * longer than 10 seconds between requests. Measured over 83 days that was 35,644
     * pgbouncer.get_auth calls against 136,138 application queries -- one connection setup per
     * 3.8 queries, occasionally costing 1.1s.
     *
     * Halving `max` is what makes the longer idle safe: 40/2 = 20 concurrent instances before the
     * pooler's ceiling, up from 40/4 = 10, so this has MORE headroom than the config it replaces
     * while holding each connection long enough to reuse.
     *
     * The cost is intra-request parallelism: the admin dashboard's 4-query Promise.all now runs
     * two at a time instead of four. That's one extra ~2ms round trip against a 50-1147ms
     * reconnect avoided, and the per-page query count already dropped when getCurrentAppUser was
     * memoized and visit generation stopped being an N+1.
     */
    max: 2,
    idleTimeoutMillis: 60_000,
  };

  if (relaxed) {
    config.ssl = { rejectUnauthorized: false };
    if (!localPlain) connectionString = stripSslModeQuery(raw);
  } else if (strict) {
    if (!localPlain) config.ssl = { rejectUnauthorized: true };
  } else if (!localPlain) {
    config.ssl = { rejectUnauthorized: false };
    connectionString = stripSslModeQuery(raw);
  }

  config.connectionString = connectionString;
  return config;
}

function getPool(): Pool {
  if (!globalForPrisma.pool) {
    globalForPrisma.pool = new Pool(buildPoolConfig());
  }
  return globalForPrisma.pool;
}

const log =
  process.env.PRISMA_LOG_QUERIES === "true"
    ? (["query", "error", "warn"] as const)
    : process.env.NODE_ENV === "development"
      ? (["error", "warn"] as const)
      : (["error"] as const);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(getPool()),
    log: [...log],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
