import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { SubmitButton } from "@/app/components/submit-button";
import { loadSmartDosingReadiness } from "@/lib/dosing-calculator";
import { DEMAND_LOOKBACK_DAYS, MIN_OBSERVATIONS_FOR_MEASURED_DEMAND } from "@/lib/chlorine-demand";
import { updateSmartDosing } from "../actions";

type PageProps = { searchParams?: Promise<{ saved?: string }> };

/**
 * The one dosing decision an operator makes, and the evidence for making it.
 *
 * Why this page is not a plain toggle: the thing being switched on is a projection built from
 * each pool's own measured chlorine loss, and on a pool without enough history that measurement
 * falls back to a single constant shared across the whole account. This org's own measured pools
 * span 4.2%/day to 30.6%/day, so a shared constant is not a stand-in for any particular one of
 * them. An admin cannot weigh that from a sentence -- they need to see how many of their pools
 * would be running on their own number. Hence the coverage figure and the list.
 *
 * Why there is no "unlocks in N days" counter, which is what was originally asked for: no honest
 * N existed. See loadSmartDosingReadiness for the convergence test that killed it.
 */
export default async function SmartDosingPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const sp = (await searchParams) ?? {};
  const readiness = await loadSmartDosingReadiness(appUser.organizationId);
  const total = readiness.bodies.length;
  const stateLabel = readiness.stateName ?? "your state";

  return (
    <main className="app-page-wide">
      <header className="app-page-head">
        <p className="app-kicker">Admin</p>
        <h1 className="app-h1">Smart dosing</h1>
        <p className="app-subhead">
          Every dose your technicians are shown is sized to put the water inside {stateLabel}&rsquo;s required range
          today. Smart dosing adds a second question on top of that one: will it still be in range at the next visit?
        </p>
        <Link href="/dashboard/settings" className="app-link mt-2 inline-block text-sm">
          ← Company settings
        </Link>
      </header>

      {sp.saved ? <p className="mt-4 text-sm text-brand-ok">Saved.</p> : null}

      {/* The default stated as a feature rather than as an absence. An account that leaves this
          off is not getting a cut-down product -- it is getting the recommendation it can defend
          to an inspector, which is the whole of what a company in its first month needs. */}
      <section className="app-card mt-6">
        <h2 className="text-base font-semibold text-brand-ink">What you get with this off</h2>
        <p className="mt-2 text-sm text-brand-ink">
          {readiness.stateName ? (
            <>
              Targets come from {readiness.stateName}&rsquo;s own pool code, narrowed by any tighter range your company
              has set for itself. A dose gets the water inside that range today, and the visit card says so in{" "}
              {readiness.stateName}&rsquo;s name. Nothing is projected forward, and no service history is needed &mdash;
              this works on a pool you took over this morning.
            </>
          ) : (
            <>
              Your account has no supported state ruleset linked yet, so targets come from the ranges your company
              configured for itself. A dose gets the water inside those today and nothing is projected forward. Link a
              state under <Link href="/dashboard/compliance" className="app-link">Compliance</Link> and these become
              that state&rsquo;s own required ranges.
            </>
          )}
        </p>
      </section>

      <section className="app-card mt-4">
        <h2 className="text-base font-semibold text-brand-ink">What this adds</h2>
        <p className="mt-2 text-sm text-brand-ink">
          Free chlorine is consumed continuously, so a dose that is correct at the moment of mixing can be gone before
          anyone is back. With smart dosing on, each chlorine dose is sized to still be above the minimum when the
          technician next arrives &mdash; using how fast that particular pool loses chlorine, measured from its own
          readings over the last {DEMAND_LOOKBACK_DAYS} days.
        </p>
        <p className="mt-3 text-sm text-brand-ink">
          It also flags a pool that tests in range today but will not hold until the next visit, which is the case
          nothing was telling anyone about before.
        </p>
        {/* The limit, in the same size type as the benefit. A pool below the threshold does not
            fail loudly -- it quietly borrows a number from the rest of the account, and an
            operator deciding whether to switch this on is owed that in plain words. */}
        <p className="mt-3 border-t border-brand-border pt-3 text-sm text-brand-ink">
          A pool needs at least {MIN_OBSERVATIONS_FOR_MEASURED_DEMAND} recent service intervals where no chlorine was
          logged before its own rate can be measured &mdash; roughly three to four weeks on a weekly pool. Below that,
          its dose is projected from an account-wide default instead, and the visit card says which of the two it used.
        </p>
      </section>

      <section className="app-card mt-4">
        <h2 className="text-base font-semibold text-brand-ink">How much of your own history this would rest on</h2>
        {total === 0 ? (
          <p className="mt-2 text-sm text-brand-ink">
            No chlorine bodies of water on file yet, so there is nothing to measure. Smart dosing would run entirely on
            the account-wide default until you have some service history.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-brand-ink">
              <span className="app-metric">
                {readiness.measuredCount} of {total}
              </span>{" "}
              of your chlorine pools have enough of their own history to measure their own loss rate. The other{" "}
              <span className="app-metric">{total - readiness.measuredCount}</span> would use the account-wide default
              until they do.
            </p>
            {readiness.automationCount > 0 ? (
              /* Said rather than left to be noticed. These bodies are genuinely absent from the
                 list, and an operator counting pools would otherwise think some went missing. */
              <p className="mt-2 text-sm text-brand-muted">
                <span className="app-metric">{readiness.automationCount}</span>{" "}
                {readiness.automationCount === 1 ? "body is" : "bodies are"} on an automation system and not counted
                here. Those are never projected either way &mdash; the system is built to hold the level between
                visits, so a technician is given a one-time correction to target and nothing more.
              </p>
            ) : null}

            <ul className="mt-4 divide-y divide-brand-border border-t border-brand-border">
              {readiness.bodies.map((b) => (
                <li key={b.bodyOfWaterId} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                  <span className="text-sm text-brand-ink">
                    {b.propertyName} &mdash; {b.bodyName}
                  </span>
                  {b.source === "measured" ? (
                    <span className="app-metric text-xs text-brand-ink">
                      {b.dailyLossPercent?.toFixed(1)}% a day · {b.sampleSize}{" "}
                      {b.sampleSize === 1 ? "interval" : "intervals"}
                    </span>
                  ) : (
                    <span className="text-xs text-brand-muted">account default &mdash; not enough history yet</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <form action={updateSmartDosing} className="app-card mt-4">
        <label className="flex min-h-[44px] items-start gap-3">
          <input
            type="checkbox"
            name="smartDosingEnabled"
            defaultChecked={readiness.enabled}
            className="mt-1 h-5 w-5 accent-brand-primary"
          />
          <span>
            <span className="text-sm font-semibold text-brand-ink">Size chlorine doses to last until the next visit</span>
            <span className="mt-1 block text-sm text-brand-muted">
              Off keeps every recommendation to what meets {stateLabel}&rsquo;s range today. You can switch this back off
              at any time; it only changes what technicians are shown from here on, never a visit already completed.
            </span>
          </span>
        </label>

        <div className="mt-4">
          <SubmitButton className="app-btn-primary" pendingLabel="Saving…">
            Save
          </SubmitButton>
        </div>
      </form>
    </main>
  );
}
