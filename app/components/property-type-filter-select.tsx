"use client";

type Props = {
  selected: string | null;
  action: string;
  technicianId?: string | null;
  tab?: string;
  date?: string;
};

/**
 * Auto-submitting GET form for the Residential/Commercial filter, shared by the Dashboard
 * and Schedule tab. Echoes the sibling filter's current value (technicianId/tab/date) as
 * hidden inputs so submitting this form never clobbers state the other filter owns.
 */
export function PropertyTypeFilterSelect({ selected, action, technicianId, tab, date }: Props) {
  return (
    <form action={action} method="GET" className="flex items-center gap-2">
      {tab != null ? <input type="hidden" name="tab" value={tab} /> : null}
      {date != null ? <input type="hidden" name="date" value={date} /> : null}
      {technicianId ? <input type="hidden" name="tech" value={technicianId} /> : null}
      <label className="text-sm font-medium text-[#12234A]" htmlFor="property-type-filter">
        Type
      </label>
      <select
        id="property-type-filter"
        name="type"
        defaultValue={selected ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-[#C9E3EC] bg-white px-2 py-1.5 text-sm text-[#12234A]"
      >
        <option value="">All Types</option>
        <option value="COMMERCIAL">Commercial</option>
        <option value="RESIDENTIAL">Residential</option>
      </select>
    </form>
  );
}
