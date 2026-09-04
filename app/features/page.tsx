import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "../components/landing/site-chrome";
import { QrPlacard } from "../components/landing/scan-flow";
import { StateShowcase } from "../components/landing/state-showcase";
import { WaitlistForm } from "../components/landing/waitlist-form";
import styles from "../landing.module.css";

export const metadata: Metadata = {
  title: "Features — AquaRunner 24/7",
  description:
    "A QR code on every body of water, compliance built for your state, and everything else a pool service day actually needs.",
  openGraph: {
    title: "Features — AquaRunner 24/7",
    description: "A QR code on every body of water, and compliance built for your state.",
    type: "website",
  },
};

const FEATURES = [
  {
    n: "01",
    title: "Commercial and residential in one place",
    body: "A quick chemical check at a backyard pool or a full logged visit at a commercial property. You decide which applies to each customer.",
  },
  {
    n: "02",
    title: "Nothing gets lost",
    body: "Chemical readings, photos, and notes save the moment they're entered. No more digging through paper when you need something.",
  },
  {
    n: "03",
    title: "Proof of service",
    body: "Techs take a photo right in the app at each stop. It's automatically timestamped and geotagged—real proof it happened today, not an old photo from a camera roll. Tap any photo to view it full-size.",
  },
  {
    n: "04",
    title: "Routes that build themselves",
    body: "Add a new customer and the app suggests the best tech and route based on where your team already is. You still make the final call.",
    pro: true,
  },
  {
    n: "05",
    title: "Never miss another call",
    body: "After hours or just too busy? The AI phone agent answers, asks what's needed, and turns it into a ticket with caller info, urgency, and a summary—ready in your dashboard when you get back.",
    pro: true,
  },
  {
    n: "06",
    title: "A checklist that's actually yours",
    body: "Starts with a real technician checklist. Add, remove, or reorder anything. Turn individual items off for specific clients without changing what everyone else sees.",
  },
  {
    n: "07",
    title: "A portal just for your customers",
    body: "Give each customer their own login. They see the day's readings, what was dosed, and photos from the visit—plus a link to the full history and a CSV download.",
  },
  {
    n: "08",
    title: "Inspections tracked pool by pool",
    body: "Log the inspector's contact info, last inspection date, and the actual report—per body of water. Properties with multiple pools don't always get inspected on the same day. HOA manager contacts live right alongside it.",
  },
  {
    n: "09",
    title: "Know exactly how much to add",
    body: "Enter today's reading and the app calculates the exact dose to hit target for free chlorine, alkalinity, cyanuric acid, calcium hardness, or salt. It pulls from your chemical catalog and logs the correct units automatically. No more wasting chemicals by guessing how much to put in.",
    pro: true,
  },
  {
    n: "10",
    title: "Keeps working with no signal",
    body: "Backyards and mechanical rooms don't always have service. Readings, photos, and doses queue on the phone and sync the moment a connection returns—nothing lost, nothing re-entered.",
  },
  {
    n: "11",
    title: "Tech sees their expected pay after each stop is complete",
    body: "Set a rate per technician and per body of water. Real earnings total up as visits are logged, motivating them to get all of their pools done and not skip any.",
    pro: true,
  },
  {
    n: "12",
    title: "Equipment records and safety data sheets",
    body: "Pumps, filters, drain covers, and service dates logged per body of water. Enter the date if it's been replaced so you know if it's still under warranty. It's convenient to have that information available to you at any given time. Safety data sheets for every chemical are also available right on the tech's phone and in the customer's portal.",
  },
];

export default function FeaturesPage() {
  return (
    <div className={styles.root}>
      <SiteNav current="features" />

      <main id="main">
        {/* ---------- the two differentiators ---------- */}
        <section className={`${styles.onInk} ${styles.sec} ${styles.diff}`}>
          <div className={styles.wrap}>
            <div className={styles.secHead}>
              <span className={styles.secNum} aria-hidden="true">
                01
              </span>
              <div className={styles.secHeadText}>
                <p className={styles.eyebrow}>What nothing else does</p>
                <h1 className={styles.displayL}>
                  Scan the QR code. Get the current, downloadable records right there on the spot.
                </h1>
              </div>
            </div>

            <div className={styles.diffLead}>
              <p className={styles.lede}>
                AquaRunner was built around two simple things: a QR code for every body of water, and compliance
                rules already set for your state. Together they replace the binder, the water stained logs, and the
                call back to the office.
              </p>
              <p className={styles.diffAside}>
                Every pool, spa, splash pad, or fountain gets its own record and its own code. Nothing gets logged
                against the wrong one again.
              </p>
            </div>

            <hr className={styles.hr} />

            <div className={styles.diffTwo}>
              <div className={styles.diffCol}>
                <span className={styles.diffNum}>Paperless records</span>
                <h3>A QR code for every body of water</h3>
                <p>
                  Each pool, spa, and water feature has its own unique QR code. Techs log visits in the app as they
                  work. Anyone else (an inspector, a customer) can scan the code and see the complete, up-to-date
                  record for that exact venue instantly. No binder. No filing cabinet. No waiting on the office.
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
                  Every state has different public safety laws and commercial pool requirements. AquaRunner is
                  already set up for yours, so technicians are required to log exactly what your state requires on
                  every visit. They can&rsquo;t finish out the job without entering the mandatory fields. Nothing
                  missed, nothing left to memory.
                </p>
                <StateShowcase />
              </div>
            </div>
          </div>
        </section>

        {/* ---------- the rest of the features ---------- */}
        <section className={styles.sec}>
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
                  <div className={styles.featHead}>
                    <span className={styles.featNum}>{feature.n}</span>
                    {feature.pro && <span className={styles.featPro}>Pro</span>}
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </article>
              ))}
            </div>

            <p className={styles.featFoot}>
              <strong>And your customers hear about it.</strong>{" "}
              <span className={styles.muted}>
                Every service call sends them a full emailed report with readings, notes, and photos included.
              </span>
            </p>
          </div>
        </section>

        <section className={`${styles.onFoam} ${styles.sec} ${styles.cta}`} id="waitlist">
          <div className={`${styles.wrap} ${styles.ctaCentered}`}>
            <h2 className={styles.displayL}>Get in before launch.</h2>
            <p className={styles.lede}>
              AquaRunner is in final development. Every plan starts with a 14-day free trial — waitlist members just
              get first access.
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
