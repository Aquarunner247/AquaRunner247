> **READ BEFORE USING THIS DOCUMENT.** This is a drafting placeholder pending attorney review,
> like the other documents in this directory. The table below was carried over from the Data
> Processing Addendum's Exhibit B, which was compiled by reading the codebase rather than copied
> from an earlier draft — but it still contains bracketed placeholders that must be resolved, and
> the entity name and notice period must match the executed DPA before this page is published.

# Sub-processors

AquaRunner 24/7 engages the service providers below to help operate the Service. Each is bound by a
written agreement requiring it to protect personal data and to use it only for the purposes we
specify.

This page is the list referred to in Section 6.2 of our [Data Processing Addendum](/dpa). We update
it when a sub-processor is added or removed, and notify organization admin contacts as that section
describes.

**Last updated:** [DATE]

| Sub-processor | Purpose | Data involved |
|---|---|---|
| **Supabase** | Authentication, database hosting | All customer data held in the Service |
| **Vercel** | Application hosting, edge infrastructure | All customer data in transit through the Service |
| **Resend** | Transactional email delivery | Recipient email address, email content (service summaries, alerts, account emails) |
| **Twilio** | Inbound phone call handling, recording, transcription | Caller phone number, call audio recordings, call transcripts |
| **[OpenAI / model provider currently configured], via Vercel AI Gateway** | Parsing call transcripts into structured service requests; extracting structured data from uploaded inspection reports | Call transcript text; inspection report document content |
| **Google (Dialogflow)** | Conversational phone-agent fulfillment | Caller conversation content relevant to the phone agent flow |
| **[Payment processor, e.g. Stripe]** | Subscription billing | Billing contact name/email; payment method details (tokenized — not stored by AquaRunner) |

## Changes to this list

Before a new sub-processor begins processing personal data, we will update this page and give
notice as set out in Section 6.2 of the Data Processing Addendum. An organization with a reasonable
data-protection objection may raise it as that section describes.

## Questions

Contact us at [PRIVACY CONTACT EMAIL].
