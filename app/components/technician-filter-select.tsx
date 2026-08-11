"use client";

type Props = {
  technicians: { id: string; label: string }[];
  selectedId: string | null;
  tab: string;
  date: string;
  propertyType?: string | null;
  /** Set when rendering on a dark (e.g. brand-ink) background — flips the label's
   * contrast. The <select> itself is always white-filled regardless, so it needs no
   * equivalent branch. */
  onDark?: boolean;
};

/**
 * Auto-submitting GET form for the admin Schedule tab's technician filter. Kept as the
 * only client-side interaction surface on that page — everything else (tabs, day nav)
 * stays plain server-rendered <Link>s, matching the rest of this page's navigation model.
 */
export function TechnicianFilterSelect({ technicians, selectedId, tab, date, propertyType, onDark = false }: Props) {
  return (
    <form action="/dashboard/schedule" method="GET" className="flex items-center gap-2">
      <input type="hidden" name="tab" value={tab} />
      <input type="hidden" name="date" value={date} />
      {propertyType ? <input type="hidden" name="type" value={propertyType} /> : null}
      <label className={`text-sm font-medium ${onDark ? "text-white" : "text-brand-ink"}`} htmlFor="tech-filter">
        Technician
      </label>
      <select
        id="tech-filter"
        name="tech"
        defaultValue={selectedId ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-brand-border bg-white px-2 py-1.5 text-sm text-brand-ink"
      >
        <option value="">All Technicians</option>
        {technicians.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </form>
  );
}
