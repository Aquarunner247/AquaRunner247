import Link from "next/link";
import { redirect } from "next/navigation";
import { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { ConfirmSubmitButton } from "@/app/components/confirm-submit-button";
import { createTechnician, deleteTechnician, updateUserRole } from "./actions";

type PageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function TechniciansPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const params = (await searchParams) ?? {};

  const users = await prisma.user.findMany({
    where: { organizationId: appUser.organizationId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="app-page-wide">
      <header className="app-page-head">
        <p className="app-kicker">Admin</p>
        <h1 className="app-h1">Technicians</h1>
        <p className="app-subhead">Add team members and manage their access.</p>
      </header>

      <section className="app-card-muted mt-6 text-sm">
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
              Not a team-member role — customers get their own separate portal login (no access here) to see
              scheduled service days, reports, photos, and documents. Add or remove a customer&rsquo;s portal
              login from their page under{" "}
              <Link href="/dashboard/customers" className="app-link">
                Customers
              </Link>
              .
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
                <form action={deleteTechnician}>
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

        <form action={createTechnician} className="app-card-inset mt-4">
          <p className="text-sm font-medium text-brand-ink">Add technician</p>
          {params.error === "email-in-use" ? (
            <p className="mt-1 text-sm font-medium text-brand-danger">
              That email already belongs to a different company&rsquo;s account — use a different email to add this technician.
            </p>
          ) : null}
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <input name="name" required placeholder="Full name" className="app-field" />
            <input name="email" type="email" required placeholder="Email" className="app-field" />
            <input name="phone" placeholder="Phone" className="app-field" />
            <select name="role" defaultValue="TECHNICIAN" className="app-field">
              {Object.values(UserRole).map((r) => (
                <option key={r} value={r}>
                  {r}
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
            Share this password with the technician directly — they can sign in at{" "}
            <code className="app-code">/login</code> and should change it from their account settings.
          </p>
          <button className="app-btn-primary-sm mt-2" type="submit">
            Add technician
          </button>
        </form>
      </section>
    </main>
  );
}
