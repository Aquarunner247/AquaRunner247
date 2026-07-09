type ChartPoint = {
  day: number;
  value: number | null;
};

type ReadingChartProps = {
  label: string;
  unit: string;
  daysInMonth: number;
  points: ChartPoint[];
  targetMin?: number;
  targetMax?: number;
  targetLabel?: string;
  /** Beyond these bounds = imminent health hazard requiring closure */
  hazardMin?: number;
  hazardMax?: number;
  domainMin?: number;
  domainMax?: number;
};

const WIDTH = 560;
const HEIGHT = 160;
const PAD_LEFT = 42;
const PAD_RIGHT = 12;
const PAD_TOP = 14;
const PAD_BOTTOM = 24;

export function ReadingChart({
  label,
  unit,
  daysInMonth,
  points,
  targetMin,
  targetMax,
  targetLabel = "Typical target",
  hazardMin,
  hazardMax,
  domainMin,
  domainMax,
}: ReadingChartProps) {
  const values = points.map((p) => p.value).filter((v): v is number => v != null);
  const dataMin = values.length ? Math.min(...values) : 0;
  const dataMax = values.length ? Math.max(...values) : 1;

  const lo = domainMin ?? Math.min(dataMin, targetMin ?? dataMin);
  const hi = domainMax ?? Math.max(dataMax, targetMax ?? dataMax);
  const range = hi - lo || 1;
  // Pad the value domain slightly so lines don't hug the edges
  const yMin = lo - range * 0.1;
  const yMax = hi + range * 0.1;

  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xForDay = (day: number) => PAD_LEFT + ((day - 1) / Math.max(daysInMonth - 1, 1)) * plotW;
  const yForVal = (val: number) => PAD_TOP + (1 - (val - yMin) / (yMax - yMin)) * plotH;
  const clampY = (y: number) => Math.min(Math.max(y, PAD_TOP), HEIGHT - PAD_BOTTOM);

  const hasTarget = targetMin != null && targetMax != null;
  const zoneY = hasTarget ? yForVal(targetMax!) : 0;
  const zoneH = hasTarget ? yForVal(targetMin!) - yForVal(targetMax!) : 0;

  const hasHazard = hazardMin != null || hazardMax != null;

  const linePoints = points
    .filter((p) => p.value != null)
    .map((p) => `${xForDay(p.day)},${yForVal(p.value as number)}`)
    .join(" ");

  const readingCount = values.length;

  return (
    <div className="rounded-lg border border-[#C9E3EC] bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-[#12234A]">
          {label}
        </h3>
        <span className="font-[family-name:var(--font-mono)] text-xs text-[#4A6572]">
          {readingCount} reading{readingCount === 1 ? "" : "s"}
        </span>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mt-2 w-full" role="img" aria-label={`${label} chart for the month`}>
        {/* hazard bands (above/below hazard bounds) */}
        {hasHazard && hazardMax != null ? (
          <rect
            x={PAD_LEFT}
            y={PAD_TOP}
            width={plotW}
            height={Math.max(clampY(yForVal(hazardMax)) - PAD_TOP, 0)}
            fill="#C1483B"
            fillOpacity={0.08}
          />
        ) : null}
        {hasHazard && hazardMin != null ? (
          <rect
            x={PAD_LEFT}
            y={clampY(yForVal(hazardMin))}
            width={plotW}
            height={Math.max(HEIGHT - PAD_BOTTOM - clampY(yForVal(hazardMin)), 0)}
            fill="#C1483B"
            fillOpacity={0.08}
          />
        ) : null}

        {/* target zone band */}
        {hasTarget ? (
          <rect x={PAD_LEFT} y={zoneY} width={plotW} height={zoneH} fill="#0A5FA4" fillOpacity={0.12} />
        ) : null}

        {/* baseline axis */}
        <line
          x1={PAD_LEFT}
          y1={HEIGHT - PAD_BOTTOM}
          x2={WIDTH - PAD_RIGHT}
          y2={HEIGHT - PAD_BOTTOM}
          stroke="#C9E3EC"
          strokeWidth={1}
        />

        {/* day ticks: 1, 8, 15, 22, last */}
        {[1, 8, 15, 22, daysInMonth].map((d) => (
          <text
            key={d}
            x={xForDay(d)}
            y={HEIGHT - 6}
            textAnchor="middle"
            fontSize={9}
            fontFamily="var(--font-mono)"
            fill="#4A6572"
          >
            {d}
          </text>
        ))}

        {/* connecting line */}
        {linePoints ? (
          <polyline points={linePoints} fill="none" stroke="#0A5FA4" strokeWidth={1.75} />
        ) : null}

        {/* dots: red = health hazard, amber = outside typical target, teal = normal */}
        {points.map((p) => {
          if (p.value == null) return null;
          const isHazard = (hazardMin != null && p.value < hazardMin) || (hazardMax != null && p.value > hazardMax);
          const outOfRange = hasTarget && (p.value < targetMin! || p.value > targetMax!);
          const fill = isHazard ? "#C1483B" : outOfRange ? "#FF6B5B" : "#0A5FA4";
          return (
            <circle
              key={p.day}
              cx={xForDay(p.day)}
              cy={yForVal(p.value)}
              r={isHazard ? 3.5 : 3}
              fill={fill}
              stroke="#fff"
              strokeWidth={1}
            />
          );
        })}

        {readingCount === 0 ? (
          <text x={WIDTH / 2} y={HEIGHT / 2} textAnchor="middle" fontSize={11} fill="#7FA0AC">
            No readings this month
          </text>
        ) : null}
      </svg>

      <p className="mt-1 text-[11px] text-[#4A6572]">
        {unit ? `Unit: ${unit}. ` : ""}
        {hasTarget ? `${targetLabel}: ${targetMin}–${targetMax}${unit ? ` ${unit}` : ""}. ` : ""}
        {hasHazard ? (
          <span className="font-medium text-[#C1483B]">
            Health hazard (closure risk){hazardMin != null ? ` below ${hazardMin}` : ""}
            {hazardMin != null && hazardMax != null ? " or" : ""}
            {hazardMax != null ? ` above ${hazardMax}` : ""}
            {unit ? ` ${unit}` : ""}.
          </span>
        ) : null}
      </p>
    </div>
  );
}
