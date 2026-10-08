import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The marketing design system, as components.
 *
 * Built from the Marbalism handoff (design/marbilism/design-system.md) with Tailwind utilities rather
 * than the CSS module the previous landing pages used, because that is how the handoff specifies
 * everything -- section rhythm as `px-5 py-20 lg:px-12 lg:py-28`, cards as `shadow-xl`, the radius and
 * padding of each component. Expressing those as utilities keeps the spec and the code the same text.
 *
 * Colour comes from brand-* classes, which resolve through lib/design-tokens.ts, so nothing here
 * hardcodes a hex.
 */

/** Section padding, per the handoff's rhythm. `tight` is the shorter `lg:py-24` variant. */
export function Section({
  children,
  tone = "cream",
  tight = false,
  className = "",
  id,
}: {
  children: ReactNode;
  tone?: "cream" | "white" | "navy";
  tight?: boolean;
  className?: string;
  id?: string;
}) {
  const toneClass =
    tone === "navy" ? "bg-brand-ink text-white" : tone === "white" ? "bg-white text-brand-ink" : "bg-brand-surface text-brand-ink";
  return (
    <section id={id} className={`${toneClass} px-5 py-20 sm:px-8 lg:px-12 ${tight ? "lg:py-24" : "lg:py-28"} ${className}`}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

/**
 * The eyebrow: display face, bold, uppercase italic, wide tracking, Coral.
 *
 * Coral on Cream measures 3.1:1, which is under AA for small text -- so this is never the only place a
 * piece of information appears. It labels the heading beneath it, which carries the meaning.
 */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`font-marketing text-sm font-bold uppercase italic tracking-[0.12em] text-brand-cta ${className}`}>
      {children}
    </p>
  );
}

/**
 * A display headline, with the handoff's accent-word rule: the last word or words sit in Coral, keeping
 * the same uppercase italic treatment. `accent` is that trailing fragment.
 *
 * On navy the base is white; on cream it is navy -- passed explicitly rather than guessed from context,
 * since a heading can sit on either.
 */
export function DisplayHeading({
  children,
  accent,
  tone = "light",
  as: Tag = "h2",
  className = "",
}: {
  children: ReactNode;
  accent?: string;
  tone?: "light" | "dark";
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  const base = tone === "dark" ? "text-white" : "text-brand-ink";
  const size = Tag === "h1" ? "text-5xl sm:text-6xl lg:text-7xl" : "text-4xl sm:text-5xl lg:text-6xl";
  return (
    <Tag className={`font-marketing font-black uppercase italic leading-[0.95] tracking-[-0.04em] ${size} ${base} ${className}`}>
      {children}
      {accent ? <span className="text-brand-cta"> {accent}</span> : null}
    </Tag>
  );
}

/**
 * Primary call to action: Coral fill, bold, 0.375rem radius.
 *
 * The label is Navy, not the White the handoff specifies. White on Coral measures 3.04:1 -- below AA on
 * the main action of every page -- while Navy on the same Coral is 4.78:1 and keeps the colour exactly.
 * Darkening Coral enough for white text turns it into a different, muddier colour.
 */
export function PrimaryButton({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-[44px] items-center justify-center rounded-md bg-brand-cta px-6 py-4 font-sans text-base font-bold text-brand-ink transition-colors hover:bg-brand-ctaHover ${className}`}
    >
      {children}
    </Link>
  );
}

/** Outline button: transparent, 1px border at 35%, bold. Border and text turn Coral on hover. */
export function SecondaryButton({
  href,
  children,
  tone = "light",
  className = "",
}: {
  href: string;
  children: ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  const toneClass =
    tone === "dark"
      ? "border-white/35 text-white hover:border-brand-cta hover:text-brand-cta"
      : "border-brand-ink/35 text-brand-ink hover:border-brand-cta hover:text-brand-cta";
  return (
    <Link
      href={href}
      className={`inline-flex min-h-[44px] items-center justify-center rounded-md border px-6 py-4 font-sans text-base font-bold transition-colors ${toneClass} ${className}`}
    >
      {children}
    </Link>
  );
}

/**
 * Card: white, 1rem radius, hairline border, shadow-xl, 1.75rem padding on desktop.
 * `lift` adds the feature-card hover: up 4px with a Coral border.
 * On navy sections the fill is Deep Sea with a white-at-10% border, per the handoff.
 */
export function Card({
  children,
  tone = "light",
  lift = false,
  className = "",
}: {
  children: ReactNode;
  tone?: "light" | "dark";
  lift?: boolean;
  className?: string;
}) {
  const toneClass =
    tone === "dark" ? "border-white/10 bg-brand-anchor text-white" : "border-brand-border bg-white text-brand-ink shadow-xl";
  const liftClass = lift ? "transition-transform duration-200 hover:-translate-y-1 hover:border-brand-cta" : "";
  return <div className={`rounded-2xl border p-6 lg:p-7 ${toneClass} ${liftClass} ${className}`}>{children}</div>;
}

/** The numeral that labels a stat or a feature card: display face, Coral, oversized. */
export function CardNumber({ children }: { children: ReactNode }) {
  return <span className="font-marketing text-4xl font-black italic leading-none text-brand-cta">{children}</span>;
}

/** Icon chip: mist fill, Pool Blue icon, 0.75rem radius and padding. */
export function IconChip({ children }: { children: ReactNode }) {
  return <span className="inline-flex rounded-xl bg-brand-mist p-3 text-brand-primary">{children}</span>;
}
