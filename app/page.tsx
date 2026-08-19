import type { Metadata } from "next";
import Image from "next/image";
import { AppPreview } from "./components/landing/app-preview";
import { LogoMark } from "./components/landing/logo-mark";
import { InspectorRecord, QrPlacard } from "./components/landing/scan-flow";
import { StateShowcase } from "./components/landing/state-showcase";
import { WaitlistForm } from "./components/landing/waitlist-form";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "AquaRunner 24/7 — One app to run your entire pool business",
  description:
    "Software built by a Las Vegas commercial pool maintenance company, for pool service companies. Log every visit, stay inspection-ready, and build routes that build themselves. Join the waitlist.",
  openGraph: {
    title: "AquaRunner 24/7 — One app to run your entire pool business",
    description:
      "Commercial, residential, or both. Built by real pool service professionals in Las Vegas, Nevada. Join the waitlist.",
    type: "website",
  },
};

const FEATURES = [
  {
    n: "01",
    title: "Commercial and residential in one place",
    body: "A quick chemical check at someone's backyard pool, or a full logged visit at a commercial property. You choose which one applies to each customer.",
  },
  {
    n: "02",
    title: "Nothing gets lost",
    body: "Chemical readings, photos, and notes are saved the moment your tech enters them. No more digging through paper when you need to look something up.",
  },
  {
    n: "03",
    title: "Proof of service",
    body: "Techs snap a photo right in the app at each stop, timestamped the moment it's taken. Real proof it happened today, not an old photo pulled from a camera roll — tap any photo to pull it up full-size.",
  },
  {
    n: "04",
    title: "Routes that build themselves",
    body: "Add a new customer and the app suggests which tech and route makes the most sense based on where your team already is. You always get the final say.",
  },
  {
    n: "05",
    title: "Never miss another call",
    body: "After hours or too busy to pick up? Our AI phone agent answers, asks what's needed, and turns it into a ticket — caller info, urgency, and a summary — waiting in your dashboard before you're back at your desk.",
  },
  {
    n: "06",
    title: "A checklist that's actually yours",
    body: "Comes prefilled with a real technician checklist to start. Add, remove, or reorder anything — and turn off individual items for the clients who don't need them, without changing what everyone else sees.",
  },
  {
    n: "07",
    title: "A portal just for your customers",
    body: "Give each customer their own login. They see the day's readings, what was dosed, and photos from the visit — plus a link to the full historical log and a CSV download for their records.",
  },
  {
    n: "08",
    title: "Inspections tracked pool by pool",
    body: "Log the current inspector's contact info, the last inspection date, and upload the actual report — per body of water, since properties with more than one pool don't always get inspected on the same day. HOA community manager contacts live right alongside it.",
  },
];

function Brand({ className }: { className?: string }) {
  return (
    <a className={`${styles.brand} ${className ?? ""}`} href="#top" aria-label="AquaRunner 24/7 home">
      <LogoMark />
      <span className={styles.brandName}>
        AquaRunner<span> 24/7</span>
      </span>
    </a>
  );
}

