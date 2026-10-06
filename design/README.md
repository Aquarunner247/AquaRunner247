# Brand artwork sources

`icon-source.png` (448×400) is the original raster the app icon was drawn from, kept for provenance.

The icon itself is **not** generated from it at build time — `public/icons/icon.svg` is the master, and
every PNG under `public/icons/` plus `public/favicon-32.png` was rendered from that SVG. The raster was
traced once: enlarged 4×, each ink colour separated and traced to vector, then recoloured from the
source's black and `#0078C8` to `brand.ink` and `brand.primary` (tailwind.config.ts). The source's drop
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
