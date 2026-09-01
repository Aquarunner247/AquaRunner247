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
    title: "50-State Compliance",
    body: "Keep location-specific requirements, service documentation, and inspection history organized across every state you serve.",
  },
  {
    n: "02",
    title: "Optimized Routes",
    body: "Build efficient technician schedules, reduce drive time, and keep every recurring stop on track.",
  },
  {
    n: "03",
    title: "Recurring Service Plans",
    body: "Set weekly, biweekly, and custom service frequencies once — then keep work flowing automatically.",
  },
  {
    n: "04",
    title: "Digital Field Reports",
    body: "Record readings, chemicals, photos, repairs, notes, and sign-offs from the property.",
  },
  {
    n: "05",
    title: "Live Operations View",
    body: "See completed work, upcoming stops, and overdue tasks across the whole team at a glance.",
  },
  {
    n: "06",
    title: "Customer Portal",
    body: "Give clients self-service access to reports, service history, and updates.",
  },
];

const WORKFLOW_STEPS = [
  {
    n: "01",
    role: "Operations",
    body: "Build schedules, assign routes, and identify exceptions before the day starts.",
  },
  {
    n: "02",
    role: "Technicians",
    body: "Follow the route, complete the checklist, and document work at the property.",
  },
  {
    n: "03",
    role: "Management",
    body: "Review completion, resolve issues, and maintain a reliable history across every account.",
  },
  {
    n: "04",
    role: "Customers",
    body: "Access service documentation and updates without waiting for a call or email.",
  },
];

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
                <h1 className={styles.displayXl}>Streamline pool operations with real-time, always-on digital access.</h1>
                <p className={`${styles.lede} ${styles.heroSub}`}>No more paper logs. One simple price. No per-pool fees.</p>

                <WaitlistForm label="Get on the waitlist" />

                <p className={styles.heroBuilt}>
                  Run your pool business smarter with purpose-built software for seamless operations, compliance, and
                  growth. Built by pool professionals, for pool professionals.
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
                <p className={styles.heroStripLeadText}>
                  <b>One dedicated QR code for each body of water:</b> Designed to be printed, laminated and
                  displayed in the pump room.
                </p>
              </div>
              <div>
                <b>Each code provides instant access to digital logs and historical records.</b>
              </div>
              <div>
                <b>Eliminating paper binders and making inspection preparation faster, easier, and more organized.</b>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- statement band ---------- */}
        <section className={`${styles.onInk} ${styles.band}`}>
          <div className={`${styles.wrap} ${styles.bandGrid}`}>
            <p className={styles.bandQuote}>
              When you need more than a skimmer — dive deeper with AquaRunner 24/7. It&rsquo;s what&rsquo;s below the
              surface that matters.
            </p>
            <div className={styles.bandSide}>
              <p>
                <strong>Prove your pool is safe, every day:</strong> Track what matters most — water quality,
                maintenance checks, and compliance records — in one simple tool. Built by pool professionals for
                real-world operations, AquaRunner makes it easier to keep pools safe, stay accountable, and prove
                every check was completed.
              </p>
              <p>It&rsquo;s in final development now. Join the waitlist for priority access.</p>
            </div>
          </div>
        </section>

        {/* ---------- core capability grid ---------- */}
        <section className={`${styles.onFoam} ${styles.sec}`}>
          <div className={styles.wrap}>
            <div className={styles.secHead}>
              <span className={styles.secNum} aria-hidden="true">
                01
              </span>
              <div className={styles.secHeadText}>
                <p className={styles.eyebrow}>Built for commercial pool operations</p>
                <h2 className={styles.displayL}>One system for every route, record, and requirement.</h2>
              </div>
            </div>

            <p className={`${styles.lede} ${styles.ledeWide}`}>
              AquaRunner connects field technicians, office teams, and customer records in one operational
              platform — so every service visit is scheduled, documented, and ready for review.
            </p>

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

        {/* ---------- compliance spotlight ---------- */}
        <section className={`${styles.onInk} ${styles.sec}`}>
          <div className={styles.wrap}>
            <div className={styles.secHead}>
              <span className={styles.secNum} aria-hidden="true">
                02
              </span>
              <div className={styles.secHeadText}>
                <p className={styles.eyebrow}>Compliance, built into the workflow</p>
                <h2 className={styles.displayL}>STATE SPECIFIC RECORDS — ALWAYS INSPECTION READY</h2>
              </div>
            </div>

            <div className={styles.diffLead}>
              <p className={styles.lede}>
                Compliance doesn&rsquo;t belong in scattered spreadsheets, buried texts, or fading paper logs.
                AquaRunner brings requirements, service histories, and chemical records into one property-centered
                system — built around the regulations your state actually enforces.
              </p>
              <ul className={`${styles.diffAside} ${styles.proofList}`}>
                <li>State-specific requirements organized at the property level</li>
                <li>Time-stamped chemical and inspection records</li>
                <li>Clear visibility into missing documentation</li>
                <li>A complete, searchable service history when an inspector asks</li>
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

        {/* ---------- field-to-office workflow ---------- */}
        <section className={`${styles.onFoam} ${styles.sec}`}>
          <div className={styles.wrap}>
            <div className={styles.secHead}>
              <span className={styles.secNum} aria-hidden="true">
                03
              </span>
              <div className={styles.secHeadText}>
                <p className={styles.eyebrow}>End to end</p>
                <h2 className={styles.displayL}>From the first stop to the final report, everyone stays aligned.</h2>
              </div>
            </div>

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

        {/* ---------- in the field ---------- */}
        <section className={`${styles.onFoam} ${styles.sec}`}>
          <div className={styles.wrap}>
            <div className={styles.secHead}>
              <span className={styles.secNum} aria-hidden="true">
                04
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
