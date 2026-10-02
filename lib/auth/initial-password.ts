import "server-only";
import { randomBytes } from "node:crypto";

/**
 * A password for a brand-new portal account that nobody is ever told, including the admin creating it.
 *
 * Supabase requires a password to create an account, but the person then sets their own through the
 * activation link in the welcome email, so there is no reason for a human-chosen one to exist. The
 * admin used to type a temporary password which was emailed in plain text -- an inbox is a bad place
 * for a working credential, and it was one more thing to pass along by hand.
 *
 * So this fills the slot and is immediately forgotten: generated, handed to Supabase, never returned to
 * a caller, never logged, never emailed, never stored by us. The only way into the account is the
 * single-use activation link, or a fresh password reset.
 *
 * 32 bytes from the system CSPRNG. Long and unguessable matters precisely because nobody will ever
 * rotate it -- it has to stay useless to an attacker for the life of the account.
 */
export function generateUnknowablePassword(): string {
  return randomBytes(32).toString("base64url");
}
