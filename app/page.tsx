import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { joinWaitlist } from "./waitlist-actions";
import styles from "./landing.module.css";

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-landing-display",
});

export const metadata: Metadata = {
  title: "AquaRunner 24/7 Pro — Pool Service Software Built for Compliance",
};

type PageProps = {
  searchParams?: Promise<{ joined?: string; waitlistError?: string }>;
};

export default async function Home({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const joined = sp.joined === "1";
  const waitlistError = sp.waitlistError === "1";

  return (
    <div className={`${styles.root} ${displayFont.variable}`}>
      <div className={styles.wrap}>
        <nav>
          <div className={styles.logo}>
            <span className={styles.logoDot} />
            AquaRunner 24/7
          </div>
          <a href="#waitlist" className={styles.navCta}>
            Join Waitlist
          </a>
        </nav>
      </div>

      <div className={styles.wrap}>
        <section className={styles.hero}>
          <div>
            <div className={styles.eyebrow}>In development — built on a live commercial route</div>
            <h1>
              Pool service software that actually understands <span>compliance</span>.
            </h1>
            <p className={styles.sub}>
              Built by a real pool company to solve the exact problems SNHD inspections, route chaos, and paper logs create —
              now coming to yours.
            </p>
            {joined ? (
              <p className={styles.confirmBanner}>Thanks — you&rsquo;re on the list. We&rsquo;ll be in touch when we&rsquo;re ready for you.</p>
            ) : (
              <form className={styles.heroForm} id="waitlist" action={joinWaitlist}>
                <input type="email" name="email" placeholder="you@poolcompany.com" required />
                <button type="submit" className={styles.btnPrimary}>
                  Get Early Access
                </button>
              </form>
            )}
            {waitlistError ? <p className={styles.confirmBanner}>Please enter a valid email.</p> : null}
            <div className={styles.trustLine}>No spam. Just a note when we&rsquo;re ready for you.</div>
          </div>

          <div className={styles.device}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <span>ROUTE 04 · STOP 7</span>
                <span className={styles.live}>
                  <span className={styles.liveDot} />
                  LIVE LOG
                </span>
              </div>
              <div className={styles.poolName}>Desert Palms HOA — Main Pool</div>
              <div className={styles.readingRow}>
                <span className={styles.readingLabel}>Free Chlorine</span>
                <span className={`${styles.readingValue} ${styles.flag}`}>0 ppm ⚠</span>
              </div>
              <div className={styles.readingRow}>
                <span className={styles.readingLabel}>pH</span>
                <span className={`${styles.readingValue} ${styles.ok}`}>7.4</span>
              </div>
              <div className={styles.readingRow}>
                <span className={styles.readingLabel}>Cyanuric Acid</span>
                <span className={`${styles.readingValue} ${styles.ok}`}>42 ppm</span>
              </div>
              <div className={styles.readingRow}>
                <span className={styles.readingLabel}>Last CYA Test</span>
                <span className={`${styles.readingValue} ${styles.ok}`}>12 days ago</span>
              </div>
              <div className={styles.banner}>
                <span className={styles.bannerIcon}>▲</span>
                <div className={styles.bannerText}>
                  <div className={styles.bannerTitle}>CLOSURE RISK — SNHD THRESHOLD</div>
                  <div className={styles.bannerBody}>
                    Free Chlorine reads below minimum. Auto-flagged for closure per SNHD code — resolve before reopening to
                    swimmers.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className={styles.wrap}>
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionEyebrow}>The problem</div>
            <h2>Running a route shouldn&rsquo;t mean drowning in paperwork</h2>
          </div>
          <div className={styles.logList}>
            <div className={styles.logItem}>
              <span className={styles.logTag}>INSPECTION</span>
              <span className={styles.logText}>Chasing down chemical logs the morning an inspector shows up unannounced.</span>
            </div>
            <div className={styles.logItem}>
              <span className={styles.logTag}>TECHS</span>
              <span className={styles.logText}>Readings missed, written down wrong, or logged hours after the visit.</span>
            </div>
            <div className={styles.logItem}>
              <span className={styles.logTag}>PROOF</span>
              <span className={styles.logText}>No easy way to show compliance history when SNHD actually asks for it.</span>
            </div>
            <div className={styles.logItem}>
              <span className={styles.logTag}>ROUTES</span>
              <span className={styles.logText}>Routes built from memory instead of the map, with no record of who covered what.</span>
            </div>
            <div className={styles.logItem}>
              <span className={styles.logTag}>CLIENTS</span>
              <span className={styles.logText}>Customers asking &ldquo;did anyone come today?&rdquo; — and you&rsquo;re not entirely sure either.</span>
            </div>
          </div>
        </section>
      </div>

      <div className={styles.wrap}>
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionEyebrow}>The system</div>
            <h2>One platform, built around real compliance rules — not bolted on after</h2>
          </div>
          <div className={styles.featureGrid}>
            <div className={styles.feature}>
              <div className={styles.featureNum}>01</div>
              <h3>QR-code inspector logs</h3>
              <p>Every pool gets a QR code. Inspectors scan it, see the real-time compliance log. No binders, no searching.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureNum}>02</div>
              <h3>SNHD rules, built in</h3>
              <p>Free Chlorine rounding, 30-day CYA cycles, automatic closure-risk banners on hazardous readings — the rules are baked in.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureNum}>03</div>
              <h3>Routes that make sense</h3>
              <p>Drag-and-drop route building on a real map, with service visits generated automatically as routes change.</p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureNum}>04</div>
              <h3>Photo proof, no excuses</h3>
              <p>Camera-only capture — no pulling old photos from a gallery. Every photo is proof it happened today, at that pool.</p>
            </div>
            <div className={`${styles.feature} ${styles.featureWide}`}>
              <div className={styles.featureNum}>05</div>
              <h3>Smart route placement for new customers</h3>
              <p>
                Add a new client and see the best-fit route suggested automatically — based on where your techs already are, not
                a guess on a map. You still approve every placement.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className={styles.wrap}>
        <section className={styles.section}>
          <div className={styles.proof}>
            <div className={styles.proofLabel}>From the route this was built on</div>
            <p className={styles.proofQuote}>
              &ldquo;[Space for your own before/after moment — a close call caught early, hours saved on inspection prep, whatever&rsquo;s
              most concrete from running Lindley&rsquo;s on this.]&rdquo;
            </p>
            <div className={styles.proofAttr}>
              <strong>Breanna</strong> — Owner, Lindley&rsquo;s Pool &amp; Spa Service
            </div>
          </div>
        </section>
      </div>

      <div className={styles.wrap}>
        <section className={styles.ctaSection} id="waitlist-bottom">
          <div className={styles.sectionEyebrow} style={{ textAlign: "center" }}>
            Be first in the water
          </div>
          <h2>Join the waitlist for early access</h2>
          <p className={styles.sub}>
            AquaRunner is in final development. Waitlist members get early access and founding-customer pricing at launch.
          </p>
          {joined ? (
            <p className={`${styles.confirmBanner} ${styles.center}`}>
              Thanks — you&rsquo;re on the list. We&rsquo;ll be in touch when we&rsquo;re ready for you.
            </p>
          ) : (
            <form className={`${styles.heroForm} ${styles.center}`} action={joinWaitlist}>
              <input type="email" name="email" placeholder="you@poolcompany.com" required />
              <button type="submit" className={styles.btnPrimary}>
                Get Early Access
              </button>
            </form>
          )}
          <div className={`${styles.trustLine} ${styles.center}`}>No spam. Just a note when we&rsquo;re ready for you.</div>
        </section>
      </div>

      <div className={styles.wrap}>
        <footer>
          <span>AquaRunner 24/7 Pro</span>
          <span>Pool service software for companies that take compliance seriously.</span>
        </footer>
      </div>
    </div>
  );
}
