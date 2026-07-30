"use client";

import { useId, useState } from "react";
import styles from "../../landing.module.css";
import type { WaitlistResult } from "../../api/waitlist/route";

type Status = "idle" | "submitting" | "ok" | "duplicate" | "failed";

export function WaitlistForm({
  label,
  tone = "light",
  submitLabel = "Join the waitlist",
}: {
  label: string;
  tone?: "light" | "dark";
  submitLabel?: string;
}) {
  const uid = useId();
  const emailId = `${uid}-email`;
  const noteId = `${uid}-note`;
  const errorId = `${uid}-error`;

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const submitting = status === "submitting";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError(null);

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result: WaitlistResult = await response.json();

      if (result.status === "ok" || result.status === "duplicate") {
        setStatus(result.status);
        return;
      }
      setStatus("failed");
      setError(result.message);
    } catch {
      setStatus("failed");
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  if (status === "ok" || status === "duplicate") {
    return (
      <div className={`${styles.formOk} ${tone === "dark" ? styles.onDark : ""}`} role="status">
        <strong>{status === "duplicate" ? "You're already on the list." : "You're on the list."}</strong>
        <p>
          {status === "duplicate"
            ? "We have this address already — no need to sign up twice. We'll email you when AquaRunner is ready."
            : "We'll email you when AquaRunner is ready for you — early access and founding-customer pricing at launch."}
        </p>
      </div>
    );
  }

  return (
    <form className={`${styles.form} ${tone === "dark" ? styles.onDark : ""}`} onSubmit={onSubmit} noValidate>
      <label htmlFor={emailId}>{label}</label>
      <div className={styles.formRow}>
        <input
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@yourpoolcompany.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-describedby={`${noteId}${error ? ` ${errorId}` : ""}`}
          aria-invalid={error ? true : undefined}
          disabled={submitting}
          required
        />
        <button className={styles.btn} type="submit" disabled={submitting}>
          {submitting ? "Adding you…" : submitLabel}
        </button>
      </div>
      <p className={styles.formError} id={errorId} role="alert">
        {error}
      </p>
      <p className={styles.formNote} id={noteId}>
        No spam. Just a note when we&rsquo;re ready for you.
      </p>
    </form>
  );
}
