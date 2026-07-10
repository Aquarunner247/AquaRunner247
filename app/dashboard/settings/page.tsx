import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { updateBusinessIdentity } from "./actions";

export default async function SettingsPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const organization = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { businessName: true, businessPhone: true },
  });

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#12234A]">Admin</p>
        <h1 className="text-2xl font-semibold text-slate-900">Company settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          This business name and phone show on your public QR/inspector-log pages and CSV exports — the
          information your own customers and inspectors see.
        </p>
      </header>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <form action={updateBusinessIdentity} className="space-y-3">
          <label className="block text-sm">
            <span className="text-slate-700">Business name</span>
            <input
              name="businessName"
              defaultValue={organization?.businessName ?? ""}
              placeholder="Your Pool Service LLC"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-700">Business phone</span>
            <input
              name="businessPhone"
              defaultValue={organization?.businessPhone ?? ""}
              placeholder="702-555-0100"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button className="rounded bg-[#0A5FA4] px-3 py-1.5 text-sm font-medium text-white" type="submit">
            Save
          </button>
        </form>
      </section>
    </main>
  );
}
