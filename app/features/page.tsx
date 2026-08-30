import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "../components/landing/site-chrome";
import { InspectorRecord, QrPlacard } from "../components/landing/scan-flow";
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
    body: "Techs snap a photo right in the app at each stop, timestamped and geotagged automatically. Real proof it happened today, not an old photo pulled from a camera roll — tap any photo to pull it up full-size.",
  },
  {
    n: "04",
    title: "Routes that build themselves",
    body: "Add a new customer and the app suggests which tech and route makes the most sense based on where your team already is. You always get the final say.",
    pro: true,
  },
  {
    n: "05",
    title: "Never miss another call",
    body: "After hours or too busy to pick up? Our AI phone agent answers, asks what's needed, and turns it into a ticket — caller info, urgency, and a summary — waiting in your dashboard before you're back at your desk.",
    pro: true,
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
  {
    n: "09",
    title: "Know exactly how much to add",
    body: "Enter today's reading and the app calculates the exact dose to hit target — free chlorine, alkalinity, cyanuric acid, calcium hardness, salt — linked to your chemical catalog so it logs in the right units automatically.",
    pro: true,
  },
  {
    n: "10",
    title: "Keeps working with no signal",
    body: "Backyards and mechanical rooms don't always have bars. Readings, photos, and doses queue right on the phone and sync the moment a connection comes back — nothing lost, nothing re-entered.",
  },
  {
    n: "11",
    title: "Pay techs on what they actually did",
    body: "Set a rate per technician, per body of water, and watch real earnings total up as visits get logged — no separate spreadsheet, no guessing at the end of the pay period.",
    pro: true,
  },
  {
    n: "12",
    title: "Equipment records and safety data sheets",
    body: "Pumps, filters, drain covers, and service dates logged per body of water. Safety data sheets for every chemical pull up right on a tech's phone, on site — no digging through a binder.",
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
                  Scan the pool. See the whole record. Log exactly what your state requires.
                </h1>
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
                Every service call sends the customer a comprehensive emailed report — readings, notes, and photos
                included.
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
