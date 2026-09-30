import "server-only";
import { prisma } from "@/lib/prisma";
import {
  addressKey,
  clientAddress,
  WAITLIST_MAX_PER_WINDOW,
  WAITLIST_WINDOW_MS,
} from "@/lib/waitlist-rate-limit-keys";

/**
 * Per-source rate limiting for the public waitlist endpoint.
 *
 * Vercel BotID already blocks automated clients, and that remains the main defence. This is the
 * second layer: a human, or a bot that defeats BotID, could otherwise submit endlessly. The email
 * column is unique, so one address cannot create unbounded rows -- but generated addresses can, and
 * every attempt also sends a notification email.
 *
 * Postgres-backed rather than in-memory, because this runs on Fluid Compute: an in-process counter
 * is per-instance, so a caller spread across instances would never hit it.
 */

/** Attempt rows older than this are pruned. Kept a little beyond the window so a request near the
 *  boundary still sees the attempts it should. */
const PRUNE_AFTER_MS = WAITLIST_WINDOW_MS * 2;

/** Roughly how often a request also prunes. A write on every request would be wasteful, and the
 *  table stays tiny as long as it happens sometimes. */
const PRUNE_CHANCE = 0.05;

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Records this attempt and says whether it is over the limit.
 *
 * Counts BEFORE inserting, so the Nth attempt in a window is the last allowed one. Every attempt is
 * recorded, including ones that turn out to be an invalid address or a duplicate -- those are
 * exactly what a flood looks like, and not counting them would leave the limit trivial to avoid.
 *
 * Fails OPEN. A waitlist signup is the top of the funnel, and losing a real one to a transient
 * database error is worse than letting an extra attempt through; the limit is a guard against
 * volume, not a security control.
 */
export async function checkWaitlistRateLimit(request: Request): Promise<RateLimitDecision> {
  const address = clientAddress(request);
  // Nothing to attribute the attempt to, so nothing to limit. BotID still applies.
  if (!address) return { allowed: true };

  const ipHash = addressKey(address);
  const windowStart = new Date(Date.now() - WAITLIST_WINDOW_MS);

  try {
    const recent = await prisma.waitlistAttempt.count({ where: { ipHash, createdAt: { gte: windowStart } } });
    if (recent >= WAITLIST_MAX_PER_WINDOW) {
      const oldest = await prisma.waitlistAttempt.findFirst({
        where: { ipHash, createdAt: { gte: windowStart } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      // When the oldest attempt in the window ages out, a slot frees up.
      const freesAt = (oldest?.createdAt.getTime() ?? Date.now()) + WAITLIST_WINDOW_MS;
      const retryAfterSeconds = Math.max(1, Math.ceil((freesAt - Date.now()) / 1000));
      return { allowed: false, retryAfterSeconds };
    }

    await prisma.waitlistAttempt.create({ data: { ipHash } });

    if (Math.random() < PRUNE_CHANCE) {
      await prisma.waitlistAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - PRUNE_AFTER_MS) } } });
    }
    return { allowed: true };
  } catch (error) {
    console.error("[waitlist] rate-limit check failed, allowing the request:", error);
    return { allowed: true };
  }
}
