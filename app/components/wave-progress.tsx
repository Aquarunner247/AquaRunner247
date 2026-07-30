import { BRAND_CTA, BRAND_PRIMARY } from "@/app/lib/chart-colors";

// Signature motif: a water-level fill used functionally as a progress indicator — not
// decoration. `percent` should reflect something real (stops completed, day progress).
type WaveProgressProps = {
  percent: number;
  label?: string;
  sublabel?: string;
  tone?: "teal" | "coral";
  /** Set when rendering on a dark (e.g. brand-ink) background — flips label/track contrast. */
  onDark?: boolean;
};

export function WaveProgress({ percent, label, sublabel, tone = "teal", onDark = false }: WaveProgressProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const fill = tone === "coral" ? BRAND_CTA : BRAND_PRIMARY;
  const labelClass = onDark ? "text-white/70" : "text-brand-ink/70";
  const sublabelClass = onDark ? "text-white" : "text-brand-ink";
  const trackClass = onDark ? "bg-white/10" : "bg-brand-ink/[0.07]";

  return (
    <div className="w-full">
      {label || sublabel ? (
        <div className={`mb-1 flex items-center justify-between text-xs font-semibold ${labelClass}`}>
          {label ? <span>{label}</span> : <span />}
          {sublabel ? <span className={`app-metric ${sublabelClass}`}>{sublabel}</span> : null}
        </div>
      ) : null}
      <div
        className={`relative h-6 w-full overflow-hidden rounded-full ${trackClass}`}
        role="img"
        aria-label={`${label ? `${label}: ` : ""}${clamped}% complete`}
      >
        <div
          className="absolute inset-y-0 left-0 overflow-hidden rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${clamped}%` }}
        >
          <svg
            className="absolute inset-y-0 left-0 h-full w-[200%] animate-wave-drift motion-reduce:animate-none"
            viewBox="0 0 200 24"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M0,12 C8,5 17,5 25,12 C33,19 42,19 50,12 C58,5 67,5 75,12 C83,19 92,19 100,12 C108,5 117,5 125,12 C133,19 142,19 150,12 C158,5 167,5 175,12 C183,19 192,19 200,12 V24 H0 Z"
              fill={fill}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
