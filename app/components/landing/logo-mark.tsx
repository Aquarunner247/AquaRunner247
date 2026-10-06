/* eslint-disable @next/next/no-img-element */

/**
 * The app icon, in the corner of every marketing page.
 *
 * Rendered as an <img> to /icons/icon.svg rather than inlined: the traced artwork is ~30KB of path
 * data, which would be repeated in the HTML of every landing page, where one cached file costs nothing
 * after the first view. next/image is skipped on purpose -- it cannot optimise an SVG, so it would add
 * a wrapper and a loader for no gain.
 *
 * The badge version, white rounded square included, and not the bare artwork. This mark appears in the
 * nav on a light warm background AND in the footer on ink (see SiteFooter's onInk class), and the art is
 * brand ink on brand primary -- on the dark footer the runner would all but disappear without a
 * background behind it. The icon as a whole reads on anything, which is what an app icon is for.
 * The previous mark avoided this by being a single-colour outline using currentColor; this one cannot,
 * because it is two-tone.
 *
 * Sized by `.brand svg, .brand img` in landing.module.css, as the outline mark was.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src="/icons/icon.svg"
      alt=""
      aria-hidden="true"
      width={34}
      height={34}
      className={className}
      // Decoding off the critical path: it sits in the sticky header, so it must never hold up first
      // paint of the page behind it.
      decoding="async"
    />
  );
}
