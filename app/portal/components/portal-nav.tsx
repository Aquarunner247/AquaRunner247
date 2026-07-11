"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

function isActive(currentPath: string, href: string) {
  return currentPath === href || (href !== "/portal" && currentPath.startsWith(`${href}/`));
}

function navClass(active: boolean) {
  return active
    ? "flex items-center rounded-md bg-[#0A5FA4] px-3 py-2 text-sm font-medium text-white"
    : "flex items-center rounded-md px-3 py-2 text-sm font-medium text-[#A9D3E0] hover:bg-white/5 hover:text-white";
}

const LINKS = [
  { href: "/portal", label: "Dashboard" },
  { href: "/portal/reports", label: "Service Reports" },
  { href: "/portal/documents", label: "Documents" },
  { href: "/portal/alerts", label: "Alerts" },
];

export function PortalNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function onSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/portal/login";
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-white/10 bg-[#12234A] px-4 py-3 md:hidden">
        <Link href="/portal" className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-white">
          AquaRunner <span className="text-[#0A5FA4]">24/7</span> Portal
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
          <Link href="/portal" className="font-[family-name:var(--font-display)] text-lg font-bold uppercase leading-tight tracking-wide text-white">
            AquaRunner <span className="text-[#0A5FA4]">24/7</span>
            <br />
            Portal
          </Link>
        </div>

        <nav className="flex flex-col gap-1 px-3 py-3 md:flex-1 md:py-0">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={navClass(isActive(pathname, link.href))}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/10 px-3 py-3">
          <button
            type="button"
            onClick={() => void onSignOut()}
            disabled={signingOut}
            className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-medium text-[#E29B8F] hover:bg-white/5 disabled:opacity-60"
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>
    </>
  );
}
