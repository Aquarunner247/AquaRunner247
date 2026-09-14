# Data Processing Addendum — AquaRunner 24/7 Pro

**Last Updated: [DATE]**

> **⚠️ READ BEFORE USING THIS DOCUMENT**
> Same caveats as the Terms of Service and Privacy Policy, plus a few specific to this one:
> 1. **Form the LLC first, and have a licensed attorney review this before sending it to any customer.** A DPA is a contractual exhibit an Enterprise/Compliance-tier customer's own legal/procurement team will read closely — more so than the Terms or Privacy Policy — so it needs real review, not just a placeholder swap.
> 2. **This is written as a dual-purpose document**: it covers the CCPA/CPRA "service provider" contract-term requirements most of your customers will actually care about (since the Service is U.S.-only today — see Privacy Policy Section 9), while also including standard GDPR Article 28 "processor" language in case a customer's own compliance program asks for it regardless. If you never plan to touch EU/UK data, an attorney may tell you to trim Section 9 and the international-transfer language — don't do that yourself.
> 3. **Confirm the sub-processor list in Section 6 and Exhibit A is current before sending this to anyone.** It was assembled by checking the actual codebase, not copied from the Privacy Policy draft — as of this writing, **the Privacy Policy's own Section 4.1 sub-processor list is missing several of these (Twilio, OpenAI, Google Dialogflow)** and should be updated to match before you publish either document. See the note this drafting session left about that.
> 4. **This is meant to be executed per-customer** (typically as a signed exhibit or click-through at contract time for Enterprise/Compliance tiers), not merely browsed like the Terms or Privacy Policy — decide with your attorney how you want to handle signature/version tracking (a dated PDF exhibit, a DocuSign flow, a checkbox at upgrade time, etc.) before offering it.
> 5. Replace every `[BRACKETED]` placeholder before use.

---

## 1. Purpose and Scope

This Data Processing Addendum ("**DPA**") supplements and is incorporated into the Terms of Service (the "**Agreement**") between **[COMPANY NAME, LLC]** ("**AquaRunner**," "**we**," "**us**") and the Organization that has agreed to the Agreement ("**Organization**," "**you**"). It applies to AquaRunner's processing of Personal Data on your behalf in connection with the Service, and reflects the parties' agreement regarding that processing under applicable Data Protection Laws.

If there's a conflict between this DPA and the Agreement regarding the processing of Personal Data, this DPA controls. Capitalized terms not defined here have the meaning given in the Agreement or the Privacy Policy.

## 2. Definitions

**2.1 "Data Protection Laws"** means all laws and regulations applicable to the processing of Personal Data under this DPA, including, as applicable, the California Consumer Privacy Act as amended by the California Privacy Rights Act ("**CCPA**"), other U.S. state privacy laws, and, to the extent applicable, the EU/UK General Data Protection Regulation ("**GDPR**").

**2.2 "Personal Data"** means information relating to an identified or identifiable natural person that AquaRunner processes on the Organization's behalf under the Agreement — principally the Customer Data described in Exhibit A.

**2.3 "Processing"** (and "process") means any operation performed on Personal Data, including collection, storage, use, disclosure, and deletion.

**2.4 "Business," "Controller," "Processor," "Service Provider," and "Sub-processor"** have the meanings given in the applicable Data Protection Law. For clarity: with respect to Personal Data about your End Customers, you are the Business/Controller and AquaRunner is your Service Provider/Processor. AquaRunner never acts as a Business or Controller with respect to your End Customers' Personal Data — we process it only on your instructions, as described in this DPA.

**2.5 "End Customer"** and **"Authorized User"** have the meanings given in the Terms of Service.

## 3. Roles of the Parties

**3.1** As between the parties, the Organization is the Business/Controller of Personal Data relating to its End Customers and Authorized Users, and determines the purposes and means of processing that data by using the Service. AquaRunner is the Organization's Service Provider/Processor and processes that Personal Data only for the purposes described in Exhibit A and as necessary to provide, secure, and support the Service — never for AquaRunner's own independent business purposes, and never selling or sharing it as those terms are defined under the CCPA.

**3.2** The Organization is solely responsible for: (a) the accuracy and lawfulness of Personal Data it inputs into the Service; (b) having a lawful basis and, where required, appropriate notices or consents from End Customers and Authorized Users for AquaRunner to process their Personal Data as described here; and (c) responding to its own regulatory obligations as the Business/Controller.

## 4. Processing Instructions

AquaRunner will process Personal Data only: (a) to provide, maintain, secure, and support the Service in accordance with the Agreement; (b) on the Organization's documented instructions, which the Organization gives by configuring and using the Service (for example, entering a body of water's chemistry readings, inviting an End Customer to the portal, or uploading a photo or inspection report); and (c) as required by law, in which case AquaRunner will inform the Organization before processing unless the law prohibits doing so.

