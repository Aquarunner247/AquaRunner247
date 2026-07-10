import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { openBillingPortal } from "../actions";

export default async function BillingExpiredPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-[#0A5FA4]">AquaRunner 24/7 Pro</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Subscription ended</h1>
      {appUser.role === "ADMIN" ? (
        <>
          <p className="mt-2 text-sm text-slate-600">
            Your subscription has ended. Reactivate to regain access to your dashboard.
          </p>
          <form action={openBillingPortal} className="mt-6">
            <button
              type="submit"
              className="rounded-md bg-[#0A5FA4] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#12234A]"
            >
              Reactivate billing
            </button>
          </form>
        </>
      ) : (
        <p className="mt-2 text-sm text-slate-600">
          Your company&rsquo;s subscription has ended. Contact your company admin to reactivate access.
        </p>
      )}
    </main>
  );
}
