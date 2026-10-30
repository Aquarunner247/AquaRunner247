import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";
import { SubmitButton } from "@/app/components/submit-button";
import { updateOptionalReadings } from "../actions";

type PageProps = { searchParams?: Promise<{ saved?: string }> };

/**
 * The two reading fields that are nobody's compliance requirement.
 *
 * Everything else a technician is asked for comes from the state's own rules (lib/compliance.ts)
 * and cannot be switched off here -- which is the point of this page being small. It only governs
 * what is genuinely optional.
 */
export default async function OptionalReadingsPage({ searchParams }: PageProps) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");
  if (appUser.role !== "ADMIN") redirect("/dashboard");

  const sp = (await searchParams) ?? {};
  const org = await prisma.organization.findUnique({
    where: { id: appUser.organizationId },
    select: { trackCalciumHardness: true, trackSaltPpm: true },
  });

  return (
    <main className="app-page-wide">
      <header className="app-page-head">
        <p className="app-kicker">Admin</p>
        <h1 className="app-h1">Optional readings</h1>
        <p className="app-subhead">
          Two readings no state requires. Switch one on and it appears on every visit&rsquo;s chemistry card; leave it
          off and technicians never see it.
        </p>
        <Link href="/dashboard/settings" className="app-link mt-2 inline-block text-sm">
          ← Company settings
        </Link>
      </header>

      {sp.saved ? <p className="mt-4 text-sm text-brand-ok">Saved.</p> : null}

      <form action={updateOptionalReadings} className="app-card mt-6">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="trackCalciumHardness"
            defaultChecked={org?.trackCalciumHardness ?? false}
            className="mt-1 h-5 w-5 accent-brand-primary"
          />
          <span>
            <span className="text-sm font-semibold text-brand-ink">Calcium hardness</span>
            <span className="mt-1 block text-sm text-brand-muted">
              Worth tracking if you manage scale or plaster wear. Measured in ppm.
            </span>
          </span>
        </label>

        <label className="mt-5 flex items-start gap-3 border-t border-brand-border pt-5">
          <input
            type="checkbox"
            name="trackSaltPpm"
            defaultChecked={org?.trackSaltPpm ?? false}
            className="mt-1 h-5 w-5 accent-brand-primary"
          />
          <span>
            <span className="text-sm font-semibold text-brand-ink">Salt</span>
            <span className="mt-1 block text-sm text-brand-muted">
              For saltwater systems. It shows on every pool once on, including chlorine pools, so leave it off unless
              most of your work is salt.
            </span>
          </span>
        </label>

        {/* Shown, never required. A technician at a chlorine pool must still be able to finish a
            visit without inventing a salt reading. */}
        <p className="mt-5 border-t border-brand-border pt-4 text-sm text-brand-muted">
          Either reading, once shown, is still optional for the technician — neither blocks completing a visit.
        </p>

        <div className="mt-4">
          <SubmitButton className="app-btn-primary" pendingLabel="Saving…">
            Save
          </SubmitButton>
        </div>
      </form>
    </main>
  );
}
