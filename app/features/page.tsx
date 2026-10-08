import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav, SiteFooter } from "../components/landing/site-chrome";
import { QrPlacard } from "../components/landing/scan-flow";
import { StateShowcase } from "../components/landing/state-showcase";
import { WaitlistForm } from "../components/landing/waitlist-form";
import { Section, Eyebrow, DisplayHeading, Card, CardNumber } from "../components/landing/ui";
import styles from "../landing.module.css";

/**
 * The features page, rebuilt to the Marbalism design (design/marbilism/features-desktop.jpg).
 *
 * The sample's shape is kept exactly: numbered groups, each a display headline and lede on one side
 * and a grid of numbered cards on the other, the side alternating and the background cycling
 * cream/white/navy so no two adjacent groups read the same.
 *
 * The sample's card copy is not kept where the code does not back it:
 *  - "Route deviation alerts" -- nothing here detects a technician leaving the route. The bell shows
 *    overdue stops, open issues and out-of-range readings, which is what card 06 now says.
 *  - "Tablet feeder timing" -- lib/dose-product-selection.ts excludes tablet-form products from dosing
 *    on purpose, so the claim is the opposite of what ships. Replaced with the catalog and the safety
 *    data sheets, both real.
 *  - White-label "on the app" -- branding reaches the customer portal and the emails, not the
 *    technician or admin screens, so card 22 says that instead.
 *
 * Features the sample has no card for but the product really has (the phone agent, the checklist,
 * technician pay, per-customer to-dos) get their own group rather than being dropped.
 */

type Feature = { n: string; title: string; body: string };

type Group = {
  num: string;
  eyebrow: string;
  heading: string;
  accent: string;
  lede: string;
  tone: "cream" | "white" | "navy";
  /** Cards on the left, headline on the right -- the sample alternates this every group. */
  cardsFirst: boolean;
  features: Feature[];
};

