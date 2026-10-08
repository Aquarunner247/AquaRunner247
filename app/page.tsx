import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteNav, SiteFooter } from "./components/landing/site-chrome";
import { WaitlistForm } from "./components/landing/waitlist-form";
import { InspectorRecord, QrPlacard } from "./components/landing/scan-flow";
import { AppPreview } from "./components/landing/app-preview";
import { Section, Eyebrow, DisplayHeading, PrimaryButton, SecondaryButton, Card, CardNumber } from "./components/landing/ui";
import styles from "./landing.module.css";

/**
 * The marketing home page, rebuilt to the Marbalism design (design/marbilism/).
 *
 * Three claims from the handoff's copy are NOT used, because the code does not back them. Each is
 * replaced with something true rather than softened:
 *
 *  - "Route deviation alerts" appeared as a headline stat and again as a feature. Nothing in this
 *    product detects a technician going off-route; the bell shows overdue stops, open issues and
 *    out-of-range readings. Replaced with offline capture, which is real and is not the headline of
 *    any other section.
 *  - "Tablet feeder timing" in the dosage calculator. lib/dose-product-selection.ts excludes
 *    tablet-form products on purpose -- an erosion feeder releases chlorine continuously rather than
 *    as a dose -- so the claim is the opposite of what ships.
 *  - White-label "on the app". Branding reaches the customer portal and the emails, not the
 *    technician or admin screens, so the promise is stated at that scope.
 *
 * Every CTA is the waitlist. The handoff sells a 2-week free trial; signups are deliberately
 * Preview-only until launch, and a button promising one would be the most prominent false claim here.
 */

const RUN_THE_DAY = [
  {
    title: "Commercial",
    body: "The full state-mandated inspection checklist, equipment records, property contacts, and a body-of-water record that cannot close until requirements are met.",
    points: ["State chemistry and inspection requirements", "Equipment and drain-cover details", "QR-ready history for inspectors"],
  },
  {
    title: "Residential",
    body: "A faster stop built around what matters at a backyard pool: readings, gate codes, parking instructions, pet warnings, photos, and an emailed report.",
    points: ["Chemistry check", "Gate code and visit photo", "Report sent when the stop closes"],
  },
  {
    title: "Hybrid",
    body: "Residential route, commercial route, or a mix of both. Your technician sees the right checklist at the right stop without switching apps or subscriptions.",
    points: ["Commercial properties in the morning", "Residential route in the afternoon", "One subscription either way"],
  },
];

const FEATURES = [
  { n: "01", title: "Route optimization", body: "Reorder the day in one tap using real drive times on actual roads, not straight lines." },
  { n: "02", title: "Arrival and visit proof", body: "Geofenced arrival, timestamped and geotagged photos, and a blur check before a photo is accepted." },
  { n: "03", title: "Dosage calculator", body: "Taylor-based doses for chlorine, alkalinity, cyanuric acid, calcium hardness, and salt, against that pool's own volume." },
  { n: "04", title: "Document scanner", body: "Upload an inspector report and the equipment makes, models, and serial numbers are pulled into the right record." },
  { n: "05", title: "Customer portals", body: "Customers see readings, doses, photos, and a complete downloadable history without calling the office." },
  { n: "06", title: "Office alerts", body: "Overdue stops, open issues, and out-of-range readings surface while the day is still running." },
  { n: "07", title: "Automatic reports", body: "A service report with photos goes out after every visit, and the record stays searchable afterwards." },
  { n: "08", title: "Nothing lost to signal", body: "Work done in a pump room saves on the device and syncs itself once there is a signal again." },
  { n: "09", title: "White-label ready", body: "Your name, your logo, your colours on the customer portal and every email that reaches your customers." },
];

