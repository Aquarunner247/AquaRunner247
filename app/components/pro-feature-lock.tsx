import Link from "next/link";

/** Whole-page gate for a Pro-tier feature (settings pages, etc.) -- see lib/plan-tiers.ts's
 * hasProAccess. Not used for the route-optimize button, which needs a smaller inline form
 * since it sits next to other controls rather than replacing a whole page. */
export function ProFeatureLock({ feature }: { feature: string }) {
  return (
    <div className="app-card mt-6">
      <p className="text-sm font-medium text-brand-ink">{feature} is a Pro feature.</p>
      <p className="mt-1 text-sm text-brand-muted">
        Upgrade your plan to unlock it.{" "}
        <Link href="/dashboard/billing" className="text-brand-primary underline">
          Manage billing
        </Link>
      </p>
    </div>
  );
}
