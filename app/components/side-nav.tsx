"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NavIcon, type NavIconKind } from "./nav-icons";
import type { UserRole } from "@/generated/prisma/client";

type SideNavProps = {
  isLoggedIn: boolean;
  role: UserRole | null;
  userName?: string | null;
  orgName?: string | null;
};

type NavLink = { href: string; label: string; icon: NavIconKind };

const ADMIN_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/dashboard/schedule", label: "Schedule", icon: "schedule" },
  { href: "/dashboard/customers", label: "Customers", icon: "customers" },
  { href: "/dashboard/routes", label: "Routes", icon: "routes" },
  { href: "/dashboard/users", label: "Users", icon: "users" },
  { href: "/dashboard/chemicals", label: "Chemicals", icon: "chemicals" },
  { href: "/dashboard/checklist", label: "Checklist", icon: "checklist" },
  { href: "/dashboard/compliance", label: "Compliance", icon: "compliance" },
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
  { href: "/dashboard/billing", label: "Billing", icon: "billing" },
  { href: "/dashboard/phone-agent", label: "Phone Agent", icon: "phone" },
];
// The first 4 are what the bottom bar shows directly on mobile; the rest live behind "More".
const ADMIN_PRIMARY_COUNT = 4;

const TECHNICIAN_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/dashboard/schedule", label: "Schedule", icon: "schedule" },
  { href: "/dashboard/alerts", label: "Alerts", icon: "alerts" },
  { href: "/dashboard/more", label: "More", icon: "more" },
];

function linksForRole(role: UserRole | null): NavLink[] {
  if (role === "ADMIN") return ADMIN_LINKS;
  if (role === "TECHNICIAN") return TECHNICIAN_LINKS;
  // OFFICE (and any future role): most dashboard sections redirect non-admins away
  // server-side (see e.g. customers/page.tsx), so only link what's actually reachable
  // today instead of pointing at pages that immediately bounce back.
  return [{ href: "/dashboard", label: "Dashboard", icon: "dashboard" }];
}

function isActive(currentPath: string, href: string) {
  return currentPath === href || (href !== "/dashboard" && currentPath.startsWith(`${href}/`));
}

