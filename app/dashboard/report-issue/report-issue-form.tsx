"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type VisitOption = { id: string; label: string; timeLabel: string };

export function ReportIssueForm({ visits }: { visits: VisitOption[] }) {
  const router = useRouter();
  const [visitId, setVisitId] = useState(visits[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!visitId || !description.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/visits/${visitId}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim(), severity }),
      });
      if (!response.ok) throw new Error("Couldn't submit — try again.");
      setDone(true);
      setTimeout(() => router.push("/dashboard"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (visits.length === 0) {
    return (
      <p className="rounded-lg border border-brand-border bg-white p-4 text-sm text-brand-muted">
        No stops on today&rsquo;s schedule to attach an issue to yet.
      </p>
    );
  }

  if (done) {
    return (
      <p className="rounded-lg border border-brand-ok bg-brand-okFill p-4 text-sm font-medium text-brand-ok">
        Issue reported — taking you back to the dashboard…
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-brand-border bg-white p-4 shadow-sm">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Which stop is this about?</label>
        <select
          value={visitId}
          onChange={(e) => setVisitId(e.target.value)}
          className="mt-1 w-full rounded border border-brand-border bg-white px-3 py-2 text-sm text-brand-ink"
        >
          {visits.map((v) => (
            <option key={v.id} value={v.id}>
              {v.timeLabel} — {v.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-brand-muted">What&rsquo;s going on?</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={4}
          placeholder="e.g. Pump making a grinding noise, filter pressure reading high…"
          className="mt-1 w-full rounded border border-brand-border bg-white px-3 py-2 text-sm text-brand-ink"
        />
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Severity</label>
        <div className="mt-1 flex gap-2">
          {(["LOW", "MEDIUM", "HIGH"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverity(s)}
              className={`flex-1 rounded border px-3 py-2 text-sm font-medium ${
                severity === s ? "border-brand-primary bg-brand-primary text-white" : "border-brand-border bg-white text-brand-ink"
              }`}
            >
              {s === "LOW" ? "Low" : s === "MEDIUM" ? "Medium" : "High"}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-brand-danger">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting || !description.trim()}
        className="w-full rounded bg-brand-cta px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Report issue"}
      </button>
    </form>
  );
}
