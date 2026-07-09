type BackwashDay = {
  day: number;
  visited: boolean;
  backwashed: boolean;
  time: string | null;
};

type BackwashCalendarProps = {
  days: BackwashDay[];
};

export function BackwashCalendar({ days }: BackwashCalendarProps) {
  const backwashCount = days.filter((d) => d.backwashed).length;

  return (
    <div className="rounded-lg border border-[#C9E3EC] bg-white p-4 md:col-span-2">
      <div className="flex items-baseline justify-between">
        <h3 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-[#12234A]">
          Backwash performed
        </h3>
        <span className="font-[family-name:var(--font-mono)] text-xs text-[#4A6572]">
          {backwashCount} day{backwashCount === 1 ? "" : "s"} this month
        </span>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5 sm:grid-cols-10 md:grid-cols-[repeat(15,minmax(0,1fr))] lg:grid-cols-[repeat(31,minmax(0,1fr))]">
        {days.map((d) => {
          const bg = !d.visited ? "bg-[#EAF6FA] text-[#7FA0AC]" : d.backwashed ? "bg-[#0A5FA4] text-white" : "bg-[#FFD9D3] text-[#4A6572]";
          const label = !d.visited ? "–" : d.backwashed ? "Y" : "N";
          const title = !d.visited
            ? `Day ${d.day}: no service visit`
            : d.backwashed
              ? `Day ${d.day}: backwash performed${d.time ? ` at ${d.time}` : ""}`
              : `Day ${d.day}: no backwash`;
          return (
            <div
              key={d.day}
              title={title}
              className={`flex aspect-square flex-col items-center justify-center rounded text-[10px] font-[family-name:var(--font-mono)] font-semibold ${bg}`}
            >
              <span className="opacity-70">{d.day}</span>
              <span>{label}</span>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-[#4A6572]">
        Y = backwash performed · N = serviced, no backwash · – = no visit that day
      </p>
    </div>
  );
}
