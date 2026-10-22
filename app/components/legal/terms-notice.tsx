import Link from "next/link";
import { TERMS_DOCUMENTS } from "@/lib/terms-acceptance";

/**
 * The notice that turns a signup button into an act of assent.
 *
 * Deliberately NOT `text-xs text-brand-muted` like the hints around it. The legal standard this
 * has to meet is "conspicuous", and small grey print immediately above a submit button is the
 * exact pattern courts single out when they decline to enforce an arbitration clause. Body-sized
 * text in the primary ink colour, with the three documents as visibly underlined links, is the
 * cheapest way to be on the right side of that.
 *
 * Links open in a new tab so reading the Terms does not discard a half-filled form -- a notice
 * nobody can act on without losing their work is not much of a notice.
 *
 * Both signup steps render this. Keeping one component means the wording of what was agreed to
 * cannot drift between the page that takes the card and the page that creates the account.
 */
export function TermsNotice({ action }: { action: string }) {
  return (
    <p className="text-sm leading-relaxed text-brand-ink">
      By {action} you agree to our{" "}
      {TERMS_DOCUMENTS.map((doc, i) => (
        <span key={doc.href}>
          <Link
            href={doc.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-primary underline"
          >
            {doc.label}
          </Link>
          {i < TERMS_DOCUMENTS.length - 2 ? ", " : i === TERMS_DOCUMENTS.length - 2 ? " and " : "."}
        </span>
      ))}
    </p>
  );
}