AquaRunner will promptly notify the Organization if, in its opinion, an instruction violates applicable Data Protection Laws.

## 5. Confidentiality and Personnel

AquaRunner will ensure that personnel authorized to process Personal Data are subject to confidentiality obligations (whether contractual or statutory) and receive appropriate training, and that access is limited to what's needed to perform their role. This is enforced today through role-scoped accounts (Admin/Office/Technician) and tenant-scoped data access — an Authorized User at one Organization cannot query another Organization's data through the Service.

## 6. Sub-processors

**6.1 Authorization.** The Organization authorizes AquaRunner to engage the Sub-processors listed in Exhibit A to process Personal Data in connection with the Service, subject to a written agreement imposing data protection obligations materially no less protective than this DPA.

**6.2 Changes.** AquaRunner will maintain an up-to-date list of Sub-processors at [SUB-PROCESSOR LIST URL, e.g. aquarunner247.com/subprocessors] and will provide notice (by email to the Organization's admin contact, or by updating that page with at least [10] days' advance notice where practicable) before adding a new Sub-processor. If the Organization has a reasonable data-protection objection to a new Sub-processor, it may raise it in writing within [15] days of notice; the parties will work in good faith to resolve it, and if they can't, either party may terminate the affected portion of the Service as its sole remedy.

**6.3 Liability.** AquaRunner remains responsible for each Sub-processor's performance of its data protection obligations to the same extent AquaRunner would be liable if performing those services directly.

## 7. Security Measures

AquaRunner will implement and maintain appropriate technical and organizational measures to protect Personal Data, including:
- Encryption of data in transit (TLS) between the Service, its hosting infrastructure, and End Users' devices
- Tenant-level data segregation, so one Organization's data is not accessible to another Organization through the Service
- Role-based access control within an Organization's account (Admin, Office, Technician roles with different data/action permissions)
- Authentication via a dedicated identity provider rather than custom-built credential storage
- Bot/abuse protection on public-facing forms
- [Add any additional measures once finalized — e.g., specific backup/retention schedule, incident response plan, vendor security review process, employee background checks/training cadence]

