import type { Metadata } from "next";
import Image from "next/image";
import { AppPreview } from "./components/landing/app-preview";
import { SiteNav, SiteFooter } from "./components/landing/site-chrome";
import { WaitlistForm } from "./components/landing/waitlist-form";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "AquaRunner 24/7 — Simple pricing for pool operators",
  description:
    "No per-pool fees, ever. A QR code on every pool and compliance logs built for your state put the record in an inspector's hands on site. Join the waitlist.",
  openGraph: {
    title: "AquaRunner 24/7 — Simple pricing for pool operators",
    description:
      "No per-pool fees, ever. State-specific compliance and a QR code on every pool, built by real pool service professionals in Las Vegas, Nevada.",
    type: "website",
  },
};

export default function Home() {
  return (
    <div className={styles.root}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>

      <SiteNav current="home" />

      <main id="main">
        {/* ---------- hero ---------- */}
        <section className={styles.hero}>
          <div className={styles.wrap}>
            <div className={styles.heroGrid}>
              <div className={styles.heroCopy}>
                <p className={`${styles.eyebrow} ${styles.heroEyebrow}`}>
                  <span className={styles.heroDot} aria-hidden="true" />
                  In development — built by real pool service professionals, not programmers
                </p>
                <h1 className={styles.displayXl}>
                  Simple pricing for pool operators. <em>No per-pool fees. Ever.</em>
                </h1>
                <p className={`${styles.lede} ${styles.heroSub}`}>
                  Every pool gets a QR code and a compliance log built for your state&rsquo;s rules — so an inspector
                  sees the complete record on site, not a promise to email it later.
                </p>

                <WaitlistForm label="Get on the waitlist" />

                <p className={styles.heroBuilt}>
                  The software we built for ourselves, running a commercial pool company in the Nevada heat. Now
                  we&rsquo;re opening it up to everyone else doing the same work.
                </p>
              </div>

              <div className={styles.heroMedia}>
                <Image
                  src="/marketing/hero-pool.jpg"
                  alt="A large commercial pool in Las Vegas at golden hour, palm trees reflected in still turquoise water."
                  width={1800}
                  height={1200}
                  sizes="(max-width: 1080px) 100vw, 48vw"
                  priority
                />
                <span className={styles.heroStamp}>Las Vegas, Nevada</span>
              </div>
            </div>
          </div>

          <div className={styles.wrap}>
            <div className={styles.heroStrip}>
              <div>
                <b>Every body of water gets a QR code</b>
                Scan it and the current record&rsquo;s right there — for an inspector on site, or a customer checking in.
              </div>
              <div>
                <b>Configured to your state&rsquo;s rules</b>
                The tech logs exactly what your state requires — every visit.
              </div>
              <div>
                <b>Built on real routes</b>
                Written by operators who service pools for a living.
              </div>
            </div>
          </div>
        </section>

        {/* ---------- statement band ---------- */}
        <section className={`${styles.onInk} ${styles.band}`}>
          <div className={`${styles.wrap} ${styles.bandGrid}`}>
            <p className={styles.bandQuote}>
              When skimming isn&rsquo;t enough — and it&rsquo;s what&rsquo;s below the surface that matters — dive
              deeper with AquaRunner 24/7.
            </p>
            <div className={styles.bandSide}>
              <p>
                We run a commercial pool maintenance company in Las Vegas. AquaRunner is the tool we wished existed —
                built around what actually gets checked: what&rsquo;s in the water, and whether you can prove it.
              </p>
              <p>It&rsquo;s in final development now. Waitlist members get in first.</p>
            </div>
          </div>
        </section>

        {/* ---------- in the field ---------- */}
        <section className={`${styles.onFoam} ${styles.sec}`}>
          <div className={styles.wrap}>
            <div className={styles.secHead}>
              <span className={styles.secNum} aria-hidden="true">
                01
              </span>
              <div className={styles.secHeadText}>
                <p className={styles.eyebrow}>In the field</p>
                <h2 className={styles.displayL}>Built for a phone, a wet hand, and Nevada sun.</h2>
              </div>
            </div>

            <div className={styles.fieldGrid}>
              <figure className={styles.photoOffset}>
                <Image
                  src="/marketing/tech-hands.jpg"
                  alt="A pool technician's weathered hands holding a water test kit vial of pink reagent water above a turquoise pool in harsh afternoon sun."
                  width={1800}
                  height={1200}
                  sizes="(max-width: 1080px) 100vw, 42vw"
                />
                <figcaption>Test, log, photo, next stop</figcaption>
              </figure>

              <AppPreview />
            </div>
          </div>
        </section>

        {/* ---------- testimonial ---------- */}
        <section className={`${styles.onInk} ${styles.sec} ${styles.quote}`}>
          <div className={styles.quoteBg} aria-hidden="true">
            <Image
              src="/marketing/water-texture.jpg"
              alt=""
              width={1400}
              height={2100}
              sizes="100vw"
              aria-hidden="true"
            />
          </div>
          <div className={`${styles.wrap} ${styles.quoteIn}`}>
            <div className={styles.quoteGrid}>
              <blockquote>
                <p>&ldquo;Paper logs are a thing of the past. It&rsquo;s a godsend, really.&rdquo;</p>
                <cite>Owner, AquaRunner 24/7 — Las Vegas, NV</cite>
              </blockquote>
              <div className={styles.quoteRest}>
                <p>
                  &ldquo;We wanted a way to make our techs&rsquo; lives easier. Now we satisfy inspectors with a clean,
                  easy way to view pool reports, and customers get a comprehensive report via email for every service
                  call, including photos.
                </p>
                <p>
                  Not to mention easier than ever route scheduling, with automatic suggestions on which tech and route
                  to place any new customer on.&rdquo;
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- closing waitlist ---------- */}
        <section className={`${styles.onFoam} ${styles.sec} ${styles.cta}`} id="waitlist">
          <div className={styles.wrap}>
            <div className={styles.secHead}>
              <span className={styles.secNum} aria-hidden="true">
                02
              </span>
              <div className={styles.secHeadText}>
                <p className={styles.eyebrow}>Waitlist</p>
              </div>
            </div>

            <div className={styles.ctaGrid}>
              <div>
                <h2 className={styles.displayL}>Get in before launch.</h2>
                <p className={styles.lede}>
                  AquaRunner is in final development. Every plan starts with a 14-day free trial — waitlist members
                  just get first access.
                </p>

                <div className={styles.ctaForm}>
                  <WaitlistForm label="Your email" />
                </div>

                <ul className={styles.ctaList}>
                  <li>First access to the 14-day free trial at launch.</li>
                  <li>No per-pool fees. Ever.</li>
                  <li>Built by people who service commercial pools every day.</li>
                </ul>
              </div>

              <div className={styles.ctaMedia}>
                <Image
                  src="/marketing/water-texture.jpg"
                  alt="Sunlit pool water surface with warm golden light across the ripples."
                  width={1400}
                  height={2100}
                  sizes="(max-width: 1080px) 100vw, 34vw"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
