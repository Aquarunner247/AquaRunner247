import { Marked, Renderer } from "marked";

/**
 * Wraps every table in a horizontally scrollable div.
 *
 * The sub-processor annexes and the Privacy Policy's retention table are four and two
 * columns of real prose; at phone width an unwrapped table widens the whole document and
 * the page itself scrolls sideways, which DESIGN-SYSTEM.md rules out. Scrolling the table
 * instead keeps the page fixed. `.legal-table-scroll` and the table styling it pairs with
 * live in globals.css under `.legal-prose`.
 *
 * `base.table` rather than `super`/`this.table`: the object passed to `Marked` is merged
 * over the default renderer, so calling `this.table` here would recurse into this same
 * override. A standalone default Renderer gives the original implementation to delegate to.
 */
const base = new Renderer();
const markdown = new Marked({
  renderer: {
    table(token) {
      return `<div class="legal-table-scroll">${base.table.call(this, token)}</div>`;
    },
  },
});

/**
 * Renders a legal-document markdown file (Terms of Service, Privacy Policy, DPA, EULA,
 * sub-processor list, open-source notices) as prose.
 *
 * Server Component only -- `content` is always our own trusted, repo-committed markdown
 * (see content/legal/*.md), never user input, so parsing it with `marked` and injecting the
 * result is safe; this must never be pointed at anything a viewer could influence.
 *
 * A document's own leading blockquote banner, where it still has one, is intentionally left
 * in place and rendered like any other blockquote -- see each page's own note above this
 * component for why the remaining placeholders stay unfilled.
 */
export function LegalDocument({ content }: { content: string }) {
  const html = markdown.parse(content) as string;
  return (
    <article
      className="legal-prose mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-8 lg:px-12 text-brand-ink [&_a]:text-brand-primary [&_a]:underline [&_blockquote]:my-6 [&_blockquote]:rounded-lg [&_blockquote]:border [&_blockquote]:border-brand-warn/30 [&_blockquote]:bg-brand-warnFill [&_blockquote]:px-5 [&_blockquote]:py-4 [&_blockquote]:text-brand-warn [&_blockquote_p]:my-1 [&_code]:rounded [&_code]:bg-brand-surface [&_code]:px-1 [&_code]:py-0.5 [&_em]:text-brand-muted [&_h1]:mb-2 [&_h1]:font-marketing [&_h1]:text-4xl [&_h1]:font-black [&_h1]:uppercase [&_h1]:italic [&_h1]:leading-[0.95] [&_h1]:tracking-[-0.04em] sm:[&_h1]:text-5xl [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:border-t [&_h2]:border-brand-border [&_h2]:pt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_hr]:my-8 [&_hr]:border-brand-border [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_p]:leading-relaxed [&_strong]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
