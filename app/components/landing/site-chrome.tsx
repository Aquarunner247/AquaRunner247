import Link from "next/link";
import { LogoMark } from "./logo-mark";
import { PrimaryButton } from "./ui";

/**
 * Header and footer for the marketing site, rebuilt to the Marbalism design.
 *
 * Tailwind utilities rather than the landing CSS module the previous version used: the handoff
 * specifies this layer in utility terms, and keeping the spec and the code in the same vocabulary is
 * what stops them drifting.
 *
 * The CTA is the waitlist, not the handoff's "Start free trial". There is no trial -- signups are
 * deliberately Preview-only until launch -- and a button that promises one would be the site's most
 * prominent false claim.
 */

/** "AquaRunner 247" with the numerals in Coral, per the handoff's header note. */
export function Brand({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <Link href="/" className="flex items-center gap-3" aria-label="AquaRunner 24/7 home">
      <LogoMark />
      {/* nowrap and a step down at phone width: "AquaRunner 247" broke across two lines in the header
          and squeezed Sign in into a column beside it. */}
      <span
        className={`whitespace-nowrap font-marketing text-lg font-black uppercase italic tracking-[-0.03em] sm:text-xl ${
          tone === "dark" ? "text-white" : "text-brand-ink"
        }`}
      >
        AquaRunner <span className="text-brand-cta">247</span>
      </span>
    </Link>
  );
}

type NavPage = "home" | "pricing" | "features" | "property-managers" | "legal";

const NAV_LINKS: { href: string; label: string; page: NavPage }[] = [
  { href: "/features", label: "Features", page: "features" },
  { href: "/pricing", label: "Pricing", page: "pricing" },
  { href: "/for-property-managers", label: "Property managers", page: "property-managers" },
];

export function SiteNav({ current }: { current: NavPage }) {
  return (
    <header className="sticky top-0 z-50 border-b border-brand-border bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4 sm:gap-4 sm:px-8 lg:px-12">
        <Brand />
        <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`font-sans text-sm font-bold transition-colors hover:text-brand-cta ${
                current === link.page ? "text-brand-cta" : "text-brand-ink"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link href="/login" className="font-sans text-sm font-bold text-brand-ink transition-colors hover:text-brand-cta">
            Sign in
          </Link>
        </nav>
        {/* Sign in stays visible on a phone where the marketing links collapse -- a technician opening
            the site on site still needs a way into the app. */}
        <div className="flex items-center gap-3">
          <Link href="/login" className="whitespace-nowrap font-sans text-sm font-bold text-brand-ink md:hidden">
            Sign in
          </Link>
          {/* Shortened below sm: the full label plus "Sign in" plus the wordmark does not fit a 390px
              header on one line, and wrapping the button was what made the header look cramped. */}
          <PrimaryButton href="/#waitlist" className="whitespace-nowrap px-4 py-2.5 text-sm">
            <span className="sm:hidden">Waitlist</span>
            <span className="hidden sm:inline">Join the waitlist</span>
          </PrimaryButton>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="bg-brand-ink px-5 py-12 text-white sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <Brand tone="dark" />
            <p className="mt-4 max-w-sm font-sans text-sm leading-relaxed text-brand-mutedOnDark">
              Commercial-first pool route management and compliance, built by pool professionals in Las Vegas.
            </p>
          </div>

          <div>
            <p className="font-marketing text-sm font-bold uppercase italic tracking-[0.12em] text-brand-cta">Explore</p>
            <ul className="mt-4 space-y-2 font-sans text-sm">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-brand-mutedOnDark transition-colors hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <a href="mailto:hello@aquarunner247.com" className="text-brand-mutedOnDark transition-colors hover:text-white">
                  Contact
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="font-marketing text-sm font-bold uppercase italic tracking-[0.12em] text-brand-cta">Start here</p>
            <p className="mt-4 font-sans text-sm leading-relaxed text-brand-mutedOnDark">
              Launching soon. Join the waitlist and you&rsquo;ll hear from us when it opens — nothing before then.
            </p>
            <PrimaryButton href="/#waitlist" className="mt-4 px-4 py-2.5 text-sm">
              Join the waitlist
            </PrimaryButton>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 font-sans text-xs text-brand-mutedOnDark">
          <p>&copy; {new Date().getFullYear()} AquaRunner 24/7. Built in Las Vegas, Nevada.</p>
          <p className="flex gap-4">
            <Link href="/terms" className="transition-colors hover:text-white">
              Terms of Service
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-white">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
