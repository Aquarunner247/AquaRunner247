
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
     * Supabase's Session pooler caps total clients project-wide (see Pool Size under
     * Project Settings > Database > Connection pooling) -- raised from 15 to 40 on
     * 2026-09-19 alongside a Nano -> Micro compute upgrade (60 raw max_connections now),
     * after a real EMAXCONNSESSION incident. Fluid Compute can run several function
     * instances concurrently, each holding its own Pool (cached per-instance, not shared)
     * -- this must stay well below the pooler's Pool Size so several instances can coexist
     * without exhausting it, and leave real headroom for Supabase's own internal use
     * (Studio, Realtime, direct/admin connections) rather than claiming the whole pool.
     * 4 was picked to match the admin dashboard's own heaviest single-request batch
     * (app/dashboard/page.tsx's 4-query Promise.all) -- high enough that its busiest page
     * never queues internally on its own pool, while 40/4 = 10 concurrent instances can
     * still run at once before hitting the pooler's ceiling (vs. 5 at the old 15/3).
     */
    max: 4,
    idleTimeoutMillis: 10_000,
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
