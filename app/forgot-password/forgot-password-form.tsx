"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * `portal` carries through to where the customer lands AFTER setting the password. Without it a portal
 * customer who resets is dropped on the staff /login, which rejects their credentials -- the same wrong
 * destination the welcome link used to produce, reached a different way.
 */
export function ForgotPasswordForm({ portal = false }: { portal?: boolean }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      // Still /auth/callback and still a `code`: this flow starts in the browser, so the PKCE verifier
      // exists and the exchange works. Only the admin-generated welcome link needs /auth/confirm.
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        portal ? "/reset-password?portal=1" : "/reset-password",
      )}`,
    });
    setLoading(false);
    // Show the same success state regardless of outcome -- never reveal whether an email
    // has an account. resetError only ever surfaces things like rate limiting here, since
    // Supabase itself doesn't report "email not found" for this call.
    if (resetError) {
      setError("Something went wrong. Try again in a moment.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="mt-8 rounded-md border border-brand-border bg-brand-surface px-4 py-3 text-sm text-brand-ink">
        If an account exists for <span className="font-medium">{email}</span>, a password reset link is on its way.
        Check your inbox (and spam folder).
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-brand-ink">
        Email
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-brand-control px-3 py-2 text-base text-brand-ink shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
        />
      </label>
      {error ? <p className="text-sm text-brand-danger">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-brand-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-ink disabled:opacity-60"
      >
        {loading ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
