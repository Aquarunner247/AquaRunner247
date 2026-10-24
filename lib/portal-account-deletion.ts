import { prisma } from "@/lib/prisma";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { emailConfirmationMatches } from "@/lib/account-deletion-confirm";

/**
 * Deleting one End Customer's portal login, from inside the portal.
 *
 * The counterpart to lib/account-deletion.ts, and deliberately much smaller. An organization
 * account belongs to the pool company and deleting it scrubs the company's data. A portal
 * account belongs to the person reading it, and deleting it removes ONLY the login.
 *
 * It must not touch the service history. Under the DPA the pool company is the controller of
 * those records and AquaRunner is its processor -- we hold them on the company's instructions,
 * not the reader's. Letting an End Customer delete them from the portal would let a customer
 * erase a business's compliance log, which is both wrong and the opposite of what the QR-code
 * record exists for. Privacy Policy Section 11 already says a request about those records goes
 * to the pool company first; this is the part we can honour ourselves.
 *
 * Until now Privacy Policy Section 13 said portal accounts were deleted on request by email.
 * This makes it self-serve, which is what that section should say instead.
 */

export type PortalAccountDeletionResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "confirmation-mismatch" };

/**
 * Removes the Supabase identity and the CustomerUser row.
 *
 * Auth identity first, for the same reason the organization path reads its ids first: the row
 * holds the id, and deleting the row before the identity would strand a credential that can
 * still authenticate with nothing behind it.
 *
 * The Customer record, its properties, bodies of water, visits, readings and documents are all
 * left exactly as they are. The pool company can issue a fresh login to the same address
 * afterwards -- CustomerUser.email is unique, and deleting the row frees it.
 *
 * One consequence worth knowing: ServiceVisit.loggedByCustomerUserId is `onDelete: SetNull`, so
 * any reading this person logged themselves stays in the compliance record but stops being
 * attributed to them. That is the right outcome for a deletion request -- the log survives, the
 * link to the individual does not -- but it means "who logged this" becomes blank rather than
 * naming someone who no longer exists.
 */
export async function deletePortalAccount(
  customerUserId: string,
  typedConfirmation: string,
): Promise<PortalAccountDeletionResult> {
  const account = await prisma.customerUser.findUnique({
    where: { id: customerUserId },
    select: { id: true, email: true, authUserId: true },
  });
  if (!account) return { ok: false, reason: "not-found" };

  if (!emailConfirmationMatches(typedConfirmation, account.email)) {
    return { ok: false, reason: "confirmation-mismatch" };
  }

  if (account.authUserId) {
    // Best effort and logged: a Supabase hiccup must not leave somebody unable to delete their
    // own login. The row goes either way, and without it the identity resolves to no portal
    // account, so the worst case is an orphaned credential that can reach nothing.
    try {
      const supabaseAdmin = createSupabaseAdminClient();
      const { error } = await supabaseAdmin.auth.admin.deleteUser(account.authUserId);
      if (error) console.error("[portal-account-deletion] auth delete failed for", account.authUserId, error);
    } catch (err) {
      console.error("[portal-account-deletion] auth delete threw for", account.authUserId, err);
    }
  }

  await prisma.customerUser.delete({ where: { id: account.id } });

  return { ok: true };
}
