"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }

    // Sign out the recovery session so the user re-authenticates with the new password --
    // avoids ambiguity over whether this account is staff or customer-portal (they share
    // one Supabase Auth pool) by just sending everyone back through a normal sign-in.
    await supabase.auth.signOut();
    window.location.href = "/login?reset=success";
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-brand-ink">
        New password
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-brand-control px-3 py-2 text-base text-brand-ink shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-brand-ink">
        Confirm new password
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="rounded-md border border-brand-control px-3 py-2 text-base text-brand-ink shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
        />
      </label>
      {error ? <p className="text-sm text-brand-danger">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-brand-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-ink disabled:opacity-60"
      >
        {loading ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
