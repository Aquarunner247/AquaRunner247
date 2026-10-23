import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runOrgScrub } from "@/lib/org-scrub";
import { confirmationMatches, confirmationLabel } from "@/lib/account-deletion-confirm";

/**
 * Deleting an organization's account, from inside the product.
 *
 * Apple's App Store Guideline 5.1.1(v) requires any app offering account creation to offer
 * account deletion initiated from within the app -- not a support address, not a web form the
 * app links out to. It is a common rejection reason and it was the last thing blocking
 * submission.
 *
 * This is NOT the cancellation flow. Cancelling ends the subscription and starts a 30-day
 * window in which the organization can still sign in and export (see SCRUB_GRACE_PERIOD_MS).
 * Deleting is the destructive one: it happens now, it cannot be undone, and the person asking
 * for it has been told so and has typed their own business name to confirm.
 *
 * Deliberately no safety archive. The cancellation path takes one, because cancelling is often
 * accidental or temporary. Quietly keeping a full copy of the data somebody just asked us to
 * delete would contradict the request, the Privacy Policy and DPA Section 9, so this path
 * takes none -- which is also why the UI puts the export tool directly above the delete box.
 */

// Re-exported so callers that need both the gate and the orchestrator have one import, while
// the gate itself stays importable without dragging `server-only` in behind it.
export { confirmationMatches, confirmationLabel, RETAINED_AFTER_DELETION } from "@/lib/account-deletion-confirm";

export type AccountDeletionResult =
  | { ok: true; deletedCounts: Record<string, number> }
  | { ok: false; reason: "not-found" | "confirmation-mismatch" | "scrub-failed"; error?: string };

/**
 * Cancels billing, removes the logins, scrubs the data, and marks the organization deleted.
 *
 * Order matters and is not arbitrary:
 *  1. Read the auth user ids FIRST -- runOrgScrub deletes the User rows that hold them, and
 *     without them the Supabase identities would be orphaned: still able to authenticate, with
 *     no account behind them. That is "deactivated", which is exactly what the guideline says
 *     is not enough.
 *  2. Cancel Stripe before scrubbing, so a failure part-way through cannot leave an account
 *     that is unusable but still billing.
 *  3. Scrub last, because it is the irreversible step.
 */
export async function deleteOrganizationAccount(
  organizationId: string,
  typedConfirmation: string,
): Promise<AccountDeletionResult> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      businessName: true,
      stripeSubscriptionId: true,
      users: { select: { authUserId: true } },
    },
  });
  if (!org) return { ok: false, reason: "not-found" };

  if (!confirmationMatches(typedConfirmation, confirmationLabel(org))) {
    return { ok: false, reason: "confirmation-mismatch" };
  }

  // Captured before the scrub deletes the rows they live on.
  const authUserIds = org.users.map((u) => u.authUserId).filter((id): id is string => Boolean(id));

  // Best effort, and logged: a Stripe outage must not block somebody from deleting their own
  // account. The subscription is also cancelled by the scrub making the account unusable, so
  // the worst case here is an invoice that needs refunding, not a silent ongoing charge.
  if (org.stripeSubscriptionId) {
    try {
      await stripe.subscriptions.cancel(org.stripeSubscriptionId);
    } catch (err) {
      console.error("[account-deletion] stripe cancel failed for org", organizationId, err);
    }
  }

  // Also best effort per identity: one failure must not strand the rest, and the User rows are
  // being deleted either way.
  const supabaseAdmin = createSupabaseAdminClient();
  for (const authUserId of authUserIds) {
    try {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
      if (error) console.error("[account-deletion] auth delete failed for", authUserId, error);
    } catch (err) {
      console.error("[account-deletion] auth delete threw for", authUserId, err);
    }
  }

  // Never a dry run. ORG_SCRUB_DRY_RUN is a safety on the automated nightly sweep, which acts
  // on its own schedule against orgs that have not asked for anything. This is a person
  // pressing a button that says delete.
  const outcome = await runOrgScrub(organizationId, false);
  if (outcome.status === "FAILED") {
    return { ok: false, reason: "scrub-failed", error: outcome.error };
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      planStatus: "CANCELED",
      dataScrubbedAt: new Date(),
      // The pending-scrub countdown is meaningless now; leaving it set would make the cron
      // pick this org up again for a second scrub.
      dataScrubScheduledAt: null,
      // stripeSubscriptionId is deliberately KEPT, matching lib/org-scrub.ts's allowlist: a
      // closed organization stays identifiable for support and audit, and the subscription is
      // already cancelled at Stripe so the id refers to nothing live. A late webhook for it
      // re-setting dataScrubScheduledAt is harmless -- the cron also requires dataScrubbedAt
      // to be null, which it no longer is.
    },
  });

  return { ok: true, deletedCounts: outcome.deletedCounts };
}
