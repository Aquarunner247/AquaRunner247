"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { hasStaffAccess } from "./actions";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPortalLink, setShowPortalLink] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setShowPortalLink(false);
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
    if (signError) {
      setLoading(false);
      setError(signError.message);
      return;
    }
    // Valid credentials alone don't mean this is a staff account -- staff and
    // customer-portal users share one Supabase Auth pool. Reject and sign back out
    // immediately rather than leaving a half-logged-in session where the nav shows
    // "signed in" but no /dashboard page actually works.
    const staffAccess = await hasStaffAccess();
    if (!staffAccess) {
      await supabase.auth.signOut();
      setLoading(false);
      setError("That account doesn't have staff access. Customers should sign in at the customer portal instead.");
      setShowPortalLink(true);
      return;
    }
    setLoading(false);
    window.location.href = "/dashboard";
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
      {error ? (
        <p className="text-sm text-brand-danger">
          {error}
          {showPortalLink ? (
            <>
              {" "}
              <Link href="/portal/login" className="font-medium underline">
                Go to customer portal login
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
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
