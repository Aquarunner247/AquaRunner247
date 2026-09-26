import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AppPreview } from "./components/landing/app-preview";
import { InspectorRecord } from "./components/landing/scan-flow";
import { SiteNav, SiteFooter } from "./components/landing/site-chrome";
import { WaitlistForm } from "./components/landing/waitlist-form";
import styles from "./landing.module.css";

const CORE_CAPABILITIES = [
  {
    n: "01",
    title: "Your state's rules, enforced at the pool",
    body: "Every state that has a commercial pool code is already built in — all 49 of them. Idaho and Mississippi don't have one. Your tech logs exactly what your state requires, and the app won't let them close out the job without it.",
  },
  {
    n: "02",
    title: "Routes ordered by real drive time",
    body: "One tap reorders the day using actual driving times on real roads, not straight lines across a map. Back-to-back stops end up actually being back-to-back.",
  },
  {
    n: "03",
    title: "Arrival that logs itself",
    body: "The app records arrival when your tech reaches the pool — phone in the pocket, screen off, app in the background. No clocking in, no rounding up, no arguing about it later.",
  },
  {
    n: "04",
    title: "Proof every visit happened",
    body: "Photos are taken in the app, timestamped and geotagged where they were shot — not pulled from a camera roll. The app even flags a blurry one before your tech walks away from the pool.",
  },
  {
    n: "05",
    title: "Exactly how much to add",
    body: "Enter today's reading and get the dose, off Taylor's published numbers — chlorine, alkalinity, cyanuric acid, calcium hardness, salt. Running a tablet feeder? It counts the days until your next visit so you're not guessing how many to leave.",
  },
  {
    n: "06",
    title: "A portal for your customers",
    body: "Every customer gets their own login: the day's readings, what was dosed, the photos, and the whole history as a CSV. On White Label it carries your logo instead of ours.",
  },
];

const WORKFLOW_STEPS = [
  {
    n: "01",
    role: "Operations",
    body: "Build the day, assign it, and see the problems before anyone leaves the yard.",
  },
  {
    n: "02",
    role: "Technicians",
    body: "Work the route, log the readings, shoot the photos — all from the pool deck.",
  },
  {
    n: "03",
    role: "Management",
    body: "See what got done, what got skipped, and what's still open across every account.",
  },
  {
    n: "04",
    role: "Customers",
    body: "Read today's report without calling you to ask whether anybody showed up.",
  },
];

