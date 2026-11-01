# Email white-labelling — what an org gets, and what it can't have yet

What a pool company's own customers see when AquaRunner emails them on that
company's behalf, how much of it the company controls, and what it would take to
let them send from their own domain.

## Three layers, and only two of them are paid

| Layer | What it is | Tier-gated? |
|---|---|---|
| **Reply-to** | Replies reach the org, not us | **No — every org** |
| **Sender name** | `"Their Business Name" <service@mail.aquarunner247.com>` | Yes |
| **Body chrome** | Their logo, primary colour, header colour, footer | Yes |

Reply-to is `Organization.welcomeEmailSupportEmail` and is applied on welcome
emails, service summaries and customer alerts alike, with no tier check. That is
deliberate: a customer replying to a service summary is doing a reasonable
thing, and routing that reply to a human should not be something a pool company
has to pay extra for.

The other two run through `hasWhiteLabelBranding()`
(`lib/plan-tiers-core.ts:61`), which is true for `WHITE_LABEL`, `ENTERPRISE`,
and any `COMPED` org.

## The gate is evaluated per send, not stored

Callers pass `branding: hasWhiteLabelBranding(org) ? {...} : null`, and
`resolveEmailBranding(null)` returns the platform's own look. So an org whose
tier lapses reverts to AquaRunner branding on its very next email — the stored
logo and colours stay in the database untouched, they simply stop being applied.
There is no job to run and no state to clean up, and the same rule holds in the
portal.

## What is validated, and why

- **Sender name** is sanitised before it reaches the header
  (`sanitizeFromName`): CR and LF are stripped first, because the value is
  operator-controlled and lands in a mail header where a newline would let it
  inject headers of its own. Quotes and backslashes are dropped rather than
  escaped, and the whole thing is capped at 78 characters and emitted quoted, so
  an ampersand or apostrophe in a business name needs no special casing.
- **Logo URL** must be `https:` (`isSafeLogoUrl`). Anything else is ignored
  rather than rendered.
- **Colours** must match `/^#[0-9A-Fa-f]{6}$/` or the platform default is used.
  A malformed hex degrades to the house colour instead of producing a broken
  email.

## The hard limit: the envelope is always ours

Every email, for every org, on every tier, is sent from:

```
service@mail.aquarunner247.com
```

That is a constant in `lib/mail/from-address.ts`, not an environment variable,
and that is on purpose — seven copies of `process.env.RESEND_FROM_EMAIL || ...`
drifted apart, and on 2026-10-02 a service summary went out as `no-reply@` hours
after the address changed, because Vercel bakes env vars into a deployment and
that build still carried the old value. Removing it from the dashboard could not
fix a build that already had it. Changing the sending address is now a code
change.

So today's white-labelling is **their name and their look on our envelope**. A
customer who inspects the sender sees `mail.aquarunner247.com`. For most pool
companies that is invisible; for one that cares, it is the gap.

## Sending from the org's own domain — not built

Resend supports it, and the shape is well understood. It is not a small feature,
and the failure mode is severe, so it is written down here rather than half
started.

What it needs:

1. **A Resend domain per org**, created through their API, which returns the DNS
   records for that domain.
2. **The customer adds those records** — SPF, DKIM, and ideally DMARC — at their
   registrar. This is the step that makes it a support burden rather than a
   feature: it is their IT, their registrar, their timeline, and most small pool
   companies will need walking through it.
3. **Verification polling and a status UI**, because DNS propagation is not
   instant and "I added them, why isn't it working" needs an answer the operator
   can read.
4. **A per-org from address** replacing the constant, resolved at send time.

The dangerous part is step 4. Resend rejects a send from an unverified domain
outright, so a per-org address that is wrong or whose DNS later breaks stops
**all** mail for that org rather than degrading. Any implementation needs to
fall back to `service@mail.aquarunner247.com` when the org's domain is not
currently verified, and that fallback has to be checked at send time, not cached
from setup.

Two things that are easy to forget:

- **Deliverability resets.** A newly verified domain has no sending reputation.
  The org's first emails are more likely to land in spam than ours are, which
  means their first impression of the feature can be worse than not having it.
  Warm-up matters.
- **Only the From changes.** Links in the email still point at
  `aquarunner247.com` unless the portal is on a custom domain too, which is a
  separate piece of work.

## Related

- `lib/mail/from-address.ts` — the sender constant and name sanitising
- `lib/mail/email-branding.ts` — logo, colour and chrome resolution
- `lib/plan-tiers-core.ts` — `hasWhiteLabelBranding`
- `lib/__tests__/email-palette.test.ts` — renders every sender, and catches a
  `${COLOR.x}` written outside a template literal
