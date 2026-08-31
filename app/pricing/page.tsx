import type { Metadata } from "next";
import { SiteNav, SiteFooter } from "../components/landing/site-chrome";
import { ComparisonTable } from "../components/landing/comparison-table";
import { WaitlistForm } from "../components/landing/waitlist-form";
import styles from "../landing.module.css";

export const metadata: Metadata = {
  title: "Pricing — AquaRunner 24/7",
  description:
    "Solo, Starter, Pro, or Enterprise — no per-pool fees, ever. Pricing scales with your crew, not how many pools you service. Every plan starts with a 14-day free trial.",
  openGraph: {
    title: "Pricing — AquaRunner 24/7",
    description: "No per-pool fees, ever. Pricing scales with your crew, not how many pools you service.",
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
                <h1 className={styles.displayL}>One flat price. Every pool included.</h1>
              </div>
            </div>

            <p className={styles.priceIntro}>
              No per-pool fees. Ever. Pricing scales with your crew, not with how many pools you service. Every plan
              starts with a 14-day free trial.
            </p>

            <div className={styles.priceGrid}>
              <article className={styles.priceCard}>
                <div className={styles.priceCardHead}>
                  <h3>Solo</h3>
                  <p className={styles.priceFor}>For a one-person operation</p>
                </div>
                <p className={styles.priceAmount}>
                  $49<span>/month</span>
                </p>
                <ul className={styles.priceList}>
                  <li>Unlimited pools</li>
                  <li>1 user</li>
                  <li>Every feature — nothing held back for the price</li>
                  <li>State-specific compliance log sheets</li>
                  <li>Printable, laminate-ready sheets + QR codes for pump rooms</li>
                </ul>
                <a className={styles.btn} href="#waitlist">
                  Join the waitlist
                </a>
              </article>

              <article className={styles.priceCard}>
                <div className={styles.priceCardHead}>
                  <h3>Starter</h3>
                  <p className={styles.priceFor}>Best for smaller commercial and residential routes</p>
                </div>
                <p className={styles.priceAmount}>
                  $99<span>/month</span>
                </p>
                <ul className={styles.priceList}>
                  <li>Unlimited pools</li>
                  <li>Up to 5 users</li>
                  <li>Full chemical logging, service reports, and photos</li>
                  <li>State-specific compliance log sheets</li>
                  <li>Printable, laminate-ready sheets + QR codes for pump rooms</li>
                </ul>
                <a className={styles.btn} href="#waitlist">
                  Join the waitlist
                </a>
              </article>

              <article className={`${styles.priceCard} ${styles.priceCardFeatured}`}>
                <span className={styles.priceBadge}>Most popular</span>
                <div className={styles.priceCardHead}>
                  <h3>Pro</h3>
                  <p className={styles.priceFor}>For multi-tech commercial operators</p>
                </div>
                <p className={styles.priceAmount}>
                  $149<span>/month</span>
                </p>
                <ul className={styles.priceList}>
                  <li>Unlimited pools</li>
                  <li>Up to 10 users</li>
                  <li>Everything in Starter, plus:</li>
                  <li>Route optimization</li>
                  <li>Advanced custom reports</li>
                  <li>Full work order tools</li>
                  <li>Priority support</li>
                </ul>
                <a className={styles.btn} href="#waitlist">
                  Join the waitlist
                </a>
              </article>

              <article className={styles.priceCard}>
                <div className={styles.priceCardHead}>
                  <h3>Enterprise</h3>
                  <p className={styles.priceFor}>Large commercial operations</p>
                </div>
                <p className={styles.priceAmount}>Custom</p>
                <ul className={styles.priceList}>
                  <li>Volume pricing for large multi-crew operations</li>
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
