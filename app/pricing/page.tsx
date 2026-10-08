import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "../components/landing/site-chrome";
import { ComparisonTable } from "../components/landing/comparison-table";
import { WaitlistForm } from "../components/landing/waitlist-form";
import { Section, Eyebrow, DisplayHeading, PrimaryButton, SecondaryButton, Card } from "../components/landing/ui";
import styles from "../landing.module.css";

/**
 * Pricing, rebuilt to the Marbalism design (design/marbilism/pricing-desktop.jpg).
 *
 * The sample's shape is kept -- navy hero, the per-pool maths beside a table, a three-promise band,
 * then the closing form. Its copy is not, in one respect: the sample refuses to publish a figure
 * ("we are not publishing a dollar figure before launch"). These plans and prices are real and
 * already decided, so withholding them would make the page worse, not more on-brand.
 *
 * Every CTA is the waitlist. The sample sells a 2-week free trial; signups are Preview-only until
 * launch, so a trial button here would be a promise the product cannot keep today.
 */

type Plan = {
  name: string;
  forWhom: string;
  price: string;
  per?: string;
  featured?: boolean;
  points: string[];
  cta: { label: string; href: string };
};

const PLANS: Plan[] = [
  {
    name: "Service",
    forWhom: "For residential, commercial, or mixed pool-service companies",
    price: "$99",
    per: "/month",
    featured: true,
    points: [
      "Unlimited pools, one account for residential and commercial work",
      "3 staff logins included, then $15/month each — unlimited customers on the portal, always",
      "AI phone agent, dosing calculator, and route optimization included, not upsold",
      "Full chemical logging, service reports, and photos",
      "Customer portal, equipment records, and safety data sheets",
      "State-specific compliance log sheets",
      "Printable, laminate-ready sheets and QR codes for pump rooms",
    ],
    cta: { label: "Join the waitlist", href: "#waitlist" },
  },
  {
    name: "White Label",
    forWhom: "For companies that want their own brand in front of customers",
    price: "$149",
    per: "/month",
    points: [
      "Everything in Service, plus:",
      "5 staff logins included, then $15/month each — unlimited customers on the portal, always",
      "Your logo and brand colours on the customer portal your clients log into",
      "Your branding on the welcome email that sets up their login",
      "AquaRunner branding minimised wherever your customers look",
      "On the roadmap: branded service reports and QR landing pages",
    ],
    cta: { label: "Join the waitlist", href: "#waitlist" },
  },
  {
    name: "Enterprise",
    forWhom: "Large, multi-location operations",
    price: "Custom",
    points: [
      "Everything in White Label, plus:",
      "Unlimited staff logins",
      "Volume pricing for multi-location, multi-crew operations",
      "Dedicated onboarding and support",
      "Custom domains and integrations scoped with you case by case",
    ],
    cta: { label: "Talk it through", href: "mailto:hello@aquarunner247.com" },
  },
];

