import Link from "next/link";

export type MonthDay = {
  ymd: string;
  dayOfMonth: number;
  /** Stops on this day: real ServiceVisit rows when any exist, otherwise the projection. */
  total: number;
  completed: number;
  skipped: number;
  /** True when `total` came from the recurring template rather than real visit rows --
   * i.e. nobody has opened this day yet, so no visits have been generated for it. */
  projected: boolean;
  isToday: boolean;
  isPast: boolean;
};

type Props = {
  weeks: (MonthDay | null)[][];
  weekdayLabels: string[];
  dayHref: (ymd: string) => string;
};

/**
 * Month calendar of the schedule. Days nobody has loaded yet carry no ServiceVisit rows at
 * all (they're generated on demand), so those show the recurring template's projection,
 * marked with a dot to distinguish "what will happen" from "what is booked". Days are
 * clickable through to the day view, where opening them is what actually generates them.
 */
export function ScheduleMonthView({ weeks, weekdayLabels, dayHref }: Props) {
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 px-0.5 pb-1">
        {weekdayLabels.map((label) => (
          <p key={label} className="text-center text-[10px] font-semibold uppercase tracking-wide text-brand-muted">
            {label}
          </p>
        ))}
      </div>

      <div className="space-y-1">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7 gap-1">
            {week.map((day, dayIndex) =>
              day === null ? (
                <div key={`blank-${weekIndex}-${dayIndex}`} className="min-h-[68px] rounded-lg bg-brand-surface" />
              ) : (
                <Link
                  key={day.ymd}
                  href={dayHref(day.ymd)}
                  className={`flex min-h-[68px] flex-col rounded-lg border bg-white p-1.5 transition hover:border-brand-primary ${
                    day.isToday ? "border-brand-primary ring-1 ring-brand-primary" : "border-brand-border"
                  }`}
                >
                  <span
                    className={`app-metric text-xs ${day.isToday ? "font-bold text-brand-primary" : "text-brand-muted"}`}
                  >
                    {day.dayOfMonth}
                  </span>

                  {day.total > 0 ? (
                    <span className="mt-auto">
                      <span className="app-metric block text-sm font-bold text-brand-ink">
                        {day.total}
                        {day.projected ? <span className="text-brand-muted"> ·</span> : null}
                      </span>
                      <span className="block text-[10px] text-brand-muted">
                        {day.projected
                          ? "projected"
                          : day.skipped > 0
                            ? `${day.completed} done · ${day.skipped} skip`
                            : `${day.completed} done`}
                      </span>
                    </span>
                  ) : null}
                </Link>
              ),
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-brand-muted">
        A dot marks a projected day — its stops come from the weekly route template and no
        visits exist for it yet. Opening the day is what creates them.
      </p>
    </div>
  );
}
