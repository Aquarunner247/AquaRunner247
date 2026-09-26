import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "../components/landing/site-chrome";
import { ComparisonTable } from "../components/landing/comparison-table";
import { WaitlistForm } from "../components/landing/waitlist-form";
import styles from "../landing.module.css";

export const metadata: Metadata = {
  title: "Pricing — AquaRunner 24/7",
  description:
    "Service, White Label, or Enterprise — no per-pool fees, ever, and nothing held back for the price. Plans differ by how your customers see the software, not by what you're allowed to use. Every plan starts with a 14-day free trial.",
  openGraph: {
    title: "Pricing — AquaRunner 24/7",
    description:
      "No per-pool fees, ever. The same full feature set at every price — plans differ by branding and scale, not by what you can use.",
    type: "website",
  },
};

export default function PricingPage() {
  return (
    <div className={styles.root}>
      <SiteNav current="pricing" />

      <main id="main">
        <section className={styles.sec}>
          <div className={styles.wrap}>
            <div className={styles.secHead}>
              <span className={styles.secNum} aria-hidden="true">
                01
              </span>
              <div className={styles.secHeadText}>
                <p className={styles.eyebrow}>Pricing</p>
                <h1 className={styles.displayL}>One company. Every pool. One price.</h1>
              </div>
            </div>

            <p className={styles.priceIntro}>
              No per-pool fees. Ever. Residential, commercial, or both — every plan runs the full AquaRunner
              platform, including AI dosing and the AI phone agent. Plans differ by how your customers see the
              software and how many locations you run, not by what you&rsquo;re allowed to use. Every plan starts
              with a 14-day free trial.
            </p>

            <div className={styles.priceGrid}>
              <article className={`${styles.priceCard} ${styles.priceCardFeatured}`}>
                <span className={styles.priceBadge}>Most popular</span>
                <div className={styles.priceCardHead}>
                  <h3>Service</h3>
                  <p className={styles.priceFor}>For residential, commercial, or mixed pool-service companies</p>
                </div>
                <p className={styles.priceAmount}>
                  $99<span>/month</span>
                </p>
                <ul className={styles.priceList}>
                  <li>Unlimited pools, one account for residential and commercial work</li>
                  <li>Up to 5 staff logins — unlimited customers on the portal, always</li>
                  <li>AI phone agent, dosing calculator, and route optimization — included, not upsold</li>
                  <li>Full chemical logging, service reports, and photos</li>
                  <li>Customer portal, equipment records, and safety data sheets</li>
                  <li>State-specific compliance log sheets</li>
                  <li>Printable, laminate-ready sheets + QR codes for pump rooms</li>
                </ul>
                <a className={styles.btn} href="#waitlist">
                  Join the waitlist
                </a>
              </article>

              <article className={styles.priceCard}>
                <div className={styles.priceCardHead}>
                  <h3>White Label</h3>
                  <p className={styles.priceFor}>For companies that want their own brand in front of customers</p>
                </div>
                <p className={styles.priceAmount}>
                  $149<span>/month</span>
                </p>
                <ul className={styles.priceList}>
                  <li>Everything in Service, plus:</li>
                  <li>Up to 10 staff logins — unlimited customers on the portal, always</li>
                  <li>Your logo and colors throughout the customer-facing experience</li>
                  <li>Branded customer portal, service reports, and email/text notifications</li>
                  <li>Branded QR-code landing page for every body of water</li>
                  <li>AquaRunner branding minimized wherever your customers look</li>
                </ul>
                <a className={styles.btn} href="#waitlist">
                  Join the waitlist
                </a>
              </article>

              <article className={styles.priceCard}>
                <div className={styles.priceCardHead}>
                  <h3>Enterprise</h3>
                  <p className={styles.priceFor}>Large, multi-location operations</p>
                </div>
                <p className={styles.priceAmount}>Custom</p>
                <ul className={styles.priceList}>
                  <li>Everything in White Label, plus:</li>
                  <li>Custom domain for your branded customer experience</li>
                  <li>Volume pricing for multi-location, multi-crew operations</li>
                  <li>Dedicated onboarding and support</li>
                </ul>
                <a className={styles.btn} href="mailto:hello@aquarunner247.com">
                  Contact us
                </a>
              </article>
            </div>

            <div className={styles.priceCrossSell}>
              <p>
                <strong>Have an in-house CPO instead of a service company?</strong> AquaRunner Compliance gives them
                the same state-specific compliance logging and QR-coded records for every body of water — $19/month
                flat.
              </p>
              <a className={styles.btn} href="/for-property-managers">
                See AquaRunner Compliance
              </a>
            </div>

            <ComparisonTable />
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