export const metadata: Metadata = {
  title: "AquaRunner 24/7 — Commercial pool compliance, enforced in the app",
  description:
    "A technician cannot close out a commercial pool that fails state requirements. AquaRunner puts the code inside the workflow — with residential routes in the same subscription, and no per-pool fees. Join the waitlist.",
  openGraph: {
    title: "AquaRunner 24/7 — Commercial pool compliance, enforced in the app",
    description:
      "Commercial pool compliance enforced in the workflow, residential routes in the same subscription, and a QR code on every body of water. Built by pool professionals in Las Vegas, Nevada.",
    type: "website",
    url: "/",
    siteName: "AquaRunner 24/7",
    images: [{ url: "/og/home.png", width: 1200, height: 630, alt: "AquaRunner 24/7 — commercial pool compliance, enforced in the app" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AquaRunner 24/7 — Commercial pool compliance, enforced in the app",
    description:
      "Commercial pool compliance enforced in the workflow, residential routes in the same subscription, and a QR code on every body of water.",
    images: ["/og/home.png"],
  },
};

export default function Home() {
  return (
    <div className={`bg-brand-surface ${styles.tokens}`}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-brand-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <SiteNav current="home" />

      <main id="main">
        {/* ---------- hero ---------- */}
        {/* The photograph bleeds to the right edge and runs the full height of the hero, as in the
            handoff -- a contained, rounded image floating beside the text reads as a screenshot of a
            website rather than the thing itself. Below lg it stacks under the copy at a fixed height. */}
        <section className="relative bg-brand-ink lg:min-h-[640px]">
          <div className="absolute inset-y-0 right-0 hidden w-[46%] lg:block">
            <Image
              src="/marketing/hero-pool.jpg"
              alt="A commercial pool at a Las Vegas property"
              fill
              sizes="46vw"
              className="object-cover"
              priority
            />
            <span className="absolute bottom-6 left-6 rounded-md bg-brand-ink/85 px-3 py-1.5 font-marketing text-xs font-bold uppercase italic tracking-[0.12em] text-white">
              Las Vegas, Nevada
            </span>
          </div>

          <div className="relative mx-auto grid grid-cols-1 max-w-6xl items-center gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:gap-14 lg:px-12 lg:py-28">
            <div>
              <Eyebrow>Built by commercial pool operators in Las Vegas</Eyebrow>
              <div className="mt-4 h-1 w-24 bg-brand-cta" aria-hidden="true" />
              <DisplayHeading as="h1" tone="dark" accent="enforced in the app." className="mt-6">
                Commercial pool compliance,
              </DisplayHeading>
              <p className="mt-6 max-w-xl font-sans text-lg leading-relaxed text-brand-mutedOnDark">
                A technician cannot close out a commercial pool that fails state requirements. AquaRunner 24/7 puts the
                code inside the workflow — with residential routes in the same subscription.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <PrimaryButton href="#waitlist">Join the waitlist</PrimaryButton>
                <SecondaryButton href="/features" tone="dark">
                  See what it does
                </SecondaryButton>
              </div>
            </div>

            {/* Phone and tablet: the same photograph, stacked under the copy rather than bled. */}
            <div className="relative h-64 overflow-hidden rounded-2xl sm:h-80 lg:hidden">
              <Image
                src="/marketing/hero-pool.jpg"
                alt="A commercial pool at a Las Vegas property"
                fill
                sizes="100vw"
                className="object-cover"
                priority
              />
              <span className="absolute bottom-4 left-4 rounded-md bg-brand-ink/85 px-3 py-1.5 font-marketing text-xs font-bold uppercase italic tracking-[0.12em] text-white">
                Las Vegas, Nevada
              </span>
            </div>
          </div>
        </section>

        {/* ---------- stat band ---------- */}
        <Section tone="cream" tight>
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8">
            {[
              {
                n: "49",
                title: "States' health codes enforced",
                body: "Commercial pool regulations are pre-loaded and visible before a missing log becomes an inspection problem.",
              },
              {
                n: "02",
                title: "Works with no signal",
                body: "Pump rooms and gated properties lose service constantly. Readings, photos, and doses save on the device and sync themselves afterwards.",
              },
              {
                n: "03",
                title: "No per-pool fees, ever",
                body: "One flat monthly subscription for every body of water you service — residential, commercial, or both.",
              },
            ].map((stat, i) => (
              <div key={stat.n} className={i > 0 ? "sm:border-l sm:border-brand-border sm:pl-8" : ""}>
                <p className="font-marketing text-5xl font-black italic leading-none text-brand-cta">{stat.n}</p>
                <h2 className="mt-3 font-marketing text-xl font-black uppercase italic leading-tight tracking-[-0.03em] text-brand-ink">
                  {stat.title}
                </h2>
                <p className="mt-3 font-sans text-sm leading-relaxed text-brand-muted">{stat.body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ---------- one account, three ways ---------- */}
        <Section tone="white">
          <Eyebrow>The workflow changes with the pool</Eyebrow>
          <DisplayHeading accent="to run the day." className="mt-4 max-w-4xl">
            One account. Three ways
          </DisplayHeading>
          <p className="mt-6 max-w-2xl font-sans text-base leading-relaxed text-brand-muted">
            A backyard stop should not feel like a hotel inspection. A commercial property should not be managed with a
            residential checklist. AquaRunner adapts to the pool in front of your technician.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {RUN_THE_DAY.map((col, i) => (
              <Card key={col.title} tone={i === 0 ? "dark" : "light"} lift>
                <h3 className="font-marketing text-2xl font-black uppercase italic tracking-[-0.03em] text-brand-cta">
                  {col.title}
                </h3>
                <p className={`mt-3 font-sans text-sm leading-relaxed ${i === 0 ? "text-brand-mutedOnDark" : "text-brand-muted"}`}>
                  {col.body}
                </p>
                <ul className="mt-5 space-y-2">
                  {col.points.map((point) => (
                    <li key={point} className={`flex gap-2 font-sans text-sm ${i === 0 ? "text-white" : "text-brand-ink"}`}>
                      <span aria-hidden="true" className="text-brand-cta">
                        ✓
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </Section>

        {/* ---------- compliance ---------- */}
        <Section tone="navy">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.4fr)] lg:gap-14">
            <div>
              <Eyebrow>Compliance you can show</Eyebrow>
              <DisplayHeading tone="dark" accent="compliance system." className="mt-4">
                Your binder is not a
              </DisplayHeading>
              <p className="mt-6 font-sans text-base leading-relaxed text-brand-mutedOnDark">
                AquaRunner keeps a time-stamped record for every pool, spa, splash pad, and fountain. Missing
                documentation is visible before an inspector finds it. Scan the pump-room code and the current history is
                right there.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {["Searchable", "Downloadable", "No login needed"].map((chip) => (
                  <span key={chip} className="rounded-md border border-white/20 px-3 py-1.5 font-sans text-xs font-bold text-white">
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            {/* The placard and the record belong in the same column, in that order: the section's claim
                is the pairing -- the code that hangs in the pump room, then what scanning it opens. */}
            <div>
              <InspectorRecord />
              <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                <div className="max-w-[300px]">
                  <QrPlacard />
                </div>
                <div className="rounded-2xl border border-white/10 bg-brand-anchor p-6">
                  <h3 className="font-marketing text-lg font-black uppercase italic tracking-[-0.03em] text-white">
                    One code per body of water.
                  </h3>
                  <p className="mt-2 font-sans text-sm leading-relaxed text-brand-mutedOnDark">
                    Give health inspectors and property managers a live, time-stamped record without handing over a
                    binder.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* ---------- feature grid ---------- */}
        <Section tone="cream">
          <Eyebrow>Everything else it does</Eyebrow>
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
            <DisplayHeading accent="More proof.">Fewer loose ends.</DisplayHeading>
            <p className="font-sans text-base leading-relaxed text-brand-muted">
              The daily work around the checklist is where time disappears. AquaRunner closes those gaps from dispatch
              through to the customer report.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card key={feature.n} lift>
                <CardNumber>{feature.n}</CardNumber>
                <h3 className="mt-4 font-sans text-base font-bold text-brand-ink">{feature.title}</h3>
                <p className="mt-2 font-sans text-sm leading-relaxed text-brand-muted">{feature.body}</p>
              </Card>
            ))}
          </div>
        </Section>

        {/* ---------- the day in one view ---------- */}
        <Section tone="white">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
            <div>
              <Eyebrow>The day, in one view</Eyebrow>
              <DisplayHeading accent="Keep the record." className="mt-4">
                Run the route.
              </DisplayHeading>
              <p className="mt-6 font-sans text-base leading-relaxed text-brand-muted">
                Your technician sees what is next, what changed, and what still needs attention. The office sees the same
                truth without a phone call. No paper handoff required.
              </p>
              <dl className="mt-8 space-y-5">
                <div>
                  <dt className="font-sans text-base font-bold text-brand-ink">Automated arrival</dt>
                  <dd className="mt-1 font-sans text-sm leading-relaxed text-brand-muted">
                    Phone in pocket, screen off. The visit still gets recorded.
                  </dd>
                </div>
                <div>
                  <dt className="font-sans text-base font-bold text-brand-ink">Service proof</dt>
                  <dd className="mt-1 font-sans text-sm leading-relaxed text-brand-muted">
                    Photos are geotagged, timestamped, and checked for blur before the technician leaves.
                  </dd>
                </div>
              </dl>
            </div>
            <AppPreview />
          </div>
        </Section>

        {/* ---------- why it exists ---------- */}
        <Section tone="navy" tight>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
            <div>
              <Eyebrow>Why it exists</Eyebrow>
              <DisplayHeading tone="dark" accent="the pump room up." className="mt-4">
                Built from
              </DisplayHeading>
              <p className="mt-6 font-sans text-base leading-relaxed text-brand-mutedOnDark">
                AquaRunner 24/7 was built by an active commercial pool service company in Las Vegas, Nevada. It started
                with what their own technicians needed: a route that knows the difference between a backyard pool and a
                regulated commercial property, and a record that holds up when someone asks to see it.
              </p>
              <Link href="/features" className="mt-6 inline-block font-sans text-base font-bold text-brand-cta hover:underline">
                See the full feature breakdown →
              </Link>
            </div>
            <figure className="border-l-4 border-brand-cta pl-6">
              <blockquote className="font-serif text-2xl italic leading-snug text-white">
                &ldquo;Paper logs are a thing of the past. It&rsquo;s a godsend, really.&rdquo;
              </blockquote>
              <figcaption className="mt-4 font-marketing text-xs font-bold uppercase italic tracking-[0.12em] text-brand-mutedOnDark">
                Built by pool professionals in Las Vegas
              </figcaption>
            </figure>
          </div>
        </Section>

        {/* ---------- white label ---------- */}
        <Section tone="cream">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
            <div>
              <Eyebrow>The service company&rsquo;s brand, every portal</Eyebrow>
              <DisplayHeading accent="Not ours." className="mt-4">
                Your name on the portal.
              </DisplayHeading>
              <p className="mt-6 font-sans text-base leading-relaxed text-brand-muted">
                A pool service company that subscribes to AquaRunner can put its own name, logo, and colours on the
                customer portal and on every email that reaches its customers, in place of ours. To the homeowner or
                property manager on the other end, it is the service company they already know.
              </p>
            </div>
            <Card className="lg:ml-auto lg:max-w-md">
              <p className="font-marketing text-xs font-bold uppercase italic tracking-[0.12em] text-brand-cta">
                Sunrise Apartments
              </p>
              <h3 className="mt-2 font-sans text-lg font-bold text-brand-ink">Property record</h3>
              <dl className="mt-4 space-y-3 font-sans text-sm">
                {[
                  ["Today's readings", "9 logged"],
                  ["Last inspection", "Pass"],
                  ["Complete history", "Downloadable as CSV"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-brand-border pb-3">
                    <dt className="text-brand-muted">{k}</dt>
                    <dd className="font-bold text-brand-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 font-sans text-xs text-brand-muted">Updated after every visit · photos included</p>
            </Card>
          </div>
        </Section>

        {/* ---------- closing waitlist ---------- */}
        <Section tone="navy" id="waitlist">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow className="justify-center">Launching soon</Eyebrow>
            <DisplayHeading tone="dark" accent="into the same system." className="mt-4">
              Bring every pool
            </DisplayHeading>
            <p className="mt-6 font-sans text-base leading-relaxed text-brand-mutedOnDark">
              No per-pool fees, and no demo call standing between you and a better route. Join the waitlist and you will
              hear from us when it opens — nothing before then.
            </p>
            <div className="mt-8 text-left">
              <WaitlistForm label="Get on the waitlist" tone="dark" />
            </div>
          </div>
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}
