// Signature motif, second application: a small inline dial for a chemistry reading,
// standing in for a plain number. The fill position shows where the reading sits between
// min/max, colored by whether it's inside the ideal range.
type ChemGaugeProps = {
  value: number;
  min: number;
  max: number;
  idealMin: number;
  idealMax: number;
  unit?: string;
  size?: number;
};

export function ChemGauge({ value, min, max, idealMin, idealMax, unit = "", size = 40 }: ChemGaugeProps) {
  const clampedValue = Math.max(min, Math.min(max, value));
  const pct = max === min ? 0 : ((clampedValue - min) / (max - min)) * 100;
  const inRange = value >= idealMin && value <= idealMax;
  const color = inRange ? "#1F8A80" : "#E2775E";
  const inner = size - 9;

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${color} ${pct}%, rgba(15, 42, 61, 0.1) 0)`,
      }}
      role="img"
      aria-label={`${value}${unit} — ${inRange ? "in range" : "out of range"} (ideal ${idealMin}–${idealMax}${unit})`}
    >
      <span className="flex items-center justify-center rounded-full bg-white" style={{ width: inner, height: inner }}>
        <span className="app-metric text-[10px] font-semibold leading-none" style={{ color }}>
          {value}
        </span>
      </span>
    </span>
  );
}
