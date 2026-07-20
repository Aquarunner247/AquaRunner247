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
  title: "AquaRunner 24/7 Pro — Pool Route Software for Residential and Commercial",
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
            AquaRunner <span>24/7</span>
          </div>
          <a href="#waitlist" className={styles.navCta}>
            Join Waitlist
          </a>
        </nav>
      </div>

      <div className={styles.wrap}>
        <section className={styles.hero}>
          <div>
            <div className={styles.eyebrow}>
              In development — created by real pool service professionals, not programmers — the software we built for
              ourselves, now available to everyone
            </div>
            <h1>
              One app to run your <span>entire</span> pool business — Commercial, Residential or both.
            </h1>
            <p className={styles.sub}>
              Track every visit, build smarter routes, and keep your commercial pools ready for inspection — all without a
              stack of paper logs.
            </p>
            <div className={styles.splitTags}>
              <span className={`${styles.splitTag} ${styles.res}`}>
                <span className={styles.tagDot} />
                Residential
              </span>
              <span className={`${styles.splitTag} ${styles.com}`}>
                <span className={styles.tagDot} />
                Commercial
              </span>
            </div>
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
                <span>TODAY&rsquo;S STOP · #7</span>
                <span className={styles.live}>
                  <span className={styles.liveDot} />
                  LOGGED LIVE
                </span>
              </div>
              <div className={styles.poolName}>Desert Palms HOA</div>
              <div className={styles.poolSub}>Commercial · Route 4</div>
              <div className={styles.readingRow}>
                <span className={styles.readingLabel}>Chlorine</span>
                <span className={`${styles.readingValue} ${styles.flag}`}>Too low ⚠</span>
              </div>
              <div className={styles.readingRow}>
                <span className={styles.readingLabel}>pH</span>
                <span className={`${styles.readingValue} ${styles.ok}`}>Normal</span>
              </div>
              <div className={styles.readingRow}>
                <span className={styles.readingLabel}>Alkalinity</span>
                <span className={`${styles.readingValue} ${styles.ok}`}>Normal</span>
              </div>
              <div className={styles.readingRow}>
                <span className={styles.readingLabel}>Last full test</span>
                <span className={`${styles.readingValue} ${styles.ok}`}>12 days ago</span>
              </div>
              <div className={styles.banner}>
                <span className={styles.bannerIcon}>▲</span>
                <div className={styles.bannerText}>
                  <div className={styles.bannerTitle}>NEEDS ATTENTION</div>
                  <div className={styles.bannerBody}>
                    Chlorine is too low. Flagged automatically so your team can retest before anyone swims — matches your
                    local health department&rsquo;s rules.
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
            <h2>Running a pool route shouldn&rsquo;t mean drowning in paperwork</h2>
          </div>
          <div className={styles.logList}>
            <div className={styles.logItem}>
              <span className={styles.logTag}>—</span>
              <span className={styles.logText}>No more keeping track of antiquated paper logs for every single pool, every single visit.</span>
            </div>
            <div className={styles.logItem}>
              <span className={styles.logTag}>—</span>
              <span className={styles.logText}>No more uncertainty if your tech did what he was supposed to at each stop.</span>
            </div>
            <div className={styles.logItem}>
              <span className={styles.logTag}>—</span>
              <span className={styles.logText}>No more keeping the inspector waiting for water stained log sheets.</span>
            </div>
            <div className={styles.logItem}>
              <span className={styles.logTag}>—</span>
              <span className={styles.logText}>No more thinking what route to add your new customer to.</span>
            </div>
            <div className={styles.logItem}>
              <span className={styles.logTag}>—</span>
              <span className={styles.logText}>No more customers wondering if their pool was serviced.</span>
            </div>
          </div>
        </section>
      </div>

      <div className={styles.wrap}>
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div className={styles.sectionEyebrow}>The app</div>
            <h2>Everything your business needs, whether it&rsquo;s a backyard pool or a busy commercial property</h2>
          </div>
          <div className={styles.featureGrid}>
            <div className={styles.feature}>
              <div className={styles.featureNum}>01</div>
              <h3>Built for homes and businesses</h3>
              <p>
                One app for your whole business — a quick chemical check at someone&rsquo;s backyard pool, or a full logged
                visit at a commercial property. You choose which one applies to each customer.
              </p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureNum}>02</div>
              <h3>Every visit logged automatically</h3>
              <p>
                Chemical readings, photos, and notes are saved the moment your tech enters them — no more digging through
                paper when you need to look something up.
              </p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureNum}>03</div>
              <h3>Ready when the inspector shows up</h3>
              <p>
                Set up to match your state and local health department&rsquo;s rules, so commercial pools stay
                inspection-ready without anyone having to memorize the requirements.
              </p>
            </div>
            <div className={styles.feature}>
              <div className={styles.featureNum}>04</div>
              <h3>Photos that actually prove it</h3>
              <p>
                Techs snap a photo right in the app at each stop — real proof it happened today, not an old photo pulled
                from their camera roll.
              </p>
            </div>
            <div className={`${styles.feature} ${styles.featureWide}`}>
              <div className={styles.featureNum}>05</div>
              <h3>Smart suggestions for new customers</h3>
              <p>
                Add a new customer and the app suggests which route makes the most sense based on where your team already
                is — no more guessing on a map. You always get the final say.
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
              &ldquo;We wanted a way to make our techs&rsquo; lives easier. Paper logs are a thing of the past. Now we
              satisfy inspectors with a clean, easy way to view pool reports, and customers get a comprehensive report via
              email for every service call, including photos. Not to mention easier than ever route scheduling, with
              automatic suggestions on which tech and route to place any new customer on. It&rsquo;s a godsend,
              really!&rdquo;
            </p>
            <div className={styles.proofAttr}>
              <strong>Steven</strong> — Owner, Lindley&rsquo;s Pool &amp; Spa Service
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
          {waitlistError ? <p className={`${styles.confirmBanner} ${styles.center}`}>Please enter a valid email.</p> : null}
          <div className={`${styles.trustLine} ${styles.center}`}>No spam. Just a note when we&rsquo;re ready for you.</div>
        </section>
      </div>

      <div className={styles.wrap}>
        <footer>
          <span>AquaRunner 24/7 Pro</span>
          <span>Pool route software for residential and commercial service companies.</span>
        </footer>
      </div>
    </div>
  );
}