const GROUPS: Group[] = [
  {
    num: "01",
    eyebrow: "01 / Compliance & inspections",
    heading: "Don't find the missing log",
    accent: "at the inspection.",
    lede:
      "The state requirement is part of the job, not a PDF sitting in a drawer. AquaRunner pre-loads the commercial pool code for every state that has one and will not let a commercial visit close until the required fields are filled in.",
    tone: "white",
    cardsFirst: false,
    features: [
      {
        n: "01",
        title: "State rules in the workflow",
        body: "A technician logs what the state they are standing in requires — not a generic pool-industry checklist. Codes are pre-loaded for the 49 states that have one; Idaho and Mississippi have none, so those fall back to the CDC's Model Aquatic Health Code.",
      },
      {
        n: "02",
        title: "Inspection-ready history",
        body: "Every pool, spa, splash pad, and fountain has its own complete, searchable, downloadable record, with the time each reading was taken.",
      },
      {
        n: "03",
        title: "Pump room QR codes",
        body: "A dedicated code for every body of water opens the current chemical log and inspection history for an inspector or a property manager. Printable and laminate-ready.",
      },
      {
        n: "04",
        title: "Inspections tracked pool by pool",
        body: "The inspector's contact details, the last inspection date, and the report itself, kept per body of water — properties with several pools rarely get inspected on the same day.",
      },
    ],
  },
  {
    num: "02",
    eyebrow: "02 / Route & dispatch",
    heading: "The route is only useful",
    accent: "when it reflects the road.",
    lede:
      "Dispatch around the day you actually have. The office can see skipped, open, and completed work without waiting for a paper sheet to come back at five.",
    tone: "cream",
    cardsFirst: true,
    features: [
      {
        n: "05",
        title: "Real-road optimization",
        body: "Reorder a day in one tap using actual driving times on actual roads, not straight-line guesses between pins.",
      },
      {
        n: "06",
        title: "Alerts while the day is still running",
        body: "Overdue stops, open issues, and out-of-range readings surface in the bell — in time to do something about them, not in tomorrow's post-mortem.",
      },
      {
        n: "07",
        title: "Residential + commercial",
        body: "Run a backyard route, a commercial route, or a hybrid day, from one account and one subscription.",
      },
      {
        n: "08",
        title: "Roles that match the work",
        body: "The office assigns the day, a technician sees their own schedule and nobody else's, management watches the whole route, and the customer sees the result.",
      },
    ],
  },
  {
    num: "03",
    eyebrow: "03 / Field proof",
    heading: "A visit happened. Your record",
    accent: "can prove it.",
    lede:
      "A phone in a technician's pocket should not mean the visit disappears. Arrival, photos, and readings stay attached to the place and the time they happened.",
    tone: "white",
    cardsFirst: false,
    features: [
      {
        n: "09",
        title: "Background arrival",
        body: "Geofenced arrival records the stop with the phone in a pocket and the screen off. Nobody has to remember to tap anything.",
      },
      {
        n: "10",
        title: "Photo quality checks",
        body: "Photos taken in the app are timestamped and geotagged, and a blur check flags a soft photo before the technician drives away.",
      },
      {
        n: "11",
        title: "Offline queue",
        body: "Pump rooms and gated properties lose signal constantly. Readings, doses, and photos queue on the device and sync themselves when a connection returns.",
      },
      {
        n: "12",
        title: "Automatic service reports",
        body: "A laid-out report — arrival and completion time, readings, chemicals dosed, checklist, and photos — goes out after every visit without anyone in the office rebuilding the story by hand.",
      },
    ],
  },
  {
    num: "04",
    eyebrow: "04 / Chemistry & dosage",
    heading: "The dose should be right",
    accent: "before the tech drives away.",
    lede:
      "Give technicians one source of truth at the pool. Keep the reading, the calculated dose, and the proof of service together instead of in three places.",
    tone: "navy",
    cardsFirst: true,
    features: [
      {
        n: "13",
        title: "Taylor-based dosing",
        body: "Enter today's reading and the exact dose to hit target is calculated for free chlorine, alkalinity, cyanuric acid, calcium hardness, and salt — against that pool's own volume, using Taylor's published numbers.",
      },
      {
        n: "14",
        title: "Your own chemical catalog",
        body: "Doses come from the products you actually carry and are logged in the right units automatically, so what is recorded matches what was poured.",
      },
      {
        n: "15",
        title: "Never over-chlorinates",
        body: "A pool already above its own ceiling is never told to add more. The reading is logged and the recommendation stops.",
      },
      {
        n: "16",
        title: "Safety data sheets on the phone",
        body: "The sheet for every chemical used on a property is one tap away in the field, and in that customer's portal.",
      },
    ],
  },
  {
    num: "05",
    eyebrow: "05 / The office, between visits",
    heading: "The work around the route",
    accent: "is where time disappears.",
    lede:
      "Phone calls, one-off promises, and the things somebody meant to get back to. These are the parts of the week that never make it onto a schedule.",
    tone: "cream",
    cardsFirst: false,
    features: [
      {
        n: "17",
        title: "An AI phone agent that knows the account",
        body: "After hours or mid-route, it answers and holds an actual conversation. For a returning customer it pulls up the real account — next visit, last visit, who their technician is. Anything it cannot settle becomes a ticket with the caller, the urgency, and a summary waiting in the dashboard.",
      },
      {
        n: "18",
        title: "A checklist that is actually yours",
        body: "Starts as a real technician checklist. Add, remove, or reorder anything, and switch individual items off for one customer without changing what everyone else sees.",
      },
      {
        n: "19",
        title: "To-dos per customer",
        body: "What needs doing, an optional due date, and how far ahead you want to be reminded. Anything due appears in the bell with the customer's name, and arrives again each morning in one email.",
      },
      {
        n: "20",
        title: "Technicians see their own pay",
        body: "Set a rate per technician and per body of water, and the day's earnings total up as visits are logged.",
      },
    ],
  },
  {
    num: "06",
    eyebrow: "06 / Customer & inspector portals",
    heading: "Give access without giving",
    accent: "away the office.",
    lede:
      "Customers and inspectors see the record they need: readings, doses, photos, and history. You keep control of the route and the data behind it.",
    tone: "white",
    cardsFirst: true,
    features: [
      {
        n: "21",
        title: "Customer login",
        body: "A portal for the day's readings, what was dosed, the photos from the visit, and the full history for the property — without a phone call to the office.",
      },
      {
        n: "22",
        title: "A maintenance login that only logs",
        body: "A customer's own maintenance person or CPO can keep the daily log and read the safety data sheets, and see nothing else. Their readings never overwrite your technician's.",
      },
      {
        n: "23",
        title: "CSV history",
        body: "The complete record, downloadable, for the customer or the operator who needs to take it somewhere else.",
      },
      {
        n: "24",
        title: "Your brand, not ours",
        body: "Upload your logo, set your colours, and write the welcome email your customers get. Every time they look at a visit, they see your business — on the portal and on every email that reaches them.",
      },
    ],
  },
  {
    num: "07",
    eyebrow: "07 / Document scanner",
    heading: "Turn a stack of pages into",
    accent: "a searchable record.",
    lede:
      "Keep the details where technicians and managers can find them on the next visit — not buried in a binder in an office nobody is at.",
    tone: "cream",
    cardsFirst: true,
    features: [
      {
        n: "25",
        title: "Upload the report",
        body: "Add an inspector's report from the field or the office without retyping every equipment label.",
      },
      {
        n: "26",
        title: "Extract the details",
        body: "Equipment makes, models, and serial numbers are pulled out and filed into the right body-of-water record, alongside pumps, filters, drain covers, and service dates.",
      },
    ],
  },
];