export default function Home() {
  return (
    <div className={styles.root}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>

      <header className={styles.nav}>
        <div className={`${styles.wrap} ${styles.navIn}`}>
          <Brand />
          <span className={styles.navTag}>Las Vegas, NV · In final development</span>
          <a className={`${styles.btn} ${styles.navBtn}`} href="#waitlist">
            Join the waitlist
          </a>
        </div>
      </header>

      <main id="main">
        <span id="top" />

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
                  One app to run your entire pool business — <em>commercial, residential, or both.</em>
                </h1>
                <p className={`${styles.lede} ${styles.heroSub}`}>
                  Track every visit, build smarter routes, and keep your commercial pools ready for inspection — all
                  without a stack of paper logs.
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
              Paper logs, a truck full of binders, and a filing cabinet nobody wants to open. That was us too.
            </p>
            <div className={styles.bandSide}>
              <p>
                We run a commercial pool maintenance company in Las Vegas. We built AquaRunner because nothing on the
                market did the job the way the work actually happens — a quick chemical check at a backyard pool one
                stop, a fully logged commercial visit the next.
              </p>
              <p>It&rsquo;s in final development now. Waitlist members get in first.</p>
            </div>
          </div>
        </section>

        {/* ---------- the two differentiators ---------- */}
        <section className={`${styles.onInk} ${styles.sec} ${styles.diff}`} id="difference">
          <div className={styles.wrap}>
            <div className={styles.secHead}>
              <span className={styles.secNum} aria-hidden="true">
                01
              </span>
              <div className={styles.secHeadText}>
                <p className={styles.eyebrow}>What nothing else does</p>
                <h2 className={styles.displayL}>
                  Scan the pool. See the whole record. Log exactly what your state requires.
                </h2>
              </div>
            </div>

            <div className={styles.diffLead}>
              <p className={styles.lede}>
                Two things sit at the center of AquaRunner: a QR code on every single body of water, and a compliance
                setup that already knows your state&rsquo;s commercial pool rules. Together they replace the binder, the
                clipboard, and the phone call to the office.
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
                  Each pool, spa, and water feature gets its own QR code. Your techs log every visit right in the app
                  as they work their route — no scanning required. Scan that same code and anyone else — an
                  inspector on site, a customer checking in — sees the complete, current record for that exact pool
                  instantly. No binder, no filing cabinet, no waiting on the office.
                </p>
                <div className={styles.visual}>
                  <QrPlacard />
                  <p className={styles.scanNote}>One code per body of water — pool, spa, splash pad, fountain.</p>
                </div>
              </div>

              <div className={styles.diffCol}>
                <span className={styles.diffNum}>State rules</span>
                <h3>Built for state compliance</h3>
                <p>
                  Every state has its own commercial pool requirements. AquaRunner is configured to your state&rsquo;s
                  rules, so the technician logs exactly what that state requires at every visit — nothing missed,
                  nothing memorized.
                </p>
                <StateShowcase />
                <div className={styles.visual}>
                  <InspectorRecord />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- the rest of the features ---------- */}
        <section className={styles.sec} id="features">
          <div className={styles.wrap}>
            <div className={styles.secHead}>
              <span className={styles.secNum} aria-hidden="true">
                02
              </span>
              <div className={styles.secHeadText}>
                <p className={styles.eyebrow}>The rest of the job</p>
                <h2 className={styles.displayL}>Everything the day actually needs.</h2>
              </div>
            </div>

            <div className={styles.feat}>
              {FEATURES.map((feature) => (
                <article className={styles.featItem} key={feature.n}>
                  <span className={styles.featNum}>{feature.n}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </article>
              ))}
            </div>

            <p className={styles.featFoot}>
              <strong>And your customers hear about it.</strong>{" "}
              <span className={styles.muted}>
                Every service call sends the customer a comprehensive emailed report — readings, notes, and photos
                included.
              </span>
            </p>
          </div>
        </section>

        {/* ---------- in the field ---------- */}
        <section className={`${styles.onFoam} ${styles.sec}`} id="field">
          <div className={styles.wrap}>
            <div className={styles.secHead}>
              <span className={styles.secNum} aria-hidden="true">
                03
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
                04
              </span>
              <div className={styles.secHeadText}>
                <p className={styles.eyebrow}>Waitlist</p>
              </div>
            </div>

            <div className={styles.ctaGrid}>
              <div>
                <h2 className={styles.displayL}>Get in before launch.</h2>
                <p className={styles.lede}>
                  AquaRunner is in final development. Waitlist members get early access and founding-customer pricing at
                  launch.
                </p>

                <div className={styles.ctaForm}>
                  <WaitlistForm label="Your email" />
                </div>

                <ul className={styles.ctaList}>
                  <li>Early access before public launch.</li>
                  <li>Founding-customer pricing at launch.</li>
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
    </div>
  );
}
