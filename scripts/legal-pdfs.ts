/**
 * Print-ready PDFs of the agreements, built from content/legal/*.md.
 *
 *   npm run legal:pdf                 # writes legal-pdfs/ (gitignored)
 *   npm run legal:pdf -- /some/dir    # somewhere else
 *
 * Why generate rather than keep PDFs in the repo: the markdown is the source every surface
 * already reads -- app/terms, app/privacy, app/dpa, app/eula, app/consumer-terms all render
 * the same files -- so a committed PDF is a copy that goes stale the first time a document is
 * amended and nobody notices until a customer is holding the wrong version. Regenerate after
 * every TERMS_VERSION bump instead; it takes a few seconds.
 *
 * Driven over the DevTools protocol rather than Chrome's --print-to-pdf flag, because only
 * Page.printToPDF accepts a footer template. A document somebody may sign needs its version
 * and "Page 3 of 18" on every page, and the flag can only print Chrome's own footer, file://
 * URL and all. Node's global WebSocket does the talking, so this needs no browser library --
 * Playwright is not a dependency of this project and should not become one for a print job.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { marked } from "marked";
import { COLOR } from "@/lib/design-tokens";

const OUT = resolve(process.argv[2] ?? "legal-pdfs");
const PORT = 9333;

/**
 * The documents, in the order a reader should meet them: the agreement first, then what it
 * incorporates. Deliberately not every file in content/legal/ -- the SLA is an unpublished
 * template with bracketed commitments in it, and the subprocessor and open-source notices are
 * reference pages that are read online rather than signed.
 */
const DOCS = [
  ["terms-of-service", "Terms of Service"],
  ["privacy-policy", "Privacy Policy"],
  ["data-processing-addendum", "Data Processing Agreement"],
  ["end-user-license-agreement", "End User License Agreement"],
  ["consumer-addendum", "Consumer Addendum"],
] as const;

/**
 * A headless Chrome to print with.
 *
 * Playwright's cached browser is the one that is already on the machines this repo is built on
 * (it is what public/og/ was made with), but its directory carries a build number that changes
 * on every update, so the path is discovered rather than written down. CHROME_PATH wins if set.
 */
function findChrome(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const cache = join(homedir(), ".cache", "ms-playwright");
  if (existsSync(cache)) {
    const builds = readdirSync(cache)
      .filter((d) => d.startsWith("chromium-"))
      .sort()
      .reverse();
    for (const build of builds) {
      for (const dir of ["chrome-linux64", "chrome-linux"]) {
        const bin = join(cache, build, dir, "chrome");
        if (existsSync(bin)) return bin;
      }
    }
  }

  for (const bin of [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]) {
    if (existsSync(bin)) return bin;
  }

  throw new Error(
    "No Chrome found. Install one, or set CHROME_PATH to a Chrome or Chromium binary.",
  );
}

