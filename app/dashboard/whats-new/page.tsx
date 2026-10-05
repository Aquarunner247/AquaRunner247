import fs from "fs";
import path from "path";
import { redirect } from "next/navigation";
import { marked } from "marked";
import { getCurrentAppUser } from "@/lib/auth/current-app-user";

/**
 * What changed in the app, for the people using it.
 *
 * Reads content/changelog.md the same way the Terms and Privacy pages read their own markdown --
 * `process.cwd()` plus a path under content/, which is the pattern already proven to survive Next's
 * file tracing in production rather than a new one invented here.
 *
 * `marked` output is injected directly, which is safe for the same reason it is safe in
 * app/components/legal/legal-document.tsx and for no other: the markdown is our own, committed to the
 * repository, and nothing a viewer can influence ever reaches it. If this is ever pointed at
 * operator-entered or customer-entered text, it needs sanitizing first.
 *
 * Open to any signed-in staff member rather than admins only. A technician benefits most from knowing
 * the dose button can now be undone and that an unfinished stop closes itself out -- those changed how
 * their own screens behave.
 */
const CHANGELOG_PATH = path.join(process.cwd(), "content", "changelog.md");

export default async function WhatsNewPage() {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const html = marked.parse(fs.readFileSync(CHANGELOG_PATH, "utf8")) as string;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <article
        className="app-card [&_a]:text-brand-primary [&_a]:underline [&_code]:rounded [&_code]:bg-brand-surface [&_code]:px-1 [&_code]:py-0.5 [&_em]:text-brand-muted [&_h1]:font-[family-name:var(--font-display)] [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-brand-ink [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:border-t [&_h2]:border-brand-border [&_h2]:pt-6 [&_h2]:font-[family-name:var(--font-display)] [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-brand-ink [&_hr]:my-6 [&_hr]:border-brand-border [&_li]:my-1 [&_p]:my-3 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-brand-ink [&_strong]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-sm"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </main>
  );
}
