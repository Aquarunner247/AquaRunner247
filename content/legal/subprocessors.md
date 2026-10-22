# Sub-processors

AquaRunner247 LLC engages the service providers below to help operate the AquaRunner 24/7 Pro
service. Each is bound by its agreement with us to protect the information it handles and to use it
only for the purpose shown.

This page is the list referred to in Section 5.3 of our [Data Processing Agreement](/dpa) and in
Section 10 of our [Privacy Policy](/privacy). We update it when a sub-processor is added or removed,
and notify organization admin contacts as Section 5.3 describes.

**Last updated:** October 22, 2026

| Sub-processor | Purpose | Processing location | Information involved |
|---|---|---|---|
| **Supabase** | Authentication, primary database, and file storage for visit photos, customer documents, and safety data sheets | United States | Account data, all customer data held in the service, uploaded files, usage data |
| **Vercel** | Application hosting, edge infrastructure, and Blob storage for post-cancellation data archives | United States | Customer data in transit through the service; archived customer data, including photo and inspection-report files |
| **Resend** | Transactional email delivery | United States | Recipient email address, email content (service summaries, alerts, account and billing emails) |
| **Twilio** | Inbound phone call handling, recording, and transcription for calls to an organization's configured number | United States | Caller phone number, call audio recordings, call transcripts |
| **OpenAI**, via Vercel AI Gateway | Parsing call transcripts into structured service requests; extracting structured data from uploaded inspection reports | United States | Call transcript text; inspection report document content |
| **Google (Dialogflow)** | Conversational phone-agent fulfillment | United States | Caller conversation content relevant to the phone agent flow |
| **Stripe** | Subscription billing and payment processing | United States | Billing contact name and email; tokenized payment method details, which we do not store |
| **Sentry** | Application error monitoring | United States | Error reports, which may include an account or user identifier, the request involved, and IP address |
| **Dash0** | Server log and performance-trace collection | United States | Server logs and request traces, which may include request paths and account identifiers |
| **OpenStreetMap Foundation** (Nominatim) | Geocoding — converting a property street address into map coordinates | Europe | Property street addresses submitted for geocoding |
| **FOSSGIS e.V.** (Project OSRM) | Driving-route and travel-time calculation for route optimization | Europe | Map coordinates of the stops on a route |
| **OpenStreetMap Foundation** (map tiles) | Street map imagery displayed in the app | Europe | IP address; coordinates of the map area being viewed |
| **Esri** (ArcGIS Online) | Satellite map imagery used by the location picker | United States | IP address; coordinates of the map area being viewed |

## The three providers outside the United States

Everything we store lives in the United States. Three map-related providers are the exception, and
they are listed above as operating from Europe: the OpenStreetMap Foundation, which turns a street
address into map coordinates and supplies street map imagery, and FOSSGIS e.V., which calculates
driving routes and travel times.

Those three receive **only street addresses and map coordinates**, and only at the moment someone
geocodes an address, optimizes a route, or looks at a map. They receive no chemistry readings, no
inspection records, no photos, no documents, no call recordings, and no contact names, email
addresses, or phone numbers.

We rely on the publicly published usage policies and privacy notices of those three rather than on a
negotiated data processing agreement with each. An organization that does not want property addresses
sent outside the United States can tell us, and we will disable address autocomplete, geocoding, and
route optimization for its account; stops can still be ordered by hand.

## Not a sub-processor: Intuit / QuickBooks

The service can generate customer, chemical-expense, and technician-pay files in a format QuickBooks
can import. Those are files an administrator downloads. The service does not connect to QuickBooks,
does not transmit anything to Intuit, and Intuit receives no information from us.
