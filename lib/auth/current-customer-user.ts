import { createClient } from "@/lib/supabase/server";
import { getCustomerUserForAuthUser, getCustomerPortalAccessState, type CustomerPortalAccessState } from "@/lib/auth/customer-user";

export async function getCurrentCustomerUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;
  try {
    const customerUser = await getCustomerUserForAuthUser(user);
    if (!customerUser || !customerUser.active) return null;
    return customerUser;
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("[AquaRunner] getCurrentCustomerUser DB error:", e);
    }
    return null;
  }
}

/** Richer than getCurrentCustomerUser -- also distinguishes "blocked, needs to subscribe"
 * from "already converted to their own org" so app/portal/(app)/layout.tsx can route each
 * case correctly instead of collapsing everything into one generic "no access" redirect. */
export async function getCurrentCustomerPortalAccessState(): Promise<CustomerPortalAccessState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "none" };
  try {
    return await getCustomerPortalAccessState(user);
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("[AquaRunner] getCurrentCustomerPortalAccessState DB error:", e);
    }
    return { status: "none" };
  }
}
