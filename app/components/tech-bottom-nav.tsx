"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

function NavIcon({ kind }: { kind: "dashboard" | "schedule" | "alerts" | "more" }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 } as const;
  if (kind === "dashboard") {
    return (
      <svg {...common} className="h-5 w-5">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
      </svg>
    );
  }
  if (kind === "schedule") {
    return (
      <svg {...common} className="h-5 w-5">
        <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
        <path d="M3.5 9.5h17M8 3v3M16 3v3" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "alerts") {
    return (
      <svg {...common} className="h-5 w-5">
        <path d="M12 3a5 5 0 0 0-5 5v2.6c0 .6-.2 1.2-.6 1.7L5 14.5c-.7.9-.1 2.2 1 2.2h12c1.1 0 1.7-1.3 1-2.2l-1.4-2.2a2.7 2.7 0 0 1-.6-1.7V8a5 5 0 0 0-5-5Z" strokeLinejoin="round" />
        <path d="M9.5 19a2.5 2.5 0 0 0 5 0" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common} className="h-5 w-5">
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TechBottomNav({ dateYmd }: { dateYmd: string }) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  const items = [
    { href: "/dashboard", label: "Dashboard", kind: "dashboard" as const },
    { href: "/dashboard/schedule", label: "Schedule", kind: "schedule" as const },
  ];
  const rightItems = [
    { href: "/dashboard/alerts", label: "Alerts", kind: "alerts" as const },
    { href: "/dashboard/more", label: "More", kind: "more" as const },
  ];

  function isActive(href: string) {
    return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  }

  return (
    <>
      {sheetOpen ? (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setSheetOpen(false)}>
          <div
            className="absolute bottom-16 left-1/2 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-lg border border-[#C9E3EC] bg-white p-2 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              href={`/dashboard/schedule?tab=day&date=${dateYmd}`}
              onClick={() => setSheetOpen(false)}
              className="block rounded px-3 py-3 text-sm font-semibold text-[#12234A] hover:bg-[#EAF6FA]"
            >
              Add a stop
            </Link>
            <Link
              href="/dashboard/report-issue"
              onClick={() => setSheetOpen(false)}
              className="block rounded px-3 py-3 text-sm font-semibold text-[#12234A] hover:bg-[#EAF6FA]"
            >
              Report an issue
            </Link>
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-white/10 bg-[#12234A] px-2 pb-[env(safe-area-inset-bottom)] pt-1 md:hidden">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] font-medium ${
              isActive(item.href) ? "text-white" : "text-[#7FA0AC]"
            }`}
          >
            <NavIcon kind={item.kind} />
            {item.label}
          </Link>
        ))}

        <button
          type="button"
          onClick={() => setSheetOpen((v) => !v)}
          aria-label="Quick actions"
          className="-mt-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0A5FA4] text-2xl font-bold text-white shadow-lg"
        >
          +
        </button>

        {rightItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] font-medium ${
              isActive(item.href) ? "text-white" : "text-[#7FA0AC]"
            }`}
          >
            <NavIcon kind={item.kind} />
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
