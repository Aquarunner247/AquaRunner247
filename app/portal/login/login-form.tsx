"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function PortalLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // Read the submitted values straight from the form's own FormData rather than the
    // `email`/`password` state -- some browsers/password managers fill the fields at the
    // DOM level without firing the input's change event, leaving React state empty even
    // though the field looks filled in. FormData always reflects the actual DOM value.
    const formData = new FormData(e.currentTarget);
    const submittedEmail = String(formData.get("email") ?? "").trim();
    const submittedPassword = String(formData.get("password") ?? "");
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({ email: submittedEmail, password: submittedPassword });
    setLoading(false);
    if (signError) {
      setError(signError.message);
      return;
    }
    window.location.href = "/portal";
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-brand-ink">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-brand-control px-3 py-2 text-base text-brand-ink shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-brand-ink">
        <span className="flex items-center justify-between">
          Password
          <Link href="/forgot-password" className="text-xs font-medium text-brand-primary underline">
            Forgot password?
          </Link>
        </span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-brand-control px-3 py-2 text-base text-brand-ink shadow-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
        />
      </label>
      {error ? <p className="text-sm text-brand-danger">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-brand-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-ink disabled:opacity-60"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
