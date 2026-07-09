
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
  const config: PoolConfig = { connectionString: raw };

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
