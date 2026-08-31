import Link from "next/link";
import { LogoMark } from "./logo-mark";
import styles from "../../landing.module.css";

/** Shared header/footer across the marketing site's now-separate pages (Home, /pricing,
 * /features) -- previously inlined once in page.tsx when everything lived on one URL. */

export function Brand({ className }: { className?: string }) {
  return (
    <Link href="/" className={`${styles.brand} ${className ?? ""}`} aria-label="AquaRunner 24/7 home">
      <LogoMark />
      <span className={styles.brandName}>
        AquaRunner<span> 24/7</span>
      </span>
    </Link>
  );
}

type NavPage = "home" | "pricing" | "features" | "compliance";

/** The waitlist section only exists on Home and the Compliance page -- everywhere else
 * needs the cross-page anchor (/#waitlist) rather than a same-page one (#waitlist) those
 * two pages can use directly. */
export function SiteNav({ current }: { current: NavPage }) {
  const waitlistHref = current === "home" || current === "compliance" ? "#waitlist" : "/#waitlist";
  return (
    <header className={styles.nav}>
      <div className={`${styles.wrap} ${styles.navIn}`}>
        <Brand />
        <nav className={styles.navLinks} aria-label="Main">
          <Link href="/pricing" className={current === "pricing" ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}>
            Pricing
          </Link>
          <Link href="/features" className={current === "features" ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}>
            Features
          </Link>
          <Link
            href="/for-property-managers"
            className={current === "compliance" ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
          >
            Compliance
          </Link>
        </nav>
        <a className={`${styles.btn} ${styles.navBtn}`} href={waitlistHref}>
          Join the waitlist
        </a>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={`${styles.onInk} ${styles.foot}`}>
      <div className={`${styles.wrap} ${styles.footIn}`}>
        <Brand />
        <p className={styles.footMeta}>
          <span>AquaRunner 24/7 — Las Vegas, NV</span>
          <span>&copy; 2026</span>
          <a href="mailto:hello@aquarunner247.com">hello@aquarunner247.com</a>
        </p>
      </div>
    </footer>
  );
}
