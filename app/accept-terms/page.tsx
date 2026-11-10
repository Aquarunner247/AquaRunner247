import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { prisma } from "@/lib/prisma";
import { TERMS_DOCUMENTS, canAcceptTerms, needsTermsAcceptance } from "@/lib/terms-acceptance";
import { acceptTermsAction } from "./actions";

/**
 * The mandatory re-acceptance screen, raised by the gates in app/dashboard/layout.tsx and
 * app/cpo/(app)/layout.tsx whenever an organization's stored version is behind TERMS_VERSION.
 *
 * Two populations land here. Organizations created before 2026-10-22, which have never accepted
 * anything and were deliberately not backfilled; and organizations that accepted an earlier
 * version. Both get the same screen, because both need the same thing: a fresh, dated,
 * attributable act of assent to the text that is actually in force.
 *
 * Why it is a page and not a dismissible banner: a banner is notice without assent, which is the
 * browsewrap problem the clickwrap was built to fix. The whole value of this screen is that the
 * only way past it is to click the button.
 *
 * Outside the dashboard route group on purpose -- the gate lives in that group's layout, so a
 * screen inside it would render behind its own redirect.
 */
export const metadata = { title: "Review our updated agreements" };

export default async function AcceptTermsPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.isPlatformAdmin) redirect("/admin");

  const org = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { planTier: true, termsAcceptedVersion: true, termsAcceptedAt: true },
  });
  if (!org) redirect("/login");

  const home = org.planTier === "COMPLIANCE" ? "/cpo" : "/dashboard";
  // Nothing to do -- a stale tab, or another admin accepted first.
  if (!needsTermsAcceptance(org)) redirect(home);

  const isFirstEver = org.termsAcceptedAt === null;
  const canAccept = canAcceptTerms(appUser);

  return (
    <main className="app-page-centered-wide">
      <div className="app-card">
        <p className="app-kicker">Action required</p>
        <h1 className="app-h1 mt-1">
          {isFirstEver ? "Please review our agreements" : "We’ve updated our agreements"}
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-brand-ink">
          {isFirstEver
            ? "Your account was created before we asked customers to accept these documents in the app. Before you continue, please review them and confirm that you agree."
            : "We have made material changes to the documents that govern your use of AquaRunner247. Before you continue, please review them and confirm that you agree to the current versions."}
        </p>

        {!isFirstEver ? (
          <div className="app-card-inset mt-4">
            <p className="text-sm font-semibold text-brand-ink">What changed</p>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-brand-ink">
              <li>
                Our <strong>Data Processing Agreement</strong> is now part of the agreements you accept, rather than a
                separate document. It sets out how we handle personal information on your behalf.
              </li>
              <li>
                Our <strong>Privacy Policy</strong> now states field by field which records we keep after a subscription
                ends, and we no longer retain the contact details of property managers, owners, or maintenance staff on
                those records.
              </li>
              <li>
                Our <strong>Privacy Policy</strong> now describes how the automated phone agent handles, records, and
                transcribes calls, and callers are told that they are speaking with an automated system.
              </li>
            </ul>
          </div>
        ) : null}

        <ul className="mt-5 space-y-2">
          {TERMS_DOCUMENTS.map((doc) => (
            <li key={doc.href}>
              <Link href={doc.href} target="_blank" rel="noopener noreferrer" className="app-link">
                {doc.label}
              </Link>
            </li>
          ))}
        </ul>

        {canAccept ? (
          <form action={acceptTermsAction} className="mt-6">
            {/* min-h-11 is the 44px touch target the design system requires; .app-btn-primary's
                own padding lands just under it on a short label. */}
            <button type="submit" className="app-btn-primary min-h-11 w-full sm:w-auto">
              I agree and accept
            </button>
            <p className="mt-3 text-sm leading-relaxed text-brand-ink">
              By clicking <strong>I agree and accept</strong> you confirm that you have authority to accept these
              agreements for {" "}
              <strong>your organization</strong>, and you agree to the {TERMS_DOCUMENTS.length} documents listed above.
              We will record your name, the date and time, and the version you accepted.
            </p>
          </form>
        ) : (
          /* An office user or technician cannot bind the organization -- see canAcceptTerms.
             They are told why and sent back to work rather than held at a screen they have no
             way to clear. */
          <div className="app-card-inset mt-6">
            <p className="text-sm leading-relaxed text-brand-ink">
              Only an administrator on your account can accept these agreements. Please ask an administrator to sign in
              and review them. You can keep working in the meantime.
            </p>
            <Link href={home} className="app-link mt-3 inline-block">
              Back to {org.planTier === "COMPLIANCE" ? "AquaRunner Compliance" : "the dashboard"}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
