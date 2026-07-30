"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NavIcon } from "./nav-icons";

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
            className="absolute bottom-16 left-1/2 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-lg border border-brand-border bg-white p-2 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              href={`/dashboard/schedule?tab=day&date=${dateYmd}`}
              onClick={() => setSheetOpen(false)}
              className="block rounded px-3 py-3 text-sm font-semibold text-brand-ink hover:bg-brand-foam"
            >
              Add a stop
            </Link>
            <Link
              href="/dashboard/report-issue"
              onClick={() => setSheetOpen(false)}
              className="block rounded px-3 py-3 text-sm font-semibold text-brand-ink hover:bg-brand-foam"
            >
              Report an issue
            </Link>
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-white/10 bg-brand-ink px-2 pb-[env(safe-area-inset-bottom)] pt-1 md:hidden">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] font-medium ${
              isActive(item.href) ? "text-white" : "text-brand-icon"
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
          className="-mt-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-primary text-2xl font-bold text-white shadow-lg"
        >
          +
        </button>

        {rightItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] font-medium ${
              isActive(item.href) ? "text-white" : "text-brand-icon"
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
