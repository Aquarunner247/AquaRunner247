import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/app/dashboard/actions";

export default async function MorePage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const organization = await prisma.organization.findUnique({ where: { id: appUser.organizationId }, select: { name: true } });

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-6 pb-24">
      <h1 className="font-[family-name:var(--font-display)] text-xl font-bold uppercase tracking-wide text-[#12234A]">More</h1>

      <section className="mt-4 rounded-lg border border-[#C9E3EC] bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#4A6572]">Signed in as</p>
        <p className="mt-1 text-base font-bold text-[#12234A]">{appUser.name ?? appUser.email}</p>
        <p className="text-sm text-[#4A6572]">{appUser.email}</p>
        {organization?.name ? <p className="mt-2 text-xs text-[#94A3B8]">{organization.name}</p> : null}
      </section>

      <form action={signOut} className="mt-4">
        <button type="submit" className="w-full rounded-lg border border-[#C9E3EC] bg-white px-4 py-2.5 text-sm font-semibold text-[#12234A] shadow-sm">
          Sign out
        </button>
      </form>
    </main>
  );
}
