import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

type PageProps = {
  searchParams?: Promise<{ portal?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  // Requires the recovery session /auth/callback just exchanged the code into -- landing
  // here without one (expired/already-used link, or direct navigation) means there's
  // nothing to reset yet, so send back to request a fresh link rather than show a form
  // that will just fail on submit.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password?error=expired");

  // Set by the customer welcome email's recovery link (lib/mail/send-welcome-email.ts) --
  // staff and customer-portal accounts share one Supabase Auth pool with no other way to
  // tell them apart here, so this flag is how the form knows to send a customer back to
  // /portal/login instead of the staff /login page after setting their password.
  const sp = (await searchParams) ?? {};
  const isPortal = sp.portal === "1";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-brand-primary">AquaRunner 24/7 Pro</p>
        <h1 className="mt-2 text-2xl font-semibold text-brand-ink">Set a new password</h1>
      </div>
      <ResetPasswordForm portal={isPortal} />
    </main>
  );
}
