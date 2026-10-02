"use server";

import { revalidatePath } from "next/cache";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";
import { uploadDocumentForCustomer, deleteDocumentForCustomer } from "@/lib/customer-documents";

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
