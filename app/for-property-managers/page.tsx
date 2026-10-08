import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "../components/landing/site-chrome";
import { QrPlacard } from "../components/landing/scan-flow";
import { StateShowcase } from "../components/landing/state-showcase";
import { WaitlistForm } from "../components/landing/waitlist-form";
import { Section, Eyebrow, DisplayHeading, Card } from "../components/landing/ui";
import styles from "../landing.module.css";

/**
 * AquaRunner Compliance, for a property that employs its own CPO rather than a service company.
 *
 * The Marbalism sample has no equivalent page, so this one is built from the same primitives and the
 * same rhythm as the others rather than from a reference screenshot. Its content is unchanged from
 * the version that shipped -- the $19 price, the single-operator framing, and the two differentiators
 * are all still accurate.
 */

export const metadata: Metadata = {
  title: "AquaRunner Compliance — for properties with an in-house CPO",
  description:
    "Your CPO already keeps the pool right. AquaRunner Compliance gives every body of water a QR code and a log built for your state's rules, so an inspector sees the complete record on site. $19/month, no per-pool fees.",
  openGraph: {
    title: "AquaRunner Compliance — for properties with an in-house CPO",
    description:
      "A QR code and state-specific compliance log for every body of water your in-house CPO maintains. $19/month.",
    type: "website",
    url: "/for-property-managers",
    siteName: "AquaRunner 24/7",
    images: [{ url: "/og/compliance.png", width: 1200, height: 630, alt: "AquaRunner Compliance — your CPO keeps the water right, AquaRunner proves it." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AquaRunner Compliance — for properties with an in-house CPO",
    description: "A QR code and state-specific compliance log for every body of water your in-house CPO maintains. $19/month.",
    images: ["/og/compliance.png"],
  },
};

const STRIP = [
  {
    title: "Built for one person, not a crew",
    body: "Your CPO logs their own readings directly. No technician dispatch, no route to manage, nothing to ignore.",
  },
  {
    title: "Configured to your state's rules",
    body: "They log exactly what your health department requires — nothing missed, nothing memorised.",
  },
  {
    title: "Inspection-ready, always",
    body: "Scan the code and the current record is right there, without waiting on an office to email something over.",
  },
];

export default function ForPropertyManagersPage() {
  return (
    <div className={`bg-brand-surface ${styles.tokens}`}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-brand-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <SiteNav current="property-managers" />

      <main id="main">
        {/* ---------- hero ---------- */}
        <section className="bg-brand-ink px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <div className="mx-auto grid grid-cols-1 max-w-6xl gap-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-center lg:gap-14">
            <div>
              <Eyebrow>AquaRunner Compliance &middot; for properties with an in-house CPO</Eyebrow>
              <div className="mt-4 h-1 w-24 bg-brand-cta" aria-hidden="true" />
              {/* The product name sits in the eyebrow rather than the headline: as an accent fragment it
                  ran to two coral lines, which is more accent than the rule intends. */}
              <DisplayHeading as="h1" tone="dark" accent="AquaRunner proves it." className="mt-6">
                Your CPO keeps the water right.
              </DisplayHeading>
              <p className="mt-6 max-w-xl font-sans text-lg leading-relaxed text-brand-mutedOnDark">
                Every body of water gets a QR code and a compliance log built for your state&rsquo;s rules — so when an
                inspector shows up, the complete record is right there on site, not in a binder your CPO has to go dig
                up.
              </p>
              <div className="mt-8 max-w-md">
                <WaitlistForm label="Get on the waitlist" tone="dark" />
              </div>
              <p className="mt-6 max-w-xl font-sans text-sm leading-relaxed text-brand-mutedOnDark">
                $19/month, flat. No per-pool fees, and none of the routing and scheduling you would never touch — just
                the compliance record your CPO has to keep anyway.
              </p>
            </div>

            <div className="lg:justify-self-end">
              <QrPlacard />
            </div>
          </div>
        </section>

        {/* ---------- what it is, in three lines ---------- */}
        <Section tone="cream" tight>
          <div className="grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8">
            {STRIP.map((item, i) => (
              <div key={item.title} className={i > 0 ? "sm:border-l sm:border-brand-border sm:pl-8" : ""}>
                <h2 className="font-marketing text-xl font-black uppercase italic leading-tight tracking-[-0.03em] text-brand-ink">
                  {item.title}
                </h2>
                <p className="mt-3 font-sans text-sm leading-relaxed text-brand-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ---------- the liability statement ---------- */}
        <Section tone="navy" tight>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
            <figure className="border-l-4 border-brand-cta pl-6">
              <blockquote className="font-serif text-2xl italic leading-snug text-white">
                A missing log isn&rsquo;t just a paperwork problem — it&rsquo;s a liability question the moment an
                inspector or an attorney asks for it.
              </blockquote>
            </figure>
            <div className="space-y-4 font-sans text-base leading-relaxed text-brand-mutedOnDark">
              <p>
                Your CPO is already testing the water and keeping their own notes. AquaRunner Compliance turns that work
                into a record that is always current, always on hand, and built around exactly what your state requires
                — not a generic checklist someone downloaded.
              </p>
              <p>It is in final development now. Waitlist members get in first.</p>
            </div>
          </div>
        </Section>

        {/* ---------- the two differentiators ---------- */}
        <Section tone="cream">
          <Eyebrow>What this actually gives you</Eyebrow>
          <DisplayHeading accent="Nothing to chase down." className="mt-4 max-w-4xl">
            Scan the pool. See the whole record.
          </DisplayHeading>
          <p className="mt-6 max-w-3xl font-sans text-base leading-relaxed text-brand-muted">
            Two things sit at the centre of AquaRunner Compliance: a QR code on every single body of water, and a
            compliance setup that already knows your state&rsquo;s commercial pool rules. Together they replace the
            binder, the clipboard, and the phone call asking your CPO to email something over. Pool, spa, splash pad,
            fountain — each one is its own record with its own code, so nothing is ever logged against the wrong one.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <Eyebrow>Paperless records</Eyebrow>
              <h3 className="mt-3 font-marketing text-2xl font-black uppercase italic tracking-[-0.03em] text-brand-ink">
                A QR code on every body of water
              </h3>
              <p className="mt-3 font-sans text-sm leading-relaxed text-brand-muted">
                Each pool, spa, and water feature gets its own code — printable and laminate-ready for the pump room or
                the gate. Your CPO logs each reading in the app. Scan that same code and an inspector standing on site
                sees the complete, current record for that exact pool. No binder, no filing cabinet.
              </p>
              <div className="mt-6">
                <QrPlacard />
              </div>
              <p className="mt-4 font-sans text-xs text-brand-muted">
                One code per body of water — pool, spa, splash pad, fountain.
              </p>
            </Card>

            {/* Dark on purpose: StateShowcase's own classes are written in --text-light, a cream meant
                for a dark band, and disappear on a white card. */}
            <Card tone="dark">
              <Eyebrow>State rules</Eyebrow>
              <h3 className="mt-3 font-marketing text-2xl font-black uppercase italic tracking-[-0.03em] text-white">
                Built for your state&rsquo;s compliance code
              </h3>
              <p className="mt-3 font-sans text-sm leading-relaxed text-brand-mutedOnDark">
                Every state writes its own commercial pool requirements. AquaRunner Compliance is configured to yours,
                so your CPO logs exactly what that state asks for at every reading — nothing missed, nothing left to
                memory.
              </p>
              <div className="mt-6">
                <StateShowcase />
              </div>
            </Card>
          </div>
        </Section>

        {/* ---------- closing waitlist ---------- */}
        <Section tone="navy" id="waitlist">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Launching soon</Eyebrow>
            <DisplayHeading tone="dark" accent="before launch." className="mt-4">
              Get in
            </DisplayHeading>
            <p className="mt-6 font-sans text-base leading-relaxed text-brand-mutedOnDark">
              AquaRunner Compliance is in final development — $19/month, flat. Join the waitlist and you will hear from
              us when it opens.
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
