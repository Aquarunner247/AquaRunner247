import styles from "../../landing.module.css";

const SIZE = 25;

// Decorative only — a real scannable code is generated per body of water in the app.
// Finder patterns + timing rows are placed exactly where a real QR puts them so the
// graphic reads as a code rather than as noise; the payload area is deterministic
// (seeded) so it renders identically on the server and the client.
function isFinder(x: number, y: number) {
  const corners: Array<[number, number]> = [
    [0, 0],
    [SIZE - 7, 0],
    [0, SIZE - 7],
  ];
  return corners.some(([ox, oy]) => {
    const dx = x - ox;
    const dy = y - oy;
    if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return false;
    const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
    return ring !== 2;
  });
}

function isQuiet(x: number, y: number) {
  const corners: Array<[number, number]> = [
    [0, 0],
    [SIZE - 8, 0],
    [0, SIZE - 8],
  ];
  return corners.some(([ox, oy]) => x >= ox && x <= ox + 7 && y >= oy && y <= oy + 7);
}

function buildModules() {
  const modules: Array<[number, number]> = [];
  let seed = 0x9e3779b9;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (isFinder(x, y)) {
        modules.push([x, y]);
        continue;
      }
      if (isQuiet(x, y)) continue;
      if (x === 6 || y === 6) {
        if ((x + y) % 2 === 0) modules.push([x, y]);
        continue;
      }
      seed = (seed * 1664525 + 1013904223) >>> 0;
      if (seed % 100 < 47) modules.push([x, y]);
    }
  }
  return modules;
}

const MODULES = buildModules();

export function QrGraphic() {
  return (
    <svg
      className={styles.qrSvg}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label="Decorative QR code placard graphic"
      focusable="false"
      shapeRendering="crispEdges"
    >
      <rect width={SIZE} height={SIZE} className={styles.qrBg} />
      <g className={styles.qrFg}>
        {MODULES.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />
        ))}
      </g>
    </svg>
  );
}
