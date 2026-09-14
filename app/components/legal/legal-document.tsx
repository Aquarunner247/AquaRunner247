import { marked } from "marked";

/**
 * Renders a legal-document markdown file (Terms of Service, Privacy Policy) as prose.
 * Server Component only -- `content` is always our own trusted, repo-committed markdown
 * (see content/legal/*.md), never user input, so parsing it with `marked` and injecting the
 * result is safe; this must never be pointed at anything a viewer could influence.
 *
 * The document's own leading "READ BEFORE USING THIS DOCUMENT" blockquote (still present in
 * the raw markdown) is intentionally left in place and rendered like any other blockquote --
 * see each page's own note above this component for why the placeholders stay unfilled.
 */
export function LegalDocument({ content }: { content: string }) {
  const html = marked.parse(content) as string;
  return (
    <article
      className="legal-prose mx-auto max-w-3xl px-6 py-14 text-brand-ink [&_a]:text-brand-primary [&_a]:underline [&_blockquote]:my-6 [&_blockquote]:rounded-lg [&_blockquote]:border [&_blockquote]:border-brand-warn/30 [&_blockquote]:bg-brand-warnFill [&_blockquote]:px-5 [&_blockquote]:py-4 [&_blockquote]:text-brand-warn [&_blockquote_p]:my-1 [&_code]:rounded [&_code]:bg-brand-surface [&_code]:px-1 [&_code]:py-0.5 [&_em]:text-brand-muted [&_h1]:mb-2 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:border-t [&_h2]:border-brand-border [&_h2]:pt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_hr]:my-8 [&_hr]:border-brand-border [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_p]:leading-relaxed [&_strong]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
