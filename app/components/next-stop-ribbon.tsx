import Link from "next/link";

export type NextStopInfo = {
  /** Null for an errand, which has no visit page to open. */
  visitId: string | null;
  title: string;
  subtitle: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Fixed bar showing where to go next, shown once a visit is completed.
 *
 * A technician finishing a stop is standing at a pool with a phone, and the next thing they need
 * is driving directions -- not to navigate back to a list, find the next row, open it, and read an
 * address. That's the whole point of it being a ribbon rather than a line on the schedule page.
 *
 * Directions use the Google Maps universal URL rather than a native scheme: it opens the Google
 * Maps app when installed, Apple Maps' web handoff or the browser otherwise, and needs no
 * per-platform branching or Capacitor plugin. A stop with no coordinates gets no directions
 * button rather than a link that opens a map of nowhere.
 */
export function NextStopRibbon({ next }: { next: NextStopInfo | null }) {
  // Solid fill, not translucent: this sits over content on a phone in direct sun, which is the
  // case DESIGN-SYSTEM's outdoor rule is written for.
  const shell =
    "fixed inset-x-0 bottom-0 z-30 border-t border-brand-border bg-white px-4 py-3 shadow-lg";

  if (!next) {
    return (
      <div className={shell}>
        <p className="mx-auto max-w-4xl text-sm font-semibold text-brand-ink">
          That was your last stop today — nice work.
        </p>
      </div>
    );
  }

  const canNavigate = next.latitude != null && next.longitude != null;
  const directionsUrl = canNavigate
    ? `https://www.google.com/maps/dir/?api=1&destination=${next.latitude},${next.longitude}&travelmode=driving`
    : null;

  return (
    <div className={shell}>
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Next stop</p>
          <p className="truncate text-sm font-semibold text-brand-ink">
            {next.title}
            {next.subtitle ? <span className="font-normal text-brand-ink"> — {next.subtitle}</span> : null}
          </p>
          {next.address ? <p className="truncate text-xs text-brand-ink">{next.address}</p> : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {next.visitId ? (
            <Link
              href={`/dashboard/visits/${next.visitId}?from=schedule`}
              className="flex min-h-[44px] items-center rounded-lg border border-brand-border px-3 text-sm font-semibold text-brand-ink"
            >
              Open
            </Link>
          ) : null}
          {directionsUrl ? (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[44px] items-center rounded-lg bg-brand-primary px-4 text-sm font-semibold text-white"
            >
              Directions
            </a>
          ) : (
            <span className="text-xs text-brand-muted">No map pin yet</span>
          )}
        </div>
      </div>
    </div>
  );
}
