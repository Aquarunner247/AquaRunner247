import Link from "next/link";
import { redirect } from "next/navigation";
import { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { AddUserFormFields } from "@/app/components/add-user-form-fields";
import { createUser, deleteStaffUser, deleteCustomerUser, updateUserRole } from "./actions";

type PageProps = {
  searchParams?: Promise<{ error?: string; tab?: string }>;
};

export default async function UsersPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const params = (await searchParams) ?? {};
  const tab = params.tab === "customers" ? "customers" : "staff";

  const [users, customers, customerUsers] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: appUser.organizationId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.customer.findMany({
      where: { organizationId: appUser.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.customerUser.findMany({
      where: { customer: { organizationId: appUser.organizationId } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, active: true, customer: { select: { id: true, name: true } } },
    }),
  ]);

  const tabClass = (target: string) => (target === tab ? "app-tab-active" : "app-tab");

  return (
    <main className="app-page-wide">
      <header className="app-page-head">
        <p className="app-kicker">Admin</p>
        <h1 className="app-h1">Users</h1>
        <p className="app-subhead">Add team members and customer portal logins, and manage their access.</p>
      </header>

      <div className="app-tabs mt-6">
        <Link href="/dashboard/users?tab=staff" className={tabClass("staff")}>
          Staff
        </Link>
        <Link href="/dashboard/users?tab=customers" className={tabClass("customers")}>
          Customers
        </Link>
      </div>

      {tab === "staff" ? (
        <>
          <section className="app-card-muted mt-4 text-sm">
            <p className="font-medium text-brand-ink">Roles</p>
            <dl className="mt-2 space-y-2">
              <div>
                <dt className="font-semibold text-brand-ink">Admin</dt>
                <dd className="text-brand-ink/70">
                  Full control — manage customers, properties, routes, chemicals, checklist templates, and team
                  member roles. Sees the office-wide dashboard, alerts, and reports. Can also be assigned stops on a
                  route like a technician.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-brand-ink">Office</dt>
                <dd className="text-brand-ink/70">
                  Can review and update any service visit — chemistry, doses, checklist, photos, issues — and the
                  day&rsquo;s schedule, but can&rsquo;t manage customers, routes, chemicals, or team members.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-brand-ink">Technician</dt>
                <dd className="text-brand-ink/70">
                  Sees and completes only the visits assigned to them for the day: chemistry readings, chemical
                  doses, equipment checks, photos, and issue reports.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-brand-ink">Customer</dt>
                <dd className="text-brand-ink/70">
                  Not a team-member role — a separate portal login (no access here) so a customer can see scheduled
                  service days, reports, photos, and documents. Add or manage one under the{" "}
                  <Link href="/dashboard/users?tab=customers" className="app-link">
                    Customers tab
                  </Link>{" "}
                  above, or by choosing Customer as the role in Add user below.
                </dd>
              </div>
            </dl>
          </section>

          <section className="app-card mt-4">
            <ul className="space-y-2">
              {users.map((u) => (
                <li key={u.id} className="app-card-inset flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-medium text-brand-ink">{u.name ?? u.email}</span>
                    <span className="ml-2 text-brand-ink/60">
                      {u.email}
                      {u.phone ? ` · ${u.phone}` : ""}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <form action={updateUserRole} className="flex items-center gap-1">
                      <input type="hidden" name="userId" value={u.id} />
                      <select key={u.role} name="role" defaultValue={u.role} className="app-field w-auto py-1 text-xs">
                        {Object.values(UserRole).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <button className="app-btn-secondary-sm" type="submit">
                        Save
                      </button>
                    </form>
                    <form action={deleteStaffUser}>
                      <input type="hidden" name="userId" value={u.id} />
                      <ConfirmSubmitButton
                        label="Delete"
                        confirmMessage={`Permanently delete ${u.name ?? u.email}? This also removes their login — they will no longer be able to sign in.`}
                        className="app-btn-danger-sm"
                      />
                    </form>
                  </div>
                </li>
              ))}
              {users.length === 0 ? <p className="app-card-inset text-sm text-brand-ink/60">No team members yet — add one below.</p> : null}
            </ul>

            <form action={createUser} className="app-card-inset mt-4">
              <p className="text-sm font-medium text-brand-ink">Add user</p>
              {params.error === "email-in-use" ? (
                <p className="mt-1 text-sm font-medium text-brand-danger">
                  That email already belongs to a different account — use a different email to add this user.
                </p>
              ) : null}
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <input name="name" required placeholder="Full name" className="app-field" />
                <input name="email" type="email" required placeholder="Email" className="app-field" />
                <AddUserFormFields customers={customers} />
                <input
                  name="password"
                  type="text"
                  required
                  minLength={8}
                  placeholder="Temporary password (min 8 characters)"
                  className="app-field md:col-span-2"
                />
              </div>
              <p className="mt-1 text-xs text-brand-ink/60">
                Share this password with the person directly — staff sign in at <code className="app-code">/login</code>,
                customers at <code className="app-code">/portal/login</code>; either should change it from their
                account settings.
              </p>
              <button className="app-btn-primary-sm mt-2" type="submit">
                Add user
              </button>
            </form>
          </section>
        </>
      ) : (
        <section className="app-card mt-4">
          <ul className="space-y-2">
            {customerUsers.map((cu) => (
              <li key={cu.id} className="app-card-inset flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium text-brand-ink">{cu.name ?? cu.email}</span>
                  <span className="ml-2 text-brand-ink/60">{cu.email}</span>
                  <span className="ml-2 text-brand-ink/60">
                    ·{" "}
                    <Link href={`/dashboard/customers/${cu.customer.id}`} className="app-link">
                      {cu.customer.name}
                    </Link>
                  </span>
                  {!cu.active ? <span className="app-pill-inactive ml-2">Inactive</span> : null}
                </span>
                <form action={deleteCustomerUser}>
                  <input type="hidden" name="customerUserId" value={cu.id} />
                  <ConfirmSubmitButton
                    label="Delete"
                    confirmMessage={`Remove portal access for ${cu.name ?? cu.email}? They will no longer be able to sign in.`}
                    className="app-btn-danger-sm"
                  />
                </form>
              </li>
            ))}
            {customerUsers.length === 0 ? (
              <p className="app-card-inset text-sm text-brand-ink/60">
                No customer portal logins yet — add one below, or from a customer&rsquo;s own page.
              </p>
            ) : null}
          </ul>

          <form action={createUser} className="app-card-inset mt-4">
            <input type="hidden" name="role" value="CUSTOMER" />
            <p className="text-sm font-medium text-brand-ink">Add customer login</p>
            {params.error === "email-in-use" ? (
              <p className="mt-1 text-sm font-medium text-brand-danger">
                That email already belongs to a different account — use a different email to add this login.
              </p>
            ) : null}
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <input name="name" required placeholder="Contact name" className="app-field" />
              <input name="email" type="email" required placeholder="Email" className="app-field" />
              <select name="customerId" required defaultValue="" className="app-field md:col-span-2">
                <option value="" disabled>
                  {customers.length ? "Select customer account" : "No customers yet — add one under Customers first"}
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                name="password"
                type="text"
                required
                minLength={8}
                placeholder="Temporary password (min 8 characters)"
                className="app-field md:col-span-2"
              />
            </div>
            <p className="mt-1 text-xs text-brand-ink/60">
              Share this password with the customer directly — they can sign in at{" "}
              <code className="app-code">/portal/login</code>.
            </p>
            <button className="app-btn-primary-sm mt-2" type="submit">
              Add customer login
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