export const metadata: Metadata = {
  title: "Features — AquaRunner 24/7",
  description:
    "State compliance enforced in the workflow, a QR code on every body of water, real-road routing, offline capture, Taylor-based dosing, and a portal your customers can read. Everything a pool service day actually needs.",
  openGraph: {
    title: "Features — AquaRunner 24/7",
    description: "A QR code on every body of water, and compliance built for your state.",
    type: "website",
    url: "/features",
    siteName: "AquaRunner 24/7",
    images: [{ url: "/og/features.png", width: 1200, height: 630, alt: "AquaRunner 24/7 features — a QR code on every body of water." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Features — AquaRunner 24/7",
    description: "A QR code on every body of water, and compliance built for your state.",
    images: ["/og/features.png"],
  },
};

function FeatureCards({ features, tone }: { features: Feature[]; tone: Group["tone"] }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {features.map((feature) => (
        // On the navy group the cards stay white, as in the sample -- they are the lit element of
        // that section, and a Deep Sea card there would disappear into the background.
        <Card key={feature.n} lift={tone !== "navy"}>
          <CardNumber>{feature.n}</CardNumber>
          <h3 className="mt-4 font-sans text-base font-bold text-brand-ink">{feature.title}</h3>
          <p className="mt-2 font-sans text-sm leading-relaxed text-brand-muted">{feature.body}</p>
        </Card>
      ))}
    </div>
  );
}

export default function FeaturesPage() {
  return (
    <div className={`bg-brand-surface ${styles.tokens}`}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-brand-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <SiteNav current="features" />

      <main id="main">
        {/* ---------- hero ---------- */}
        <section className="bg-brand-ink px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <div className="mx-auto max-w-6xl">
            <Eyebrow>The work behind a clean report</Eyebrow>
            <div className="mt-4 h-1 w-24 bg-brand-cta" aria-hidden="true" />
            <DisplayHeading as="h1" tone="dark" accent="and the code visible." className="mt-6 max-w-4xl">
              The app that keeps the route moving
            </DisplayHeading>
            <p className="mt-6 max-w-2xl font-sans text-lg leading-relaxed text-brand-mutedOnDark">
              AquaRunner 24/7 connects commercial compliance, field work, and customer proof in one place. The
              technician gets the right checklist; the office gets the right record.
            </p>
          </div>
        </section>

        {/* ---------- the two differentiators ---------- */}
        {/* These two are why the product exists, so they get the room the sample gives its hero rather
            than a card each in the grid below. */}
        <Section tone="cream">
          <Eyebrow>What nothing else does</Eyebrow>
          <DisplayHeading accent="right there on the spot." className="mt-4 max-w-4xl">
            Scan the QR code. Get the current, downloadable record
          </DisplayHeading>
          <p className="mt-6 max-w-3xl font-sans text-base leading-relaxed text-brand-muted">
            AquaRunner was built around two things: a QR code for every body of water, and compliance rules already set
            for your state. Together they replace the binder, the water-stained log sheet, and the call back to the
            office. Every pool, spa, splash pad, or fountain gets its own record and its own code, so nothing is ever
            logged against the wrong one again.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <Eyebrow>Paperless records</Eyebrow>
              <h3 className="mt-3 font-marketing text-2xl font-black uppercase italic tracking-[-0.03em] text-brand-ink">
                A QR code for every body of water
              </h3>
              <p className="mt-3 font-sans text-sm leading-relaxed text-brand-muted">
                Each pool, spa, and water feature has its own code. Technicians log visits in the app as they work.
                Anyone else — an inspector, a property manager — scans the code and sees the complete, current record
                for that exact venue. No binder, no filing cabinet, no waiting on the office.
              </p>
              <div className="mt-6">
                <QrPlacard />
              </div>
              <p className="mt-4 font-sans text-xs text-brand-muted">
                One code per body of water — pool, spa, splash pad, fountain.
              </p>
            </Card>

            {/* Dark on purpose: StateShowcase's own classes (.checks, .stateMore) are written in
                --text-light, a cream at 78% meant for a dark band. On a white card they vanish. */}
            <Card tone="dark">
              <Eyebrow>State rules</Eyebrow>
              <h3 className="mt-3 font-marketing text-2xl font-black uppercase italic tracking-[-0.03em] text-white">
                Built for state compliance
              </h3>
              <p className="mt-3 font-sans text-sm leading-relaxed text-brand-mutedOnDark">
                Every state writes its own public-safety and commercial pool requirements. AquaRunner is already set up
                for yours, so a technician is required to log exactly what your state asks for on every visit — and
                cannot close the job without it. Nothing missed, nothing left to memory.
              </p>
              <div className="mt-6">
                <StateShowcase />
              </div>
            </Card>
          </div>
        </Section>

        {/* ---------- the numbered groups ---------- */}
        {GROUPS.map((group) => (
          <Section key={group.num} tone={group.tone}>
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14">
              <div className={group.cardsFirst ? "lg:order-2" : ""}>
                <Eyebrow>{group.eyebrow}</Eyebrow>
                <DisplayHeading tone={group.tone === "navy" ? "dark" : "light"} accent={group.accent} className="mt-4">
                  {group.heading}
                </DisplayHeading>
                <p
                  className={`mt-6 font-sans text-base leading-relaxed ${
                    group.tone === "navy" ? "text-brand-mutedOnDark" : "text-brand-muted"
                  }`}
                >
                  {group.lede}
                </p>
              </div>
              <div className={group.cardsFirst ? "lg:order-1" : ""}>
                <FeatureCards features={group.features} tone={group.tone} />
              </div>
            </div>
          </Section>
        ))}

        {/* ---------- closing waitlist ---------- */}
        <Section tone="navy" id="waitlist">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Launching soon</Eyebrow>
            <DisplayHeading tone="dark" accent="before launch." className="mt-4">
              Get in
            </DisplayHeading>
            <p className="mt-6 font-sans text-base leading-relaxed text-brand-mutedOnDark">
              AquaRunner is in final development. Join the waitlist and you will hear from us when it opens — nothing
              before then.
            </p>
            <div className="mt-8 text-left">
              <WaitlistForm label="Get on the waitlist" tone="dark" />
            </div>
            <Link href="/pricing" className="mt-8 inline-block font-sans text-base font-bold text-brand-cta hover:underline">
              See what it costs &rarr;
            </Link>
          </div>
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}