*(Flag for your attorney/security reviewer: an Enterprise or Compliance-tier customer's procurement team will often ask for more detail here than a Starter/Pro customer would — consider whether you want a more detailed security exhibit available on request, separate from this general DPA language, rather than expanding this section indefinitely.)*

## 8. Assistance with Data Subject Requests

Taking into account the nature of the processing, AquaRunner will provide reasonable assistance to the Organization, by appropriate technical and organizational measures, to help the Organization respond to requests from End Customers or Authorized Users to exercise their rights under applicable Data Protection Laws (such as access, correction, or deletion requests) — largely through Service features that let the Organization access, export, and delete Customer Data directly (see Privacy Policy Section 6 and Terms of Service Section 5.4), supplemented by our own reasonable cooperation where the Organization can't accomplish this through the Service itself.

If AquaRunner receives a request directly from an End Customer or Authorized User relating to their Personal Data, we will, unless prohibited by law, direct the requester to the Organization and notify the Organization promptly rather than responding to the request ourselves, since the Organization is the Business/Controller of that data.

## 9. Personal Data Breach Notification

AquaRunner will notify the Organization without undue delay, and in any case within [72] hours, after becoming aware of a Personal Data Breach affecting the Organization's Personal Data. That notice will describe, to the extent then known: the nature of the breach, the categories and approximate number of data subjects and records affected, the likely consequences, and the measures taken or proposed to address it. AquaRunner will provide updates as more information becomes available and will reasonably cooperate with the Organization's own investigation and any legally required notifications, at the Organization's expense for anything beyond AquaRunner's own reasonable cooperation.

*("Personal Data Breach" should be defined consistently with however your attorney defines it elsewhere in these documents — typically a breach of security leading to accidental or unlawful destruction, loss, alteration, unauthorized disclosure of, or access to, Personal Data.)*

## 10. Return and Deletion of Data

On termination of the Agreement, AquaRunner will make Customer Data available for export and will delete it in accordance with Terms of Service Section 5.4 (the [30]-day post-termination export window, followed by deletion except where longer retention is required by law or for legitimate backup/security purposes). This DPA doesn't create a longer or shorter deletion obligation than that section already describes.

## 11. Audits

On the Organization's reasonable written request, no more than once per 12-month period (unless required by a regulator or following a Personal Data Breach), AquaRunner will make available information reasonably necessary to demonstrate compliance with this DPA — which may take the form of this DPA itself, a summary of the security measures in Section 7, relevant third-party certifications or audit reports AquaRunner has obtained (if any), or responses to a reasonable written questionnaire — rather than an on-site audit, unless required by applicable Data Protection Law. Any on-site audit is at the Organization's expense, subject to reasonable scheduling, confidentiality, and scope limits, and no more than once per 12-month period absent a Personal Data Breach or regulatory requirement.

## 12. International Transfers

The Service processes Personal Data in the United States. AquaRunner does not currently transfer Personal Data outside the United States in connection with the Service. [If any Sub-processor in Exhibit A processes data outside the U.S. — confirm this before publishing, since some AI/cloud vendors route requests through multiple regions — this section needs a real transfer mechanism (e.g., Standard Contractual Clauses) added, not left silent.]

## 13. Liability

Each party's liability arising out of or related to this DPA is subject to the limitations and exclusions of liability in the Agreement (Terms of Service Section 13). Nothing in this DPA expands either party's liability beyond what the Agreement already provides.

## 14. Term

This DPA remains in effect for as long as AquaRunner processes Personal Data on the Organization's behalf under the Agreement, and terminates automatically upon expiration or termination of the Agreement.

## 15. Miscellaneous

- **Order of precedence.** If this DPA conflicts with the Agreement on a data-protection matter, this DPA controls; on all other matters, the Agreement controls.
- **Governing law.** This DPA is governed by the same governing law and dispute-resolution terms as the Agreement (Terms of Service Sections 15–16).
- **Entire agreement.** This DPA, the Agreement, and the Privacy Policy are the parties' entire agreement regarding the processing of Personal Data under the Service.

## 16. Contact

Questions about this DPA: [PRIVACY/LEGAL EMAIL]
[COMPANY NAME, LLC]
[BUSINESS ADDRESS]

---

## Exhibit A — Details of Processing

*(This annex is what most attorneys reviewing a DPA read first — keep it accurate and specific rather than generic. The contents below were checked against the actual application, not copied from a template.)*

**Subject matter.** AquaRunner's processing of Personal Data on the Organization's behalf in order to provide the Service described in the Agreement.

**Duration.** For the term of the Agreement, plus the post-termination export/deletion window in Terms of Service Section 5.4.

**Nature and purpose of processing.** Hosting, storing, and displaying Customer Data within the Service; sending transactional emails and notifications; recording and transcribing inbound phone calls made to an Organization's configured phone number and using that transcript to log service requests or route the call; extracting structured data (dates, equipment, readings) from uploaded inspection report documents; processing subscription payments; providing customer support.

**Categories of data subjects.** The Organization's Authorized Users (technicians, office staff, admins); the Organization's End Customers and their own contacts/property managers; individuals who call the Organization's configured phone number, whether or not they become an End Customer.

**Categories of Personal Data.**
- Contact information: name, email, phone number, business/property address
- Service records: water chemistry readings, service visit logs, technician notes, equipment records tied to a specific property/body of water
- Photos taken during service visits
- Uploaded documents (inspection reports) and any personal data they happen to contain (e.g., an inspector's name)
- Call recordings and transcripts for calls to an Organization's configured phone number
- Technician GPS location at the moment of logged arrival at a service visit (not continuous location tracking)
- Account/billing information (billing contact name, email; payment details are processed by our payment processor, not stored by AquaRunner)
- Usage and device data (IP address, browser/device identifiers, actions taken in the Service)

**Sensitive data.** The Service isn't designed to collect Social Security numbers, government ID numbers, health information, or similarly sensitive categories, and the Organization agrees not to input such data into the Service.

## Exhibit B — Sub-processors

As of this document's last update, AquaRunner uses the following Sub-processors. *(Confirm each of these against your actual production configuration before publishing — this list was compiled from the current codebase, not carried over from an earlier draft.)*

| Sub-processor | Purpose | Data involved |
|---|---|---|
| **Supabase** | Authentication, database hosting | All Customer Data described in Exhibit A |
| **Vercel** | Application hosting, edge infrastructure | All Customer Data in transit through the Service |
| **Resend** | Transactional email delivery | Recipient email address, email content (service summaries, alerts, account emails) |
| **Twilio** | Inbound phone call handling, recording, transcription | Caller phone number, call audio recordings, call transcripts |
| **[OpenAI / model provider currently configured], via Vercel AI Gateway** | Parsing call transcripts into structured service requests; extracting structured data from uploaded inspection reports | Call transcript text; inspection report document content |
| **Google (Dialogflow)** | Conversational phone-agent fulfillment | Caller conversation content relevant to the phone agent flow |
| **[Payment processor, e.g. Stripe]** | Subscription billing | Billing contact name/email; payment method details (tokenized — not stored by AquaRunner) |

*(Privacy Policy Section 4.1 was reconciled to match this table as of this DPA's drafting date — if either list changes going forward, update both together so they don't drift apart again.)*
