"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { createOrFindAuthUser, createSupabaseAdminClient } from "@/lib/supabase/admin";

/** UI-only value for the "Add user" role select -- not part of the Prisma UserRole enum,
 * since a customer portal login is a CustomerUser row, not a staff User row with a role. */
const CUSTOMER_ROLE_VALUE = "CUSTOMER";

async function requireAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");
  return appUser;
}

/**
 * Single entry point for the "Add user" form -- branches on the selected role. CUSTOMER
 * creates a CustomerUser (portal login) attached to an existing Customer; every other
 * role creates a staff User the same way this always worked. Kept as one action so the
 * form only needs one role dropdown with one extra conditional field (see
 * AddUserFormFields), rather than two separate forms for two different flows.
 */
export async function createUser(formData: FormData) {
  const appUser = await requireAdmin();
  const roleRaw = String(formData.get("role") ?? "").trim();

  if (roleRaw === CUSTOMER_ROLE_VALUE) {
    await createCustomerUserForOrg(appUser, formData);
    return;
  }
  await createStaffUserForOrg(appUser, formData, roleRaw);
}

async function createStaffUserForOrg(appUser: { organizationId: string }, formData: FormData, roleRaw: string) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  if (!name || !email || !password) return;
  if (password.length < 8) return;

  const role = (Object.values(UserRole) as string[]).includes(roleRaw) ? (roleRaw as UserRole) : UserRole.TECHNICIAN;

  // A staff login and a customer-portal login are separate tables, but both draw from the
  // same Supabase Auth email pool -- check both so we never silently clobber someone else's
  // account (same class of check as createCustomerUserForOrg below).
  const [existingStaffUser, existingCustomerUser] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.customerUser.findUnique({ where: { email } }),
  ]);
  if (existingCustomerUser) {
    redirect("/dashboard/users?error=email-in-use");
  }
  if (existingStaffUser && existingStaffUser.organizationId !== appUser.organizationId) {
    redirect("/dashboard/users?error=email-in-use");
  }

  const authUserId = await createOrFindAuthUser(email, password);

  if (existingStaffUser) {
    await prisma.user.update({
      where: { id: existingStaffUser.id },
      data: { authUserId, name, phone: phone || null, role, active: true },
    });
  } else {
    await prisma.user.create({
      data: {
        organizationId: appUser.organizationId,
        authUserId,
        email,
        name,
        phone: phone || null,
        role,
        active: true,
      },
    });
  }

  revalidatePath("/dashboard/users");
}

async function createCustomerUserForOrg(appUser: { organizationId: string }, formData: FormData) {
  const customerId = String(formData.get("customerId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "").trim();
  if (!customerId || !name || !email || !password) return;
  if (password.length < 8) return;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: appUser.organizationId },
    select: { id: true },
  });
  if (!customer) return;

  const [existingStaffUser, existingCustomerUser] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.customerUser.findUnique({ where: { email } }),
  ]);
  if (existingStaffUser) {
    redirect("/dashboard/users?error=email-in-use");
  }
  if (existingCustomerUser && existingCustomerUser.customerId !== customerId) {
    redirect("/dashboard/users?error=email-in-use");
  }

  const authUserId = await createOrFindAuthUser(email, password);

  if (existingCustomerUser) {
    await prisma.customerUser.update({
      where: { id: existingCustomerUser.id },
      data: { authUserId, name, active: true },
    });
  } else {
    await prisma.customerUser.create({
      data: { customerId, authUserId, email, name, active: true },
    });
  }

  revalidatePath("/dashboard/users");
  revalidatePath(`/dashboard/customers/${customerId}`);
}

export async function updateUserRole(formData: FormData) {
  const appUser = await requireAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "").trim();
  if (!userId || !(Object.values(UserRole) as string[]).includes(roleRaw)) return;
  const role = roleRaw as UserRole;

  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: appUser.organizationId },
  });
  if (!target) return;

  if (target.role === "ADMIN" && role !== "ADMIN") {
    const otherAdmins = await prisma.user.count({
      where: { organizationId: appUser.organizationId, role: "ADMIN", id: { not: userId } },
    });
    if (otherAdmins === 0) return;
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/dashboard/users");
}

export async function deleteStaffUser(formData: FormData) {
  const appUser = await requireAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return;

  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId: appUser.organizationId },
    select: { id: true, authUserId: true },
  });
  if (!user) return;

  await prisma.user.delete({ where: { id: user.id } });

  // Best-effort: also remove their Supabase Auth login so they can't sign in anymore.
  if (user.authUserId) {
    try {
      const supabaseAdmin = createSupabaseAdminClient();
      await supabaseAdmin.auth.admin.deleteUser(user.authUserId);
    } catch {
      // Non-critical — the app profile is gone either way; auth cleanup can be done manually if needed.
    }
  }

  revalidatePath("/dashboard/users");
}

/** Deletes a customer-portal login from the Users page's Customers tab -- scoped by
 * organization through the Customer join, since CustomerUser has no organizationId of
 * its own. Mirrors deleteCustomerLogin in app/dashboard/customers/[id]/actions.ts, kept
 * as a separate action here so it revalidates /dashboard/users rather than a specific
 * customer's own page. */
export async function deleteCustomerUser(formData: FormData) {
  const appUser = await requireAdmin();
  const customerUserId = String(formData.get("customerUserId") ?? "").trim();
  if (!customerUserId) return;

  const customerUser = await prisma.customerUser.findFirst({
    where: { id: customerUserId, customer: { organizationId: appUser.organizationId } },
    select: { id: true, authUserId: true, customerId: true },
  });
  if (!customerUser) return;

  await prisma.customerUser.delete({ where: { id: customerUser.id } });

  if (customerUser.authUserId) {
    try {
      const supabaseAdmin = createSupabaseAdminClient();
      await supabaseAdmin.auth.admin.deleteUser(customerUser.authUserId);
    } catch {
      // Non-critical — the portal login row is gone either way.
    }
  }

  revalidatePath("/dashboard/users");
  revalidatePath(`/dashboard/customers/${customerUser.customerId}`);
}
