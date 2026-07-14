import Link from "next/link";
import Image from "next/image";

type Gauge = {
  label: string;
  unit: string;
  min: number;
  max: number;
  zoneMin: number;
  zoneMax: number;
  reading: number;
};

const gauges: Gauge[] = [
  { label: "Free chlorine", unit: "ppm", min: 0, max: 10, zoneMin: 2, zoneMax: 4, reading: 3.2 },
  { label: "pH", unit: "", min: 6.8, max: 8.2, zoneMin: 7.2, zoneMax: 7.8, reading: 7.4 },
  { label: "Total alkalinity", unit: "ppm", min: 0, max: 240, zoneMin: 60, zoneMax: 180, reading: 110 },
];

function pct(value: number, min: number, max: number) {
  return ((value - min) / (max - min)) * 100;
}

function GaugeReadout({ gauge }: { gauge: Gauge }) {
  const zoneLeft = pct(gauge.zoneMin, gauge.min, gauge.max);
  const zoneWidth = pct(gauge.zoneMax, gauge.min, gauge.max) - zoneLeft;
  const markerLeft = pct(gauge.reading, gauge.min, gauge.max);

  return (
    <div className="flex-1 min-w-[180px]">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-[#A9D3E0]">{gauge.label}</span>
        <span className="font-[family-name:var(--font-mono)] text-sm text-[#EAF6FA]">
          {gauge.reading}
          {gauge.unit ? <span className="text-[#A9D3E0]"> {gauge.unit}</span> : null}
        </span>
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-white/10">
        <div
          className="absolute inset-y-0 rounded-full bg-[#0A5FA4]/50"
          style={{ left: `${zoneLeft}%`, width: `${zoneWidth}%` }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-[#12234A] bg-[#FF6B5B]"
          style={{ left: `${markerLeft}%` }}
        />
      </div>
    </div>
  );
}

const audiences = [
  {
    role: "Office",
    copy: "Schedule routes, review visits, and export records for inspection.",
  },
  {
    role: "Technician",
    copy: "Log chemistry readings, chemical doses, and equipment checks from your phone.",
  },
  {
    role: "Client",
    copy: "Scan the property's QR code to see the latest service visit, anytime.",
  },
];

// ... (gauges, GaugeReadout, audiences stay as before)

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <Image
          src="/images/hero-water.jpg"
          alt="Clear blue pool water"
          fill
          priority
          className="object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(11,27,61,0.80) 0%, rgba(18,35,74,0.72) 45%, rgba(10,95,164,0.55) 100%)",
          }}
        />

        <div className="relative z-10 mx-auto max-w-5xl px-6 py-16 md:py-20">
          <p className="font-[family-name:var(--font-mono)] text-xs font-medium uppercase tracking-[0.2em] text-[#FF6B5B]">
            AquaRunner 24/7 Pro
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-extrabold uppercase leading-[0.95] tracking-tight text-white md:text-6xl">
            Every reading,
            <br />
            on record.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-[#A9D3E0]">
            Technicians log chemistry, doses, and equipment checks in the field. Clients see a
            live QR logbook for every property, anytime.
          </p>

          <div className="mt-10 flex flex-col gap-6 rounded-lg border border-white/10 bg-white/[0.06] p-6 backdrop-blur-sm sm:flex-row sm:gap-10">
            <p className="font-[family-name:var(--font-mono)] shrink-0 text-xs uppercase tracking-wider text-[#A9D3E0] sm:w-28">
              Sample reading
            </p>
            <div className="flex flex-1 flex-col gap-5 sm:flex-row">
              {gauges.map((gauge) => (
                <GaugeReadout key={gauge.label} gauge={gauge} />
              ))}
            </div>
          </div>
        </div>

        {/* Wave divider into the page body */}
        <svg
          className="relative z-10 -mb-1 block w-full"
          viewBox="0 0 1200 80"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,40 C150,80 350,0 600,30 C850,60 1050,10 1200,35 L1200,80 L0,80 Z"
            fill="#EAF6FA"
          />
        </svg>
      </section>

      {/* Who it's for */}
      <section className="mx-auto max-w-5xl px-6 py-14">
        <div className="grid gap-6 sm:grid-cols-3">
          {audiences.map((a) => (
            <div key={a.role} className="rounded-lg border border-[#C9E3EC] bg-white p-6">
              <p className="font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-wide text-[#0A5FA4]">
                {a.role}
              </p>
              <p className="mt-2 text-[#16324A]">{a.copy}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-[#C9E3EC] pt-8">
          <Link
            href="/login"
            className="rounded-md bg-[#0A5FA4] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#084A82]"
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-[#0A5FA4] px-5 py-2.5 text-sm font-semibold text-[#0A5FA4] transition hover:bg-[#0A5FA4]/5"
          >
            View dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
