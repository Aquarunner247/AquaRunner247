"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TopNavProps = {
  isLoggedIn: boolean;
  isAdmin: boolean;
};

function navClass(currentPath: string, href: string) {
  const active = currentPath === href || (href !== "/" && currentPath.startsWith(`${href}/`));
  return active
    ? "rounded bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white"
    : "rounded px-3 py-1.5 text-sm font-medium text-cyan-800 hover:bg-cyan-50";
}

export function TopNav({ isLoggedIn, isAdmin }: TopNavProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-sm font-semibold tracking-wide text-cyan-900">
          AquaRunner 24/7 Pro
        </Link>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700 md:hidden"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-label="Toggle navigation menu"
        >
          Menu
        </button>
        <nav className={`${menuOpen ? "flex" : "hidden"} w-full flex-col gap-1 md:flex md:w-auto md:flex-row md:items-center`}>
          <Link href="/" className={navClass(pathname, "/")}>
            Home
          </Link>
          <Link href="/dashboard" className={navClass(pathname, "/dashboard")}>
            Dashboard
          </Link>
          {isAdmin ? (
            <Link href="/dashboard/customers" className={navClass(pathname, "/dashboard/customers")}>
              Customers
            </Link>
          ) : null}
          <Link href="/p/demo-public-slug" className={navClass(pathname, "/p/demo-public-slug")}>
            Public Log
          </Link>
          {!isLoggedIn ? (
            <Link href="/login" className={navClass(pathname, "/login")}>
              Login
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void onSignOut()}
              disabled={signingOut}
              className="rounded px-3 py-1.5 text-left text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            >
              {signingOut ? "Signing out..." : "Sign out"}
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
