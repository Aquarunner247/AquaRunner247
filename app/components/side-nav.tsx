"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SideNavProps = {
  isLoggedIn: boolean;
  isAdmin: boolean;
  userName?: string | null;
  orgName?: string | null;
};

function isActive(currentPath: string, href: string) {
  return currentPath === href || (href !== "/" && currentPath.startsWith(`${href}/`));
}

function navClass(active: boolean) {
  return active
    ? "flex items-center rounded-md bg-[#0A5FA4] px-3 py-2 text-sm font-medium text-white"
    : "flex items-center rounded-md px-3 py-2 text-sm font-medium text-[#A9D3E0] hover:bg-white/5 hover:text-white";
}

export function SideNav({ isLoggedIn, isAdmin, userName, orgName }: SideNavProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // The customer portal has its own separate nav/layout (app/portal) — don't show the staff nav there.
  if (pathname.startsWith("/portal")) return null;

  async function onSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    ...(isAdmin ? [{ href: "/dashboard/customers", label: "Customers" }] : []),
    ...(isAdmin ? [{ href: "/dashboard/technicians", label: "Technicians" }] : []),
    ...(isAdmin ? [{ href: "/dashboard/routes", label: "Routes" }] : []),
    ...(isAdmin ? [{ href: "/dashboard/chemicals", label: "Chemicals" }] : []),
    ...(isAdmin ? [{ href: "/dashboard/checklist", label: "Checklist" }] : []),
    ...(isAdmin ? [{ href: "/dashboard/settings", label: "Settings" }] : []),
    ...(isAdmin ? [{ href: "/dashboard/billing", label: "Billing" }] : []),
  ];

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-white/10 bg-[#12234A] px-4 py-3 md:hidden">
        <Link href="/" className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-white">
          AquaRunner <span className="text-[#0A5FA4]">24/7</span> Pro
        </Link>
        <button
          type="button"
          className="rounded border border-white/20 px-2 py-1 text-sm text-white"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-label="Toggle navigation menu"
        >
          Menu
        </button>
      </div>

      <aside
        className={`${
          menuOpen ? "block" : "hidden"
        } w-full shrink-0 bg-[#12234A] md:flex md:h-screen md:w-60 md:flex-col md:sticky md:top-0`}
      >
        <div className="hidden px-5 py-6 md:block">
          <Link href="/" className="font-[family-name:var(--font-display)] text-lg font-bold uppercase leading-tight tracking-wide text-white">
            AquaRunner <span className="text-[#0A5FA4]">24/7</span>
            <br />
            Pro
          </Link>
        </div>

        <nav className="flex flex-col gap-1 px-3 py-3 md:flex-1 md:py-0">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={navClass(isActive(pathname, link.href))}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/10 px-3 py-3">
          {isLoggedIn && (userName || orgName) ? (
            <div className="mb-2 rounded-md bg-white/5 px-3 py-2">
              {userName ? <p className="truncate text-sm font-medium text-white">{userName}</p> : null}
              {orgName ? <p className="truncate text-xs text-[#A9D3E0]">{orgName}</p> : null}
            </div>
          ) : null}
          {isLoggedIn ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-[#A9D3E0] hover:bg-white/5 hover:text-white"
            >
              <span aria-hidden>⟳</span> Sync
            </button>
          ) : null}
          {!isLoggedIn ? (
            <Link href="/login" className={navClass(isActive(pathname, "/login"))}>
              Login
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void onSignOut()}
              disabled={signingOut}
              className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-medium text-[#E29B8F] hover:bg-white/5 disabled:opacity-60"
            >
              {signingOut ? "Signing out..." : "Sign out"}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
