import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage() {
  // Requires the recovery session /auth/callback just exchanged the code into -- landing
  // here without one (expired/already-used link, or direct navigation) means there's
  // nothing to reset yet, so send back to request a fresh link rather than show a form
  // that will just fail on submit.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password?error=expired");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-brand-primary">AquaRunner 24/7 Pro</p>
        <h1 className="mt-2 text-2xl font-semibold text-brand-ink">Set a new password</h1>
      </div>
      <ResetPasswordForm />
    </main>
  );
}
