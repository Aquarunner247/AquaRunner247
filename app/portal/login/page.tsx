import { redirect } from "next/navigation";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";
import { PortalLoginForm } from "./login-form";

type PageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function PortalLoginPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};

  const customerUser = await getCurrentCustomerUser();
  if (customerUser) redirect("/portal");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-[#0A5FA4]">AquaRunner 24/7 Pro</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Customer Portal</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to see your scheduled service days, reports, and documents.
        </p>
        {params.error === "no-access" ? (
          <p className="mt-3 text-sm text-red-600">That account doesn&rsquo;t have customer portal access.</p>
        ) : null}
      </div>
      <PortalLoginForm />
    </main>
  );
}
