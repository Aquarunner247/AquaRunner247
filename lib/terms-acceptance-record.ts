import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { TERMS_DOCUMENTS, TERMS_VERSION, type TermsAcceptanceContext } from "@/lib/terms-acceptance";

/**
 * Writing the acceptance. Separate from lib/terms-acceptance.ts, which stays Prisma-free and
 * unit-testable (same split as lib/plan-tiers-core.ts and lib/plan-tiers.ts) -- the pure half
 * is imported by a client component, so it must not drag `next/headers` or the database in.
 */

/** Who accepted, as known at the moment of the click. Taken as a parameter rather than
 * re-read here so the caller's already-authenticated user is the one recorded, and so a
 * transaction can pass its own client. */
export type TermsAccepter = {
  id: string | null;
  email: string;
  name: string | null;
  role: string;
};

/**
 * Best-effort request provenance for the acceptance record.
 *
 * Deliberately best-effort: counsel asked for IP and device "if available", and an acceptance
 * must never fail because a header was missing. Vercel sets x-forwarded-for, but a direct
 * request, a health check, or a future proxy may not, and null is a normal stored value.
 *
 * Only the first entry of x-forwarded-for is kept -- it is the client as the edge saw it; the
 * rest are proxy hops and are not evidence of anything. The value is client-controlled and
 * spoofable, which is why it is corroborating detail next to the authenticated user id, never
 * an identity on its own.
 */
async function requestProvenance(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const ipAddress = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    const userAgent = h.get("user-agent");
    return { ipAddress: ipAddress || null, userAgent: userAgent?.slice(0, 1000) || null };
  } catch {
    // headers() throws outside a request scope (a script, a background job). An acceptance
    // recorded without provenance is still an acceptance.
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * Records an act of assent: the append-only log row, and the current-state fields on the
 * organization, in one transaction.
 *
 * Both halves or neither, on purpose. A log row without the organization fields would re-prompt
 * an admin who had just accepted, and the organization fields without a log row would leave the
 * state that gates the app with no evidence behind it -- which is the situation this whole
 * change exists to end.
 *
 * `tx` lets the signup path write this inside the transaction that creates the organization, so
 * a half-created account never ends up carrying an acceptance.
 */
export async function recordTermsAcceptance(input: {
  organizationId: string;
  accepter: TermsAccepter;
  context: TermsAcceptanceContext;
  tx?: Prisma.TransactionClient;
  now?: Date;
}): Promise<void> {
  const { organizationId, accepter, context } = input;
  const now = input.now ?? new Date();
  const { ipAddress, userAgent } = await requestProvenance();

  const write = async (db: Prisma.TransactionClient) => {
    await db.termsAcceptance.create({
      data: {
        organizationId,
        acceptedByUserId: accepter.id,
        acceptedByEmail: accepter.email,
        acceptedByName: accepter.name,
        acceptedByRole: accepter.role,
        version: TERMS_VERSION,
        acceptedAt: now,
        documents: TERMS_DOCUMENTS.map((d) => d.href),
        context,
        ipAddress,
        userAgent,
      },
    });
    await db.organization.update({
      where: { id: organizationId },
      data: { termsAcceptedAt: now, termsAcceptedVersion: TERMS_VERSION },
    });
  };

  if (input.tx) {
    await write(input.tx);
    return;
  }
  await prisma.$transaction(write);
}

/**
 * The log row on its own, for a caller that is already setting the organization's
 * `termsAcceptedAt`/`termsAcceptedVersion` itself.
 *
 * That is the signup path: both of its branches write those fields as part of creating or
 * completing the Organization row, and an `organization.update` on top would be a redundant
 * write inside the same transaction. The `now` parameter exists so the log row carries the
 * exact timestamp the organization row got, rather than one a few milliseconds later -- two
 * different times for one act of assent is the kind of detail that gets picked at.
 *
 * Takes the transaction client explicitly: an acceptance that survived while the account
 * creation it belongs to rolled back would be evidence of nothing.
 */
export async function logTermsAcceptance(input: {
  db: Prisma.TransactionClient;
  organizationId: string;
  accepter: TermsAccepter;
  context: TermsAcceptanceContext;
  now: Date;
}): Promise<void> {
  const { ipAddress, userAgent } = await requestProvenance();
  await input.db.termsAcceptance.create({
    data: {
      organizationId: input.organizationId,
      acceptedByUserId: input.accepter.id,
      acceptedByEmail: input.accepter.email,
      acceptedByName: input.accepter.name,
      acceptedByRole: input.accepter.role,
      version: TERMS_VERSION,
      acceptedAt: input.now,
      documents: TERMS_DOCUMENTS.map((d) => d.href),
      context: input.context,
      ipAddress,
      userAgent,
    },
  });
}
