"use client";

import { useState, useTransition } from "react";
import { generateCustomerLoginInviteLink } from "./actions";

/**
 * "Get invite link" next to a portal login that hasn't been activated yet -- for when the
 * welcome email isn't getting through (spam filtering, a mistyped address, an inbox nobody
 * checks) and the office wants to hand the customer their activation link directly, through
 * whatever channel actually reaches them.
 *
 * The link is a live bearer credential -- whoever has it can set this customer's password --
 * so it only ever lives in this component's own state. It is never put in a URL, a form
 * action, or anything that would revalidate the page, all of which risk it landing in a log.
 * Closing this (or leaving the page) forgets it; generating again gets a new one.
 */
export function CustomerLoginInviteLink({ customerUserId }: { customerUserId: string }) {
  const [isPending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleGenerate() {
    setError(null);
    setCopied(false);
    startTransition(() => {
      void generateCustomerLoginInviteLink(customerUserId).then((result) => {
        if (result.ok) {
          setLink(result.url);
        } else {
          setLink(null);
          setError(result.reason);
        }
      });
    });
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard access can be denied (permissions, non-HTTPS context) -- the link is still
      // selectable text in the box below, so nothing is actually lost.
    }
  }

  if (link) {
    return (
      <div className="w-full rounded border border-brand-border bg-brand-surface p-2 text-sm">
        <p className="text-xs text-brand-muted">
          Single-use and expires in 48 hours. Anyone with this link can set this customer&rsquo;s password — send it
          only to them.
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input
            type="text"
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="app-field-sm min-w-0 flex-1 text-xs"
          />
          <button type="button" onClick={handleCopy} className="app-btn-secondary-sm">
            {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" onClick={() => setLink(null)} className="app-btn-ghost-sm">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <button type="button" onClick={handleGenerate} disabled={isPending} className="app-btn-ghost-sm">
        {isPending ? "Getting link…" : "Get invite link"}
      </button>
      {error ? <span className="text-xs text-brand-danger">{error}</span> : null}
    </div>
  );
}
