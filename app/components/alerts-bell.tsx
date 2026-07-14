"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export type ClosureHazardItem = {
  id: string;
  property: string;
  body: string;
  completedAtLabel: string | null;
  issues: string[];
};

export type ReportedIssueItem = {
  id: string;
  severity: string;
  description: string;
  visitId: string;
  visitLabel: string;
  techLabel: string;
  createdAtLabel: string;
};

export type OverdueVisitItem = {
  id: string;
  property: string;
  body: string;
  tech: string;
  dueLabel: string;
};

export type OutOfRangeItem = {
  id: string;
  property: string;
  body: string;
  completedAtLabel: string | null;
  issues: string[];
};

type AlertsBellProps = {
  closureHazardReadings: ClosureHazardItem[];
  reportedIssues: ReportedIssueItem[];
  overdueVisits: OverdueVisitItem[];
  outOfRangeReadings: OutOfRangeItem[];
  resolveIssue: (formData: FormData) => void | Promise<void>;
};

function BellIcon({ ringing }: { ringing: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`h-5 w-5 ${ringing ? "text-red-600" : "text-slate-500"}`}
    >
      <path
        d="M12 3a5 5 0 0 0-5 5v2.6c0 .6-.2 1.2-.6 1.7L5 14.5c-.7.9-.1 2.2 1 2.2h12c1.1 0 1.7-1.3 1-2.2l-1.4-2.2a2.7 2.7 0 0 1-.6-1.7V8a5 5 0 0 0-5-5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M9.5 19a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function AlertsBell({
  closureHazardReadings,
  reportedIssues,
  overdueVisits,
  outOfRangeReadings,
  resolveIssue,
}: AlertsBellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalCount =
    closureHazardReadings.length + reportedIssues.length + overdueVisits.length + outOfRangeReadings.length;
  const hasHazard = closureHazardReadings.length > 0;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Alerts (${totalCount})`}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm hover:bg-slate-50"
      >
        <BellIcon ringing={totalCount > 0} />
        {totalCount > 0 ? (
          <span
            className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold text-white ${
              hasHazard ? "bg-red-700" : "bg-rose-600"
            }`}
          >
            {totalCount > 99 ? "99+" : totalCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 max-h-[70vh] w-[min(90vw,420px)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          {totalCount === 0 ? (
            <p className="p-3 text-sm text-slate-500">No alerts right now.</p>
          ) : (
            <div className="space-y-3">
              {closureHazardReadings.length > 0 ? (
                <div className="rounded-lg border-2 border-red-700 bg-red-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-red-800">
                    ⚠ Imminent health hazard — closure risk ($909 reopening fee)
                  </p>
                  <ul className="mt-2 space-y-1">
                    {closureHazardReadings.map((r) => (
                      <li key={r.id} className="text-sm font-medium text-red-900">
                        {r.property} — {r.body}: {r.issues.join(", ")}
                        {r.completedAtLabel ? ` (${r.completedAtLabel})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {reportedIssues.length > 0 ? (
                <div className="rounded-lg border border-[#FF6B5B]/40 bg-[#FF6B5B]/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#B54B3D]">Reported issues</p>
                  <ul className="mt-2 space-y-2">
                    {reportedIssues.map((issue) => (
                      <li
                        key={issue.id}
                        className="flex flex-wrap items-start justify-between gap-2 rounded border border-[#FF6B5B]/30 bg-white px-3 py-2 text-sm"
                      >
                        <div>
                          <span className="text-xs font-semibold uppercase text-[#FF6B5B]">{issue.severity}</span>{" "}
                          <Link href={`/dashboard/visits/${issue.visitId}`} className="font-medium text-[#12234A] underline" onClick={() => setOpen(false)}>
                            {issue.visitLabel}
                          </Link>
                          <p className="mt-0.5 text-[#4A6572]">{issue.description}</p>
                          <p className="mt-0.5 text-xs text-[#7FA0AC]">
                            {issue.techLabel} · {issue.createdAtLabel}
                          </p>
                        </div>
                        <form action={resolveIssue}>
                          <input type="hidden" name="issueId" value={issue.id} />
                          <button type="submit" className="rounded bg-[#0A5FA4] px-2 py-1 text-xs font-medium text-white">
                            Mark resolved
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {overdueVisits.length > 0 || outOfRangeReadings.length > 0 ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-800">Alerts</p>
                  {overdueVisits.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-rose-900">
                        {overdueVisits.length} overdue visit{overdueVisits.length === 1 ? "" : "s"}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {overdueVisits.map((v) => (
                          <li key={v.id} className="text-sm text-rose-800">
                            <Link href={`/dashboard/visits/${v.id}`} className="underline" onClick={() => setOpen(false)}>
                              {v.property} — {v.body}
                            </Link>{" "}
                            · {v.tech} · was due {v.dueLabel}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {outOfRangeReadings.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-rose-900">Out-of-range readings (last 7 days)</p>
                      <ul className="mt-1 space-y-1">
                        {outOfRangeReadings.map((r) => (
                          <li key={r.id} className="text-sm text-rose-800">
                            {r.property} — {r.body}: {r.issues.join(", ")}
                            {r.completedAtLabel ? ` (${r.completedAtLabel})` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