export const metadata: Metadata = {
  title: "Pricing — AquaRunner 24/7",
  description:
    "Service, White Label, or Enterprise — no per-pool fees, ever, and no feature held back for a higher price. Plans differ by how many staff logins you need and how your customers see the software, not by which features you get.",
  openGraph: {
    title: "Pricing — AquaRunner 24/7",
    description:
      "No per-pool fees, ever. The same full feature set at every price — plans differ by seats and branding, not by which features you get.",
    type: "website",
    url: "/pricing",
    siteName: "AquaRunner 24/7",
    images: [{ url: "/og/pricing.png", width: 1200, height: 630, alt: "AquaRunner 24/7 pricing — one flat monthly price, no per-pool fees." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing — AquaRunner 24/7",
    description: "No per-pool fees, ever. The same full feature set at every price — plans differ by seats and branding, not by which features you get.",
    images: ["/og/pricing.png"],
  },
};

export default function PricingPage() {
  return (
    <div className={`bg-brand-surface ${styles.tokens}`}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-brand-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <SiteNav current="pricing" />

      <main id="main">
        {/* ---------- hero ---------- */}
        <section className="bg-brand-ink px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <div className="mx-auto max-w-6xl">
            <Eyebrow>Pricing that scales with the work, not the pool count</Eyebrow>
            <div className="mt-4 h-1 w-24 bg-brand-cta" aria-hidden="true" />
            <DisplayHeading as="h1" tone="dark" accent="No per-pool fees. Ever." className="mt-6 max-w-4xl">
              Grow the route, not the bill.
            </DisplayHeading>
            <p className="mt-6 max-w-2xl font-sans text-lg leading-relaxed text-brand-mutedOnDark">
              Add a pool, a spa, a splash pad, a fountain — the price does not move. Every plan runs the whole
              platform, including the AI phone agent and the dosing calculator. Plans differ by how many staff log in
              and how your customers see the software, never by which features you get.
            </p>
            <div className="mt-8">
              <PrimaryButton href="#waitlist">Join the waitlist</PrimaryButton>
            </div>
          </div>
        </section>

        {/* ---------- the per-pool maths ---------- */}
        <Section tone="white">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-14">
            <div>
              <Eyebrow>Do the math before you sign up</Eyebrow>
              <DisplayHeading accent="with every new pool." className="mt-4">
                Your margin should not shrink
              </DisplayHeading>
              <p className="mt-6 font-sans text-base leading-relaxed text-brand-muted">
                Per-location pricing makes growth feel like a penalty. AquaRunner keeps the monthly cost flat whether
                you manage 50 bodies of water or 500 — and a spa, a splash pad, and a fountain each get their own
                complete record without each adding a line to the bill.
              </p>
            </div>

            <Card className="self-start overflow-hidden !p-0">
              <table className="w-full border-collapse text-left font-sans text-sm">
                <caption className="sr-only">Monthly cost as the number of bodies of water grows</caption>
                <thead>
                  <tr className="bg-brand-ink text-white">
                    <th scope="col" className="px-5 py-4 font-bold">
                      Bodies of water
                    </th>
                    <th scope="col" className="px-5 py-4 font-bold">
                      Per-pool pricing
                    </th>
                    <th scope="col" className="px-5 py-4 font-bold">
                      AquaRunner
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {["50", "200", "500"].map((count, i) => (
                    <tr key={count} className={i % 2 === 1 ? "bg-brand-surface" : ""}>
                      <th scope="row" className="px-5 py-4 font-bold text-brand-ink">
                        {count}
                      </th>
                      <td className="px-5 py-4 text-brand-muted">{count} × a fee</td>
                      <td className="px-5 py-4 font-bold text-brand-cta">One flat price</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-brand-border px-5 py-4 font-sans text-xs leading-relaxed text-brand-muted">
                The flat price is the plan you pick below. Nothing on this page is charged per body of water, and
                nothing is ever added for one.
              </p>
            </Card>
          </div>
        </Section>

        {/* ---------- three promises ---------- */}
        <Section tone="cream" tight>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card tone="dark">
              <h2 className="font-marketing text-2xl font-black uppercase italic tracking-[-0.03em] text-brand-cta">
                Flat monthly
              </h2>
              <p className="mt-3 font-sans text-sm leading-relaxed text-brand-mutedOnDark">
                A single subscription covers every body of water on the routes you run.
              </p>
            </Card>
            <Card>
              <h2 className="font-marketing text-2xl font-black uppercase italic tracking-[-0.03em] text-brand-ink">
                No per-pool fees
              </h2>
              <p className="mt-3 font-sans text-sm leading-relaxed text-brand-muted">
                Add pools, spas, splash pads, and fountains without adding a line item for each one.
              </p>
            </Card>
            <Card>
              <h2 className="font-marketing text-2xl font-black uppercase italic tracking-[-0.03em] text-brand-ink">
                Every feature, every plan
              </h2>
              <p className="mt-3 font-sans text-sm leading-relaxed text-brand-muted">
                Nothing is held back for a higher tier. The price changes what your customers see and how many of your
                staff can log in — not what the app can do.
              </p>
            </Card>
          </div>
        </Section>

        {/* ---------- plans ---------- */}
        <Section tone="white">
          <Eyebrow>Pick the one that fits</Eyebrow>
          <DisplayHeading accent="One price." className="mt-4">
            One company. Every pool.
          </DisplayHeading>

          <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <Card
                key={plan.name}
                lift
                className={`flex flex-col ${plan.featured ? "border-brand-cta ring-1 ring-brand-cta" : ""}`}
              >
                {/* The badge row is reserved on every card, and the "who it is for" line has a floor,
                    so the three plan names and the three prices land on the same lines across the row. */}
                <span
                  className={`mb-4 self-start rounded-md px-3 py-1 font-marketing text-xs font-bold uppercase italic tracking-[0.12em] ${
                    plan.featured ? "bg-brand-cta text-brand-ink" : "invisible"
                  }`}
                  aria-hidden={plan.featured ? undefined : true}
                >
                  Most popular
                </span>
                <h3 className="font-marketing text-3xl font-black uppercase italic tracking-[-0.03em] text-brand-ink">
                  {plan.name}
                </h3>
                <p className="mt-2 font-sans text-sm leading-relaxed text-brand-muted sm:min-h-[2.75rem]">{plan.forWhom}</p>
                <p className="mt-6 font-marketing text-5xl font-black italic leading-none text-brand-ink">
                  {plan.price}
                  {plan.per && <span className="font-sans text-base font-bold text-brand-muted">{plan.per}</span>}
                </p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.points.map((point) => (
                    <li key={point} className="flex gap-2 font-sans text-sm leading-relaxed text-brand-ink">
                      <span aria-hidden="true" className="text-brand-cta">
                        ✓
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  {plan.featured ? (
                    <PrimaryButton href={plan.cta.href} className="w-full">
                      {plan.cta.label}
                    </PrimaryButton>
                  ) : (
                    <SecondaryButton href={plan.cta.href} className="w-full">
                      {plan.cta.label}
                    </SecondaryButton>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* ---------- compliance cross-sell ---------- */}
          <Card tone="dark" className="mt-10">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_auto] lg:items-center">
              <div>
                <Eyebrow>Not a service company?</Eyebrow>
                <h3 className="mt-3 font-marketing text-2xl font-black uppercase italic tracking-[-0.03em] text-white">
                  Have an in-house CPO instead
                </h3>
                <p className="mt-3 font-sans text-sm leading-relaxed text-brand-mutedOnDark">
                  AquaRunner Compliance gives them the same state-specific logging and QR-coded record for every body
                  of water they maintain — without the routing and dispatch they would never open. $19/month, flat.
                </p>
              </div>
              <SecondaryButton href="/for-property-managers" tone="dark">
                See AquaRunner Compliance
              </SecondaryButton>
            </div>
          </Card>
        </Section>

        {/* ---------- comparison ---------- */}
        <Section tone="cream">
          <ComparisonTable />
        </Section>

        {/* ---------- closing waitlist ---------- */}
        <Section tone="navy" id="waitlist">
          <div className="mx-auto max-w-2xl text-center">
            <Eyebrow>Ready when you are</Eyebrow>
            <DisplayHeading tone="dark" accent="before you commit to it." className="mt-4">
              Try the system
            </DisplayHeading>
            <p className="mt-6 font-sans text-base leading-relaxed text-brand-mutedOnDark">
              AquaRunner is in final development. Leave your email and you will hear from us when it opens — no demo
              call, no sales sequence, nothing before then.
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
