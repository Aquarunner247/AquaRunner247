import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { prisma } from "@/lib/prisma";
import { PLAN_TIER_USER_LIMITS } from "@/lib/plan-tiers";
import { NameInput } from "@/app/components/name-input";
import { PhoneInput } from "@/app/components/phone-input";
import { createCpoUser } from "@/app/cpo/actions";

type PageProps = {
  searchParams?: Promise<{ error?: string }>;
};

const ERROR_MESSAGES: Record<string, string> = {
  "email-in-use": "That email already belongs to a different account — use a different email to add this user.",
  "user-limit": "You've reached this plan's 2-seat limit.",
};

export default async function CpoUsersPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const params = (await searchParams) ?? {};
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] ?? "Something went wrong." : null;

  const users = await prisma.user.findMany({
    where: { organizationId: appUser.organizationId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true },
  });

  const seatLimit = PLAN_TIER_USER_LIMITS.COMPLIANCE;
  const atLimit = seatLimit != null && users.length >= seatLimit;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10">
      <header className="border-b border-brand-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink">AquaRunner Compliance</p>
        <h1 className="text-2xl font-semibold text-brand-ink">Users</h1>
        <p className="mt-1 text-sm text-brand-muted">
          {users.length} of {seatLimit} seats used.
        </p>
      </header>

      <section className="mt-6 space-y-2">
        {users.map((u) => (
          <div key={u.id} className="app-card-inset flex items-center justify-between gap-2">
            <span className="text-sm text-brand-ink">{u.name ?? u.email}</span>
            <span className="text-xs text-brand-muted">{u.email}</span>
          </div>
        ))}
      </section>

      {atLimit ? (
        <p className="app-card-inset mt-6 text-sm text-brand-muted">
          You&rsquo;ve used both seats included with AquaRunner Compliance.
        </p>
      ) : (
        <section className="app-card mt-6">
          <h2 className="font-display text-base font-semibold text-brand-ink">Add a user</h2>
          {errorMessage ? <p className="mt-2 text-sm font-medium text-brand-danger">{errorMessage}</p> : null}
          <form action={createCpoUser} className="mt-3 grid gap-3">
            <input type="hidden" name="role" value="ADMIN" />
            <input type="hidden" name="redirectBasePath" value="/cpo/users" />
            <NameInput name="name" required placeholder="Full name" className="app-field" />
            <input name="email" type="email" required placeholder="Email" className="app-field" />
            <PhoneInput name="phone" placeholder="Phone (optional)" className="app-field" />
            <input name="password" type="password" required minLength={8} placeholder="Password" className="app-field" />
            <button type="submit" className="app-btn-primary-sm justify-self-start">
              Add user
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
