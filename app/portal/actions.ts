"use server";

import { revalidatePath } from "next/cache";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";
import { uploadDocumentForCustomer, deleteDocumentForCustomer } from "@/lib/customer-documents";
import { deletePortalAccount } from "@/lib/portal-account-deletion";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * The portal's layout redirects a login still holding its emailed temporary password to
 * /portal/set-password, but a layout only governs what it renders -- a server action can be invoked
 * without ever loading the page that normally triggers it. So each action re-checks, the same way
 * each one re-checks the session rather than trusting the page that called it.
 */
function mustSetPasswordFirst(customerUser: { mustChangePassword: boolean }): boolean {
  return customerUser.mustChangePassword;
}

export async function uploadDocumentAsCustomer(formData: FormData) {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) return;
  if (mustSetPasswordFirst(customerUser)) return;

  await uploadDocumentForCustomer(customerUser.customerId, formData);
  revalidatePath("/portal/documents");
}

export async function deleteDocumentAsCustomer(formData: FormData) {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) return;
  if (mustSetPasswordFirst(customerUser)) return;

  const documentId = String(formData.get("documentId") ?? "").trim();
  if (!documentId) return;

  await deleteDocumentForCustomer(customerUser.customerId, documentId);
  revalidatePath("/portal/documents");
}

/**
 * Deletes the signed-in End Customer's own portal login.
 *
 * Their login only -- not the pool company's records of their pool, which belong to the company
 * and are covered by Privacy Policy Section 11. See lib/portal-account-deletion.ts.
 *
 * Unlike the other actions here, this one does NOT bail on mustChangePassword. Somebody who
 * never wants to use the portal should not have to set a password first in order to delete the
 * login they are rejecting.
 */
export async function deletePortalAccountAction(formData: FormData) {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) redirect("/portal/login");

  const typed = String(formData.get("confirmEmail") ?? "");
  const result = await deletePortalAccount(customerUser.id, typed);

  if (!result.ok) {
    redirect(`/portal/account?error=${result.reason}`);
  }

  // The identity behind this session is gone; clear the cookie so the next request does not
  // resolve to a login that no longer exists.
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch (err) {
    console.error("[portal] sign-out after account deletion failed:", err);
  }

  redirect("/portal/login?deleted=1");
}
