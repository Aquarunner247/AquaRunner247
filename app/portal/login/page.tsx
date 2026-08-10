import { redirect } from "next/navigation";
import { getCurrentCustomerUser } from "@/lib/auth/current-customer-user";
import { PortalLoginForm } from "./login-form";

type PageProps = {
  searchParams?: Promise<{ error?: string; reset?: string }>;
};

export default async function PortalLoginPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};

  const customerUser = await getCurrentCustomerUser();
  if (customerUser) redirect("/portal");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-brand-primary">AquaRunner 24/7 Pro</p>
        <h1 className="mt-2 text-2xl font-semibold text-brand-ink">Customer Portal</h1>
        <p className="mt-2 text-sm text-brand-muted">
          Sign in to see your scheduled service days, reports, and documents.
        </p>
        {params.error === "no-access" ? (
          <p className="mt-3 text-sm text-brand-danger">That account doesn&rsquo;t have customer portal access.</p>
        ) : null}
        {params.reset === "success" ? (
          <p className="mt-3 text-sm text-brand-ok">Password updated — sign in with your new password.</p>
        ) : null}
      </div>
      <PortalLoginForm />
    </main>
  );
}
