import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "../components/landing/site-chrome";
import { InspectorRecord, QrPlacard } from "../components/landing/scan-flow";
import { StateShowcase } from "../components/landing/state-showcase";
import { WaitlistForm } from "../components/landing/waitlist-form";
import styles from "../landing.module.css";

export const metadata: Metadata = {
  title: "AquaRunner Compliance — for properties with an in-house CPO",
  description:
    "Your CPO already keeps the pool right. AquaRunner Compliance gives every body of water a QR code and a log built for your state's rules, so an inspector sees the complete record on site. $19/month, no per-pool fees.",
  openGraph: {
    title: "AquaRunner Compliance — for properties with an in-house CPO",
    description:
      "A QR code and state-specific compliance log for every body of water your in-house CPO maintains. $19/month.",
    type: "website",
  },
};

export default function ForPropertyManagersPage() {
  return (
    <div className={styles.root}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>

      <SiteNav current="compliance" />

      <main id="main">
        {/* ---------- hero ---------- */}
        <section className={styles.hero}>
          <div className={styles.wrap}>
            <div className={styles.heroGrid}>
              <div className={styles.heroCopy}>
                <p className={`${styles.eyebrow} ${styles.heroEyebrow}`}>
                  <span className={styles.heroDot} aria-hidden="true" />
                  For commercial properties with an in-house CPO
                </p>
                <h1 className={styles.displayXl}>
                  Your CPO keeps the water right. <em>AquaRunner Compliance proves it.</em>
                </h1>
                <p className={`${styles.lede} ${styles.heroSub}`}>
                  Every body of water gets a QR code and a compliance log built for your state&rsquo;s rules — so when an
                  inspector shows up, the complete record is right there on site, not a binder your CPO has to go dig
                  up.
                </p>

                <WaitlistForm label="Get on the waitlist" />

                <p className={styles.heroBuilt}>
                  $19/month, flat. No per-pool fees, no route/scheduling features you&rsquo;ll never touch — just the
                  compliance record your CPO already needs to keep anyway.
                </p>
              </div>

              <div>
                <QrPlacard />
              </div>
            </div>
          </div>

          <div className={styles.wrap}>
            <div className={styles.heroStrip}>
              <div>
                <b>Built for one person, not a crew</b>
                Your CPO logs their own readings directly — no technician dispatch, no route to manage.
              </div>
              <div>
                <b>Configured to your state&rsquo;s rules</b>
                Log exactly what your health department requires — nothing missed, nothing memorized.
              </div>
              <div>
                <b>Inspection-ready, always</b>
                Scan the code and the current record is right there — no waiting on the office.
              </div>
            </div>
          </div>
        </section>

        {/* ---------- statement band ---------- */}
        <section className={`${styles.onInk} ${styles.band}`}>
          <div className={`${styles.wrap} ${styles.bandGrid}`}>
            <p className={styles.bandQuote}>
              A missing log isn&rsquo;t just a paperwork problem — it&rsquo;s a liability question the moment an
              inspector or an attorney asks for it.
            </p>
            <div className={styles.bandSide}>
              <p>
                Your CPO is already testing the water and keeping their own notes. AquaRunner Compliance turns that
                work into a record that&rsquo;s always current, always on hand, and built around exactly what your
                state requires — not a generic checklist.
              </p>
              <p>It&rsquo;s in final development now. Waitlist members get in first.</p>
            </div>
          </div>
        </section>

        {/* ---------- the two differentiators ---------- */}
        <section className={`${styles.onInk} ${styles.sec} ${styles.diff}`}>
          <div className={styles.wrap}>
            <div className={styles.secHead}>
              <span className={styles.secNum} aria-hidden="true">
                01
              </span>
              <div className={styles.secHeadText}>
                <p className={styles.eyebrow}>What this actually gives you</p>
                <h2 className={styles.displayL}>Scan the pool. See the whole record. Nothing to chase down.</h2>
              </div>
            </div>

            <div className={styles.diffLead}>
              <p className={styles.lede}>
                Two things sit at the center of AquaRunner Compliance: a QR code on every single body of water, and a
                compliance setup that already knows your state&rsquo;s commercial pool rules. Together they replace the
                binder, the clipboard, and the phone call asking your CPO to email something over.
              </p>
              <p className={styles.diffAside}>
                Pool, spa, splash pad, fountain — each one is its own record with its own code. Nothing gets logged
                against the wrong body of water again.
              </p>
            </div>

            <hr className={styles.hr} />

            <div className={styles.diffTwo}>
              <div className={styles.diffCol}>
                <span className={styles.diffNum}>Paperless records</span>
                <h3>A QR code on every body of water</h3>
                <p>
                  Each pool, spa, and water feature gets its own QR code — printable and laminate-ready for the pump
                  room or gate. Your CPO logs each reading right in the app. Scan that same code and an inspector on
                  site sees the complete, current record for that exact pool instantly. No binder, no filing cabinet.
                </p>
                <div className={styles.visual}>
                  <QrPlacard />
                  <p className={styles.scanNote}>One code per body of water — pool, spa, splash pad, fountain.</p>
                </div>
              </div>

              <div className={styles.diffCol}>
                <span className={styles.diffNum}>State rules</span>
                <h3>Built for your state&rsquo;s compliance code</h3>
                <p>
                  Every state has its own commercial pool requirements. AquaRunner Compliance is configured to your
                  state&rsquo;s rules, so your CPO logs exactly what that state requires at every reading — nothing
                  missed, nothing left to memory.
                </p>
                <StateShowcase />
                <div className={styles.visual}>
                  <InspectorRecord />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- closing waitlist ---------- */}
        <section className={`${styles.onFoam} ${styles.sec} ${styles.cta}`} id="waitlist">
          <div className={`${styles.wrap} ${styles.ctaCentered}`}>
            <h2 className={styles.displayL}>Get in before launch.</h2>
            <p className={styles.lede}>
              AquaRunner Compliance is in final development. $19/month flat, 14-day free trial — waitlist members get
              first access.
            </p>
            <div className={styles.ctaForm}>
              <WaitlistForm label="Your email" />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
