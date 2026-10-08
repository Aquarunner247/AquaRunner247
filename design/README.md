# Brand artwork sources

`icon-source.png` (448×400) is the original raster the app icon was drawn from, kept for provenance.

The icon itself is **not** generated from it at build time — `public/icons/icon.svg` is the master, and
every PNG under `public/icons/` plus `public/favicon-32.png` was rendered from that SVG. The raster was
traced once: enlarged 4×, each ink colour separated and traced to vector, then recoloured from the
source's black and `#0078C8` to `brand.ink` and `brand.primary`, which now live in lib/design-tokens.ts.
When the palette moved to the Marbalism navy and Pool Blue, the icon was re-rendered from the same trace
with the new values -- the SVG carries literal hexes, so it does not follow a token change by itself. The source's drop
shadow was dropped, because platforms draw their own and a baked one doubles up on iOS.

`public/icons/icon-art.svg` is the same artwork without the white badge, on transparency, for any
future placement that supplies its own background. Nothing references it today — the landing mark uses
the badge version, because it sits on a light nav AND a dark footer and the ink runner would vanish on
the latter.

To change the icon: edit `public/icons/icon.svg` and re-render the PNGs from it, rather than editing a
PNG. Sizes needed are 32 (favicon, drawn at a tighter crop so it stays legible), 180 (apple-touch),
192 and 512 (manifest `any`), and 192/512 maskable with the art inside the middle 80% because Android
crops those to the launcher's own shape.

**Scale the art by its own bounding box, never by the traced canvas.** The drawing occupies about 71% of
the width and 72% of the height of the canvas it was traced on, so scaling by the canvas leaves the
runner filling barely half the white square and looking lost in it. The build script measures the bounds
from the path coordinates and centres on those.

## Open Graph share images

`public/og/*.png` are rendered from `design/og/og-card.html`, a single 1200x630 template that takes
its text on the query string (`?eyebrow=&head=&accent=&sub=`). The headline's accent fragment is
passed separately so it renders in Coral, the same rule the pages use.

The template repeats five hexes from `lib/design-tokens.ts` because a headless browser cannot import
TypeScript. `lib/__tests__/og-card-palette.test.ts` fails when the two disagree — without it a
palette change leaves the share images behind, which is exactly what happened when the site moved
from teal to navy and nobody noticed until the cards were opened.

Playwright is deliberately **not** a dependency of this project (it pulls a browser download of a
few hundred MB for four PNGs). Render them with a throwaway install:

```sh
npm init -y && npm i playwright && npx playwright install chromium   # in a scratch directory
```

then load `file://<repo>/design/og/og-card.html?<params>` at viewport 1200x630, `deviceScaleFactor: 1`,
await `document.fonts.ready`, and screenshot to `public/og/<page>.png`. The webfonts (Inter, Roboto
Condensed Black Italic) come from Google Fonts over the network, so the render needs connectivity —
check `document.fonts` reports them `loaded` rather than silently falling back to Impact.
