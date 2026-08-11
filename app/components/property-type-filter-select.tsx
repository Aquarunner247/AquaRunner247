"use client";

type Props = {
  selected: string | null;
  action: string;
  technicianId?: string | null;
  tab?: string;
  date?: string;
  /** Set when rendering on a dark (e.g. brand-ink) background — flips the label's
   * contrast. Dashboard's usage is on a light header (default false); the Schedule tab's
   * is on a dark one. The <select> itself is always white-filled regardless. */
  onDark?: boolean;
};

/**
 * Auto-submitting GET form for the Residential/Commercial filter, shared by the Dashboard
 * and Schedule tab. Echoes the sibling filter's current value (technicianId/tab/date) as
 * hidden inputs so submitting this form never clobbers state the other filter owns.
 */
export function PropertyTypeFilterSelect({ selected, action, technicianId, tab, date, onDark = false }: Props) {
  return (
    <form action={action} method="GET" className="flex items-center gap-2">
      {tab != null ? <input type="hidden" name="tab" value={tab} /> : null}
      {date != null ? <input type="hidden" name="date" value={date} /> : null}
      {technicianId ? <input type="hidden" name="tech" value={technicianId} /> : null}
      <label className={`text-sm font-medium ${onDark ? "text-white" : "text-brand-ink"}`} htmlFor="property-type-filter">
        Type
      </label>
      <select
        id="property-type-filter"
        name="type"
        defaultValue={selected ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-brand-border bg-white px-2 py-1.5 text-sm text-brand-ink transition focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
      >
        <option value="">All Types</option>
        <option value="COMMERCIAL">Commercial</option>
        <option value="RESIDENTIAL">Residential</option>
      </select>
    </form>
  );
}