export function SideNav({ isLoggedIn, role, userName, orgName }: SideNavProps) {
  const pathname = usePathname();
  const [pinned, setPinned] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // The customer portal has its own separate nav/layout (app/portal) -- don't show the staff nav there.
  if (pathname.startsWith("/portal")) return null;
  // AquaRunner Compliance is a separate product with its own nav/layout (app/cpo) --
  // never show the pool-service staff nav there.
  if (pathname.startsWith("/cpo")) return null;
  // The marketing site (Home, Pricing, Features, and per-persona pages like
  // /for-property-managers) has its own nav/footer, not part of the app shell -- without
  // this, a logged-in admin browsing the marketing pages would see the staff nav
  // overlaid on top of them.
  if (pathname === "/" || pathname.startsWith("/pricing") || pathname.startsWith("/features") || pathname.startsWith("/for-property-managers")) {
    return null;
  }

  async function onSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-between border-b border-white/10 bg-brand-ink px-4 py-3 md:sticky md:top-0 md:z-30 md:h-screen md:w-16 md:flex-col md:justify-start md:gap-6 md:border-b-0 md:border-r md:py-6">
        <Link href="/" className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-white md:hidden">
          AquaRunner <span className="text-brand-border">24/7</span> Pro
        </Link>
        <Link
          href="/"
          className="hidden font-[family-name:var(--font-display)] text-lg font-extrabold text-brand-border md:block"
          title="AquaRunner 24/7 Pro"
        >
          A<span className="text-white">24</span>
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-white/20 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 md:border-0 md:px-2"
        >
          Login
        </Link>
      </div>
    );
  }

  const links = linksForRole(role);
  const isTechnician = role === "TECHNICIAN";
  const expanded = pinned || hovering;
  const primaryLinks = links.slice(0, ADMIN_PRIMARY_COUNT);
  const overflowLinks = links.slice(ADMIN_PRIMARY_COUNT);

  return (
    <>
      {/* Desktop rail -- collapsed to icons by default, expands on hover or when pinned. */}
      <aside
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={`sticky top-0 z-30 hidden h-screen shrink-0 flex-col bg-brand-ink transition-[width] duration-200 ease-out md:flex ${
          expanded ? "w-56" : "w-16"
        }`}
      >
        <div className="flex items-center gap-2 px-4 py-5">
          <Link href="/dashboard" className="shrink-0 font-[family-name:var(--font-display)] text-lg font-extrabold text-brand-border">
            A<span className="text-white">24</span>
          </Link>
          <span
            className={`overflow-hidden whitespace-nowrap font-[family-name:var(--font-display)] text-sm font-bold uppercase leading-tight tracking-wide text-white transition-opacity duration-150 ${
              expanded ? "opacity-100" : "w-0 opacity-0"
            }`}
          >
            AquaRunner Pro
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2.5">
          {links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                title={expanded ? undefined : link.label}
                className={`flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-brand-primary text-white" : "text-brand-border hover:bg-white/5 hover:text-white"
                }`}
              >
                <NavIcon kind={link.icon} className="h-5 w-5 shrink-0" />
                <span className={`overflow-hidden whitespace-nowrap transition-opacity duration-150 ${expanded ? "opacity-100" : "w-0 opacity-0"}`}>
                  {link.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-2.5 py-3">
          <button
            type="button"
            onClick={() => setPinned((v) => !v)}
            aria-pressed={pinned}
            title={pinned ? "Unpin sidebar" : "Keep sidebar open"}
            className={`mb-1 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
              pinned ? "bg-white/10 text-white" : "text-brand-border hover:bg-white/5 hover:text-white"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5 shrink-0">
              <path d={pinned ? "M6 6l12 12M6 18L18 6" : "M9 5h6l-1 5 3 3v2H7v-2l3-3-1-5Z"} strokeLinecap="round" strokeLinejoin="round" />
              {!pinned ? <path d="M12 15v5" strokeLinecap="round" /> : null}
            </svg>
            <span className={`overflow-hidden whitespace-nowrap transition-opacity duration-150 ${expanded ? "opacity-100" : "w-0 opacity-0"}`}>
              {pinned ? "Unpin" : "Pin open"}
            </span>
          </button>

          {(userName || orgName) && expanded ? (
            <div className="mb-1 truncate rounded-md bg-white/5 px-2.5 py-2">
              {userName ? <p className="truncate text-sm font-medium text-white">{userName}</p> : null}
              {orgName ? <p className="truncate text-xs text-brand-border">{orgName}</p> : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void onSignOut()}
            disabled={signingOut}
            title={expanded ? undefined : "Sign out"}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-brand-accent hover:bg-white/5 disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5 shrink-0">
              <path d="M15 4H7a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 12h10m0 0-3-3m3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className={`overflow-hidden whitespace-nowrap transition-opacity duration-150 ${expanded ? "opacity-100" : "w-0 opacity-0"}`}>
              {signingOut ? "Signing out..." : "Sign out"}
            </span>
          </button>
        </div>
      </aside>

      {/* Mobile: technicians already get TechBottomNav from dashboard/layout.tsx --
          nothing extra to render here so the two bars don't stack. */}
      {isTechnician ? null : (
        <>
          {sheetOpen ? (
            <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setSheetOpen(false)}>
              <div
                className="absolute bottom-16 left-1/2 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-lg border border-brand-border bg-white p-2 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                {overflowLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setSheetOpen(false)}
                    className="flex items-center gap-3 rounded px-3 py-3 text-sm font-semibold text-brand-ink hover:bg-brand-foam"
                  >
                    <NavIcon kind={link.icon} className="h-5 w-5 shrink-0" />
                    {link.label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={() => void onSignOut()}
                  disabled={signingOut}
                  className="mt-1 flex w-full items-center gap-3 rounded px-3 py-3 text-left text-sm font-semibold text-brand-danger hover:bg-brand-dangerFill disabled:opacity-60"
                >
                  {signingOut ? "Signing out..." : "Sign out"}
                </button>
              </div>
            </div>
          ) : null}

          <nav className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-white/10 bg-brand-ink px-2 pb-[env(safe-area-inset-bottom)] pt-1 md:hidden">
            {primaryLinks.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] font-medium ${active ? "text-white" : "text-brand-icon"}`}
                >
                  <NavIcon kind={link.icon} className="h-5 w-5" />
                  {link.label}
                </Link>
              );
            })}
            {overflowLinks.length > 0 ? (
              <button
                type="button"
                onClick={() => setSheetOpen((v) => !v)}
                aria-label="More"
                className={`flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] font-medium ${sheetOpen ? "text-white" : "text-brand-icon"}`}
              >
                <NavIcon kind="more" className="h-5 w-5" />
                More
              </button>
            ) : null}
          </nav>
        </>
      )}
    </>
  );
}
