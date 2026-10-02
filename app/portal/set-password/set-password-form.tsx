"use client";

import { useState, useTransition } from "react";
import { setPortalPassword } from "./actions";

export function SetPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    // The action redirects to /portal on success, so there is nothing to handle for the happy path --
    // only a returned message means it did not go through.
    startTransition(async () => {
      const result = await setPortalPassword(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-brand-ink">
        New password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          autoFocus
          className="app-field"
        />
        <span className="text-xs font-normal text-brand-muted">At least 8 characters.</span>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-brand-ink">
        Confirm new password
        <input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} className="app-field" />
      </label>
      {error ? (
        <p className="text-sm text-brand-danger" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="app-btn-primary min-h-[44px]">
        {pending ? "Saving…" : "Save password and continue"}
      </button>
    </form>
  );
}
