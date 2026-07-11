import { createClient } from "@/lib/supabase/server";
import { getCustomerUserForAuthUser } from "@/lib/auth/customer-user";

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