/** The stamp lines each document carries at the top, reused in the running footer. */
function stamps(md: string): { version?: string; effective?: string } {
  const grab = (label: string) =>
    md.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]*?)\\s*(?:\\n|$)`))?.[1]?.trim();
  return { version: grab("Version"), effective: grab("Effective Date") };
}

/**
 * Print styling. Screen styling is in app/components/legal-document.tsx and is deliberately
 * not shared: paper wants a serif at 10.5pt on white, a screen wants the product's sans on
 * cream, and trying to serve both produces something that reads badly in either place.
 *
 * No page margins are set here. Page.printToPDF supplies them below, and an `@page` rule
 * silently overrides it -- which prints the body text flush against the edge of the sheet.
 */
const css = `
  * { box-sizing: border-box; }
  body {
    font-family: Georgia, "Times New Roman", serif; font-size: 10.5pt; line-height: 1.5;
    color: ${COLOR.ink}; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .masthead {
    border-bottom: 2px solid ${COLOR.ink}; padding-bottom: 10pt; margin-bottom: 20pt;
    display: flex; justify-content: space-between; align-items: baseline; gap: 18pt;
  }
  .wordmark {
    font-family: Helvetica, Arial, sans-serif; font-weight: 700; font-size: 11pt;
    letter-spacing: 0.04em; text-transform: uppercase;
  }
  .entity { font-size: 8pt; color: ${COLOR.muted}; text-align: right; line-height: 1.4; }
  h1 { font-family: Helvetica, Arial, sans-serif; font-size: 19pt; line-height: 1.2; margin: 0 0 10pt; }
  h2 { font-family: Helvetica, Arial, sans-serif; font-size: 12pt; margin: 20pt 0 6pt; break-after: avoid; }
  h3 { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; margin: 14pt 0 4pt; break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  p { margin: 0 0 8pt; }
  ul, ol { margin: 0 0 8pt; padding-left: 20pt; }
  li { margin-bottom: 3pt; break-inside: avoid; }
  hr { border: 0; border-top: 1px solid ${COLOR.border}; margin: 18pt 0; }
  blockquote {
    margin: 10pt 0; padding: 7pt 12pt; border-left: 3pt solid ${COLOR.primary};
    background: ${COLOR.surface}; break-inside: avoid;
  }
  blockquote p:last-child { margin-bottom: 0; }
  table { width: 100%; border-collapse: collapse; margin: 10pt 0; font-size: 8.5pt; }
  th, td { border: 1px solid ${COLOR.border}; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th {
    background: ${COLOR.foam}; font-family: Helvetica, Arial, sans-serif; font-size: 8pt;
    text-transform: uppercase; letter-spacing: 0.03em;
  }
  tr { break-inside: avoid; }
  code { font-family: "Courier New", monospace; font-size: 9pt; }
  /* A relative link has no address on paper, so print the one a reader can type. */
  a { color: ${COLOR.primary}; text-decoration: none; }
  a[href^="/"]::after {
    content: " (aquarunner247.com" attr(href) ")"; font-size: 8.5pt; color: ${COLOR.muted};
  }
`;

function documentHtml(title: string, md: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>AquaRunner247 ${title}</title><style>${css}</style></head>
<body>
  <div class="masthead">
    <div class="wordmark">AquaRunner 24/7 Pro</div>
    <div class="entity">AquaRunner247 LLC<br>732 S 6th St, Ste N, Las Vegas, NV 89101<br>aquarunner247.com</div>
  </div>
  ${marked.parse(md, { async: false })}
</body></html>`;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const chrome = spawn(findChrome(), [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    "about:blank",
  ], { stdio: "ignore" });

  const socketUrl = await (async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
        return (await res.json()).webSocketDebuggerUrl as string;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    throw new Error("Chrome did not open a debugging port within 10 seconds");
  })();

  const ws = new WebSocket(socketUrl);
  await new Promise((res) => ws.addEventListener("open", res, { once: true }));

  let nextId = 1;
  const pending = new Map<number, (value: Record<string, unknown>) => void>();
  const events = new Map<string, () => void>();

  ws.addEventListener("message", (m) => {
    const msg = JSON.parse(m.data as string);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)!(msg.result);
      pending.delete(msg.id);
    } else if (msg.method && events.has(msg.method)) {
      events.get(msg.method)!();
      events.delete(msg.method);
    }
  });

  const send = (method: string, params: object = {}, sessionId?: string) =>
    new Promise<any>((res) => {
      const id = nextId++;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  const onceEvent = (method: string) => new Promise<void>((res) => events.set(method, res));

  for (const [slug, title] of DOCS) {
    const md = readFileSync(`content/legal/${slug}.md`, "utf8");
    const { version, effective } = stamps(md);
    const stamp = [version && `Version ${version}`, effective && `Effective ${effective}`]
      .filter(Boolean)
      .join(" · ");

    // Chrome prints from a file it can read; the intermediate HTML is left in place because a
    // layout surprise in the PDF is far easier to diagnose in the markup that produced it.
    const htmlPath = join(OUT, `${slug}.html`);
    writeFileSync(htmlPath, documentHtml(title, md));

    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Page.enable", {}, sessionId);
    const loaded = onceEvent("Page.loadEventFired");
    await send("Page.navigate", { url: `file://${htmlPath}` }, sessionId);
    await loaded;

    const footer = `<div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:7.5pt;
        color:${COLOR.muted};padding:0 0.85in;display:flex;justify-content:space-between;">
        <span>AquaRunner247 ${title} · ${stamp}</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`;

    const { data } = await send("Page.printToPDF", {
      printBackground: true,
      paperWidth: 8.5,
      paperHeight: 11,
      marginTop: 0.9,
      marginBottom: 0.85,
      marginLeft: 0.85,
      marginRight: 0.85,
      displayHeaderFooter: true,
      // An empty header still reserves marginTop; without it the first line sits too high.
      headerTemplate: "<span></span>",
      footerTemplate: footer,
    }, sessionId);

    const pdfPath = join(OUT, `AquaRunner247-${title.replace(/ /g, "-")}.pdf`);
    writeFileSync(pdfPath, Buffer.from(data, "base64"));
    await send("Target.closeTarget", { targetId });
    console.log(`${title.padEnd(30)} ${stamp}`);
  }

  ws.close();
  chrome.kill();
  console.log(`\nWritten to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
