import { PROVENANCE_NOTE, type ReadingProvenance } from "@/lib/last-reading";

export type PreviousReading = {
  values: Record<string, number | string | null> | null;
  relative: string;
  absolute: string;
  daysAgo: number;
  provenance: ReadingProvenance;
  technicianName: string | null;
};

type FieldLike = { key: string; label: string; unitLabel: string };

/**
 * What this body of water last read, and when, shown above the inputs the technician is about to
 * fill in. Until 2026-10-15 nothing on the visit screen carried it: a tech standing at the pool
 * could not tell whether the pH they just measured was a change or last week's number again, which
 * is the difference between dosing and not.
 *
 * Deliberately styled as neutral information, with no ok/warn/danger anywhere. These are historical
 * numbers, not a result -- colouring them would put a second set of pass/fail signals directly above
 * the live ones the technician is entering, which is the confusion DESIGN-SYSTEM.md reserves the
 * status colours to prevent.
 *
 * Only shows the fields this form is already asking for, so the commercial log sheet and the
 * simpler residential set each get their own, and a field the body does not test never appears as
 * a blank.
 */
/**
 * Just the unit. The residential form overloads unitLabel to explain a rule next to the input
 * ("ppm, checked in the last 30 days"), which belongs beside a field someone is filling in and
 * not beside a number from three weeks ago.
 */
function unitOf(field: FieldLike): string {
  return field.unitLabel.split(",")[0].trim();
}

export function LastReadingStrip({
  previous,
  fields,
}: {
  previous: PreviousReading | null;
  fields: readonly FieldLike[];
}) {
  if (!previous?.values) return null;

  const recorded = fields
    .map((field) => ({ field, value: previous.values?.[field.key] }))
    .filter((entry): entry is { field: FieldLike; value: number | string } => entry.value != null);

  // Every field this form asks for was blank on that visit -- saying "last reading" and then
  // showing nothing is worse than staying quiet.
  if (recorded.length === 0) return null;

  const note = PROVENANCE_NOTE[previous.provenance];
  const by = previous.provenance === "SERVICE" && previous.technicianName ? `by ${previous.technicianName}` : null;

  return (
    <div className="mt-3 rounded-lg border border-brand-border bg-white p-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-muted">Last reading</span>
        <span className="text-sm font-semibold text-brand-ink">{previous.relative}</span>
      </div>
      <p className="app-metric mt-0.5 text-xs text-brand-muted">
        {previous.absolute}
        {note ? ` · ${note}` : ""}
        {by ? ` · ${by}` : ""}
      </p>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {recorded.map(({ field, value }) => (
          <div key={field.key} className="flex items-baseline gap-1.5">
            <dt className="text-xs text-brand-muted">{field.label}</dt>
            <dd className="app-metric text-sm font-semibold text-brand-ink">
              {value}
              {unitOf(field) ? (
                <span className="ml-0.5 text-xs font-normal text-brand-muted">{unitOf(field)}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
