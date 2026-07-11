"use server";

import { revalidatePath } from "next/cache";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";
import { uploadDocumentForCustomer, deleteDocumentForCustomer } from "@/lib/customer-documents";

export async function uploadDocumentAsCustomer(formData: FormData) {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) return;

  await uploadDocumentForCustomer(customerUser.customerId, formData);
  revalidatePath("/portal/documents");
}

export async function deleteDocumentAsCustomer(formData: FormData) {
  const customerUser = await getCurrentCustomerUser();
  if (!customerUser) return;

  const documentId = String(formData.get("documentId") ?? "").trim();
  if (!documentId) return;

  await deleteDocumentForCustomer(customerUser.customerId, documentId);
  revalidatePath("/portal/documents");
}