export const metadata: Metadata = {
  title: "AquaRunner 24/7 — Pool service software for every pool you run",
  description:
    "Residential and commercial pools on one account, with no per-pool fees. A QR code on every body of water and compliance logs built for your state put the record in an inspector's hands on site. Join the waitlist.",
  openGraph: {
    title: "AquaRunner 24/7 — Pool service software for every pool you run",
    description:
      "One company. Every pool. One app. Residential and commercial in one account, state-specific compliance, and a QR code on every pool — built by real pool service professionals in Las Vegas, Nevada.",
    type: "website",
    url: "/",
    siteName: "AquaRunner 24/7",
    images: [{ url: "/og/home.png", width: 1200, height: 630, alt: "AquaRunner 24/7 — One company. Every pool. One app." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AquaRunner 24/7 — Pool service software for every pool you run",
    description: "One company. Every pool. One app. Residential and commercial in one account, state-specific compliance, and a QR code on every pool — built by real pool service professionals in Las Vegas, Nevada.",
    images: ["/og/home.png"],
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
                  Built by pool professionals in Las Vegas, Nevada
                </p>
                <h1 className={styles.displayXl}>One company. Every pool. One app.</h1>
                <p className={`${styles.lede} ${styles.heroSub}`}>
                  Backyard pools and commercial properties run on the same account. AquaRunner changes the workflow
                  to match the pool you&rsquo;re standing at — a quick chemistry check at a residential stop, the
                  full state-required log at a commercial property.
                </p>

                <WaitlistForm label="Get on the waitlist" />

                <p className={styles.heroBuilt}>
                  No per-pool fees. Ever. One flat price, every body of water you service.
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
                <b>Residential and commercial, one account</b>
                A backyard route and a hotel property don&rsquo;t need two subscriptions.
              </div>
              <div>
                <b>A QR code on every body of water</b>
                Print it, laminate it, hang it in the pump room. Anyone who scans it sees the current record.
              </div>
              <div>
                <b>Your state&rsquo;s rules, already built in</b>
                Technicians log exactly what your state requires — they can&rsquo;t close out the job without it.
              </div>
            </div>
          </div>
        </section>

        {/* ---------- statement band ---------- */}
        <section className={`${styles.onInk} ${styles.band}`}>
          <div className={`${styles.wrap} ${styles.bandGrid}`}>
            <p className={styles.bandQuote}>
              Anyone can say the pool was serviced today. AquaRunner is how you prove it.
            </p>
            <div className={styles.bandSide}>
              <p>
                Readings, photos, doses, and the checklist are captured at the pool and timestamped as they&rsquo;re
                entered. When a customer asks, a property manager asks, or an inspector asks, the answer is already
                on file — you&rsquo;re not reconstructing it from memory and a glovebox full of paper.
              </p>
              <p>AquaRunner is in final development. Join the waitlist for first access.</p>
            </div>
          </div>
        </section>

        {/* ---------- residential + commercial ---------- */}
        <section className={`${styles.onFoam} ${styles.sec}`}>
          <div className={styles.wrap}>
            <div className={styles.secHead}>
              <span className={styles.secNum} aria-hidden="true">
                01
              </span>
              <div className={styles.secHeadText}>
                <p className={styles.eyebrow}>Residential. Commercial. Both.</p>
                <h2 className={styles.displayL}>Every pool you service, in one account.</h2>
              </div>
            </div>

            <div className={styles.diffTwo}>
              <div className={styles.coreCard}>
                <span className={styles.coreCardNum}>Residential</span>
                <h3>Run the route and get out</h3>
                <p>
                  Backyard pools get the light version — only the readings you actually take on a residential stop,
                  and the things that matter when you pull up: the gate code, where to park, and whether there&rsquo;s
                  a dog back there before your tech opens the side gate. Finish the stop and the customer gets a clean
                  emailed report with photos.
                </p>
              </div>

              <div className={styles.coreCard}>
                <span className={styles.coreCardNum}>Commercial</span>
                <h3>Prove every visit</h3>
                <p>
                  Commercial properties get the property manager and the maintenance contact, every body of water on
                  the site as its own record, the chemistry your state requires, the equipment and drain-cover
                  details, and the QR code for the pump room. Same login, same app — it just asks for more, because
                  the county does.
                </p>
              </div>
            </div>

            <p className={styles.featFoot}>
              <strong>Most companies do some of both.</strong>{" "}
              <span className={styles.muted}>
                That&rsquo;s one subscription, not two — and one place to look when a customer calls.
              </span>
            </p>
          </div>
        </section>

        {/* ---------- what nothing else does ---------- */}
        <section className={`${styles.onInk} ${styles.sec}`}>
          <div className={styles.wrap}>
            <div className={styles.secHead}>
              <span className={styles.secNum} aria-hidden="true">
                02
              </span>
              <div className={styles.secHeadText}>
                <p className={styles.eyebrow}>What nothing else does</p>
                <h2 className={styles.displayL}>An inspector walks up. Everything they need is already on the wall.</h2>
              </div>
            </div>

            <div className={styles.diffLead}>
              <p className={styles.lede}>
                AquaRunner was built around two simple things: a QR code for every body of water, and compliance
                rules already set for your state. Together they replace the binder, the water-stained logs, and the
                call back to the office.
              </p>
              <ul className={`${styles.diffAside} ${styles.proofList}`}>
                <li>Every pool, spa, splash pad, and fountain gets its own record and its own code</li>
                <li>Time-stamped chemical and inspection records, kept by body of water</li>
                <li>Missing documentation is visible before an inspector finds it</li>
                <li>A complete, searchable, downloadable history when someone asks</li>
              </ul>
            </div>

            <div className={styles.visual}>
              <InspectorRecord />
            </div>

            <div className={styles.spotlightCallout}>
              <p className={styles.spotlightCalloutEyebrow}>Save hours per property</p>
              <p>
                <strong>Upload the inspector&rsquo;s report and AquaRunner reads it for you.</strong> Equipment,
                make, model, and serial numbers are pulled out automatically and applied straight to that body of
                water&rsquo;s records — no more retyping what&rsquo;s already sitting right there on the page.
              </p>
            </div>

            <Link href="/features" className={styles.inlineLink}>
              See how compliance works on every feature →
            </Link>
          </div>
        </section>

        {/* ---------- core capability grid ---------- */}
        <section className={styles.sec}>
          <div className={styles.wrap}>
            <div className={styles.secHead}>
              <span className={styles.secNum} aria-hidden="true">
                03
              </span>
              <div className={styles.secHeadText}>
                <p className={styles.eyebrow}>The rest of the job</p>
                <h2 className={styles.displayL}>Everything the day actually needs.</h2>
              </div>
            </div>

            <div className={styles.coreGrid}>
              {CORE_CAPABILITIES.map((c) => (
                <div className={styles.coreCard} key={c.n}>
                  <span className={styles.coreCardNum}>{c.n}</span>
                  <h3>{c.title}</h3>
                  <p>{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- in the field ---------- */}
        <section className={`${styles.onFoam} ${styles.sec}`}>
          <div className={styles.wrap}>
            <div className={styles.secHead}>
              <span className={styles.secNum} aria-hidden="true">
                04
              </span>
              <div className={styles.secHeadText}>
                <p className={styles.eyebrow}>In the field</p>
                <h2 className={styles.displayL}>Built for a phone, in the sun, with one hand free.</h2>
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

            <p className={`${styles.lede} ${styles.ledeWide}`}>
              Mechanical rooms and walled backyards don&rsquo;t always have service. Readings, photos, and doses
              queue on the phone and sync the second a signal comes back — nothing lost, nothing typed twice.
            </p>

            <div className={styles.workflowSteps}>
              {WORKFLOW_STEPS.map((step) => (
                <div className={styles.workflowStep} key={step.n}>
                  <span className={styles.workflowStepNum} aria-hidden="true">
                    {step.n}
                  </span>
                  <h3>{step.role}</h3>
                  <p>{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- why we built this ---------- */}
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
                <cite>Why we built this — the owner, AquaRunner 24/7, Las Vegas</cite>
              </blockquote>
              <div className={styles.quoteRest}>
                <p>
                  We run a commercial pool service company here in Las Vegas. We built AquaRunner for our own techs
                  first, because we wanted a way to make their lives easier — and because we were tired of hunting
                  through a binder every time an inspector pulled up.
                </p>
                <p>
                  Now inspectors get a clean way to view pool reports, customers get a full report by email after
                  every service call with photos attached, and scheduling suggests which tech and which route a new
                  customer belongs on. Every feature in here exists because a day in the field demanded it.
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
                05
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
                  <li>Built by people who service pools every day.</li>
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
