import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav, SiteFooter } from "../components/landing/site-chrome";
import { RETAINED_AFTER_DELETION, RETAINED_AFTER_PORTAL_DELETION } from "@/lib/account-deletion-confirm";

/**
 * The account-deletion URL Google Play requires.
 *
 * Play's User Data policy says an app that lets people create an account must offer a way to
 * request deletion from OUTSIDE the app, at a URL submitted with the Data Safety form. An in-app
 * button is not enough on its own: somebody who has uninstalled, lost the phone, or been blocked
 * from signing in still has to be able to ask. That is exactly the person this page is for, so
 * it asks for no login and names the two paths plainly.
 *
 * The retained-records wording is imported rather than written here. The same two constants drive
 * the in-app confirmation screens, so this page cannot promise a different deletion from the one
 * the buttons actually perform -- which is the failure mode that turns a compliance page into a
 * misrepresentation.
 */
export const metadata: Metadata = {
  title: "Delete your account — AquaRunner 24/7",
  description:
    "How to delete an AquaRunner 24/7 account and what happens to the records, including from outside the app.",
  // Reachable by anyone with the link, which is what Play asks for; kept out of search results
  // like the other policy pages until the attorney review is done.
  robots: { index: false, follow: false },
};

export default function AccountDeletionPage() {
  return (
    <div className="bg-brand-surface">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-brand-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <SiteNav current="legal" />

      <main id="main" className="mx-auto max-w-2xl px-5 py-12 md:px-8 md:py-16">
        <p className="app-kicker">AquaRunner 24/7</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-brand-ink">Delete your account</h1>
        <p className="mt-4 text-base leading-relaxed text-brand-muted">
          You can delete your account from inside the app, or ask us to do it for you. You do not need the
          app installed to make the request.
        </p>

        <section className="app-card mt-8">
          <h2 className="font-display text-lg font-semibold text-brand-ink">If you work for a pool company</h2>
          <p className="mt-2 text-sm leading-relaxed text-brand-ink">
            An administrator can delete the whole organization from{" "}
            <span className="font-medium">Settings &rarr; Billing &rarr; Delete this account</span>. It closes the
            account, removes every staff login, cancels any active subscription, and deletes your service data:
            visits, chemistry readings, chemical doses, checklists, photos, documents, routes and phone-agent
            records. It happens immediately and cannot be undone.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-brand-ink">
            If you are not an administrator, ask yours to remove your login, or write to us below.
          </p>
        </section>

        <section className="app-card mt-4">
          <h2 className="font-display text-lg font-semibold text-brand-ink">If you are a pool owner or manager</h2>
          <p className="mt-2 text-sm leading-relaxed text-brand-ink">
            You can delete your portal login yourself from{" "}
            <span className="font-medium">Your account</span> in the customer portal. That removes your login
            straight away. It does not delete your pool company&rsquo;s own service records about your property,
            which belong to them &mdash; {RETAINED_AFTER_PORTAL_DELETION} stay with the company that performed the work.
          </p>
        </section>

        <section className="app-card mt-4">
          <h2 className="font-display text-lg font-semibold text-brand-ink">Ask us instead</h2>
          <p className="mt-2 text-sm leading-relaxed text-brand-ink">
            Email{" "}
            <a href="mailto:privacy@aquarunner247.com" className="app-link">
              privacy@aquarunner247.com
            </a>{" "}
            from the address on the account, telling us which account to delete. We will confirm before anything
            is removed, and we aim to complete the request within 30 days.
          </p>
        </section>

        <section className="app-card mt-4">
          <h2 className="font-display text-lg font-semibold text-brand-ink">What we keep, and why</h2>
          <p className="mt-2 text-sm leading-relaxed text-brand-ink">
            Health-department compliance logging belongs to the body of water, not to whoever services it. So
            after a deletion we keep {RETAINED_AFTER_DELETION}. Those stay reachable through the QR-code log page
            posted at each pool, because that is the record a regulator expects to find there. Everything else
            is deleted.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-brand-ink">
            Our{" "}
            <Link href="/privacy" className="app-link">
              Privacy Policy
            </Link>{" "}
            sets out retention in full. If you believe a particular record should not be kept, write to us at the
            address above and we will look at it.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
