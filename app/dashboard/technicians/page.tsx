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
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#12234A]">Admin</p>
        <h1 className="text-2xl font-semibold text-slate-900">Technicians</h1>
        <p className="mt-1 text-sm text-slate-500">Add team members and manage their access.</p>
      </header>

      <section className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <p className="font-medium text-slate-900">Roles</p>
        <dl className="mt-2 space-y-2">
          <div>
            <dt className="font-semibold text-slate-800">Admin</dt>
            <dd className="text-slate-600">
              Full control — manage customers, properties, routes, chemicals, checklist templates, and team
              member roles. Sees the office-wide dashboard, alerts, and reports. Can also be assigned stops on a
              route like a technician.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">Office</dt>
            <dd className="text-slate-600">
              Can review and update any service visit — chemistry, doses, checklist, photos, issues — and the
              day&rsquo;s schedule, but can&rsquo;t manage customers, routes, chemicals, or team members.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">Technician</dt>
            <dd className="text-slate-600">
              Sees and completes only the visits assigned to them for the day: chemistry readings, chemical
              doses, equipment checks, photos, and issue reports.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-800">Customer</dt>
            <dd className="text-slate-600">
              Not a team-member role — customers get their own separate portal login (no access here) to see
              scheduled service days, reports, photos, and documents. Add or remove a customer&rsquo;s portal
              login from their page under{" "}
              <Link href="/dashboard/customers" className="underline">
                Customers
              </Link>
              .
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium text-slate-900">{u.name ?? u.email}</span>
                <span className="ml-2 text-slate-500">
                  {u.email}
                  {u.phone ? ` · ${u.phone}` : ""}
                </span>
              </span>
              <div className="flex items-center gap-2">
                <form action={updateUserRole} className="flex items-center gap-1">
                  <input type="hidden" name="userId" value={u.id} />
                  <select
                    key={u.role}
                    name="role"
                    defaultValue={u.role}
                    className="rounded border border-slate-300 px-1.5 py-1 text-xs"
                  >
                    {Object.values(UserRole).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100" type="submit">
                    Save
                  </button>
                </form>
                <form action={deleteTechnician}>
                  <input type="hidden" name="userId" value={u.id} />
                  <ConfirmSubmitButton
                    label="🗑"
                    confirmMessage={`Permanently delete ${u.name ?? u.email}? This also removes their login — they will no longer be able to sign in.`}
                    className="rounded px-2 py-1 text-base hover:bg-slate-200"
                  />
                </form>
              </div>
            </li>
          ))}
          {users.length === 0 ? <p className="text-sm text-slate-500">No team members yet.</p> : null}
        </ul>

        <form action={createTechnician} className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-900">Add technician</p>
          {params.error === "email-in-use" ? (
            <p className="mt-1 text-sm text-red-600">That email already belongs to a different company&rsquo;s account.</p>
          ) : null}
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <input name="name" required placeholder="Full name" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="email" type="email" required placeholder="Email" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
            <input name="phone" placeholder="Phone" className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
            <select name="role" defaultValue="TECHNICIAN" className="rounded border border-slate-300 px-2 py-1.5 text-sm">
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
              className="rounded border border-slate-300 px-2 py-1.5 text-sm md:col-span-2"
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Share this password with the technician directly — they can sign in at{" "}
            <code className="rounded bg-slate-200 px-1">/login</code> and should change it from their account settings.
          </p>
          <button className="mt-2 rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
            Add technician
          </button>
        </form>
      </section>
    </main>
  );
}
