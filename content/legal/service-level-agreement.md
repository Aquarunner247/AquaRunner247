# Service Level Agreement (SLA) Addendum

**Last Updated:** October 22, 2026  
**Effective Date:** October 22, 2026

> **NOT IN EFFECT.** This SLA is a template. It creates no obligation and grants no service
> credits unless and until it is attached to a signed order form, with the bracketed figures
> below completed for that deal. AquaRunner247 publishes no availability commitment today and
> does not operate a public status page. Nothing in the Terms of Service, the Privacy Policy,
> the End User License Agreement, or the Data Processing Agreement incorporates this document.

This Service Level Agreement (“**SLA**”) is entered into by and between **AquaRunner247 LLC** (“**AquaRunner**,” “**we**,” or “**us**”) and the customer identified in the applicable order form or account (“**Customer**” or “**you**”).

## 1. Purpose and Scope

1.1 **Covered subscriptions.** This SLA applies only to Customers with an active, paid subscription that is designated as eligible for this SLA in an order form or other written agreement, and whose account is in good standing. Eligible subscriptions include the tiers currently referred to as Custom/Enterprise and Compliance, or successor tier names designated by AquaRunner.

1.2 **Supplement to Terms.** This SLA supplements and is incorporated into the Terms of Service between AquaRunner and Customer (the “**Terms**”). It also supplements the Privacy Policy, End User License Agreement, and Data Processing Agreement (“**DPA**”), where applicable.

1.3 **Limited precedence.** If this SLA conflicts with the Terms, this SLA controls only with respect to Service availability, support, and Service Credits. The Terms govern all other matters. The DPA governs the processing of personal data.

1.4 **Excluded offerings.** This SLA does not apply to free trials, beta or preview features, evaluation accounts, or third-party services that are not part of the covered Service. It does not apply to outages or service interruptions outside AquaRunner’s reasonable control, as further described in Section 5.

## 2. Definitions

2.1 **“Service”** means the production version of AquaRunner 24/7 Pro made available under Customer’s eligible subscription, including its core hosted route-management, pool-service recordkeeping, compliance workflow, customer portal, and related platform functions. It does not include beta features or third-party services that are not controlled by AquaRunner.

2.2 **“Monthly Uptime Percentage”** means the percentage calculated for a calendar month as:

> **(Total Minutes in the Month − Eligible Downtime Minutes) ÷ Total Minutes in the Month × 100**

Scheduled maintenance and the exclusions in Section 5 are not counted as Eligible Downtime.

2.3 **“Downtime”** means a period during which the core hosted Service is materially unavailable to Customer due to a failure within AquaRunner’s reasonable control. A feature-level issue will count as Downtime only if it materially prevents use of a core Service function.

2.4 **“Eligible Downtime”** means Downtime that is not excluded under Section 5 and is verified by AquaRunner’s monitoring systems or other reasonable evidence.

2.5 **“Business Hours”** means **[DAYS AND HOURS, PACIFIC TIME]**, excluding U.S. federal holidays, unless a different schedule is specified in Customer’s order form.

2.6 **“Support Response Time”** means the target time for AquaRunner to acknowledge a support request and begin initial triage. It is not a commitment to resolve the issue within that time.

2.7 **“Support Credit”** or **“Service Credit”** means a credit applied to a future invoice under Section 7. Credits are not cash refunds and have no cash value.

## 3. Service Availability Commitment

3.1 **Monthly commitment.** AquaRunner will use commercially reasonable efforts to make the core Service available with a Monthly Uptime Percentage of at least **[99.5]%** in each calendar month, excluding scheduled maintenance and the events listed in Section 5.

3.2 **Measurement.** AquaRunner will calculate Monthly Uptime Percentage using its reasonable monitoring and incident records for the production Service. If monitoring data is incomplete, AquaRunner may use other reasonable technical evidence to assess an availability incident.

3.3 **Status information.** AquaRunner will publish Service status and incident updates at **[STATUS PAGE URL]**. The status page is an informational resource and may not reflect an incident in real time.

3.4 **Scope of commitment.** This commitment applies to the hosted Service, not to uninterrupted operation of any individual device, mobile carrier, internet connection, GPS receiver, or third-party service.

## 4. Scheduled and Emergency Maintenance

4.1 **Scheduled maintenance.** AquaRunner will use commercially reasonable efforts to provide at least **[48] hours’** advance notice of scheduled maintenance by email, in-app notice, or the status page. Scheduled maintenance will be conducted during **[MAINTENANCE WINDOW AND TIME ZONE]** where reasonably practicable.

4.2 **Emergency maintenance.** AquaRunner may perform emergency maintenance when reasonably necessary to protect the security, stability, or integrity of the Service, or to address an urgent operational issue. AquaRunner will provide notice as soon as practicable.

4.3 **Maintenance classification.** Scheduled maintenance and emergency maintenance conducted in good faith are excluded from Eligible Downtime.

## 5. Exclusions from Eligible Downtime

Downtime does not qualify as Eligible Downtime to the extent it results from:

a. outages, failures, or delays of third-party providers or services outside AquaRunner’s reasonable control, including hosting, database, authentication, email, telephony, artificial intelligence, geocoding, routing, mapping, monitoring, payment, or integration services (which may include Supabase, Vercel, Resend, Twilio, OpenAI via Vercel AI Gateway, Google Dialogflow, Stripe, Sentry, Dash0, the OpenStreetMap Foundation’s geocoding and map tile services, FOSSGIS e.V.’s routing service, and Esri’s ArcGIS Online imagery). Address geocoding, driving-time estimation, and map imagery in particular depend on publicly operated services that publish no availability commitment of their own;

b. interruptions to the public internet, Customer’s network, Wi-Fi, device, operating system, or other equipment not controlled by AquaRunner;

c. Customer’s or an Authorized User’s acts or omissions, including errors in configuration, access permissions, or use of the Service contrary to the Terms;

d. suspension or restriction of Customer’s account due to non-payment, suspected fraud, a security risk, or an acceptable-use violation;

e. beta, preview, experimental, or evaluation features;

f. use of browser, operating system, or application versions that AquaRunner no longer supports;

g. mobile carrier, device, or GPS coverage limitations affecting device-level functions, including route optimization drive times, geofenced arrival tracking, or geotagged photos;

h. the Service’s offline mode operating as designed, including when data is queued on a device and cannot sync until internet connectivity returns;

i. scheduled or emergency maintenance under Section 4; or

j. events beyond AquaRunner’s reasonable control, including acts of government, natural disasters, labor disputes, widespread power or telecommunications failures, or denial-of-service attacks.

Where a third-party provider issue materially affects the Service, AquaRunner will use commercially reasonable efforts to pursue the matter with that provider on Customer’s behalf where practical. AquaRunner does not guarantee a third party’s resolution time.

## 6. Support

6.1 **Support channels.** Customer may submit support requests by email at **support@aquarunner247.com** or through the in-app support channel, if available.

6.2 **Severity levels and response targets.** The following are initial response targets, not guaranteed resolution times:

| Severity | Description | Initial response target |
|---|---|---:|
| **P1 — Critical** | The production Service is unavailable to Customer or a critical core function is materially unavailable, with no reasonable workaround. | **[1] hour** during **[P1 support coverage hours]** |
| **P2 — High** | A major Service function is materially impaired, but the Service remains usable or a workaround exists. | **[4] Business Hours** |
| **P3 — Normal** | A minor function is impaired, or Customer has a non-urgent technical issue. | **[1] Business Day** |
| **P4 — Low** | General question, documentation request, or feature request. | **[3] Business Days** |

6.3 **Support hours.** Standard support is available **[DAYS AND BUSINESS HOURS, PACIFIC TIME]**. P1 support coverage is available **[P1 COVERAGE HOURS, INCLUDING WHETHER COVERAGE IS 24/7]**. Requests received outside the applicable support hours will be treated as received at the start of the next applicable support period, except where the stated P1 coverage applies.

6.4 **Customer information.** Customer should include the affected account, relevant users or properties, the time the issue began, steps to reproduce it, and screenshots or other useful diagnostic information, while avoiding unnecessary sensitive personal information.

6.5 **Support exclusions.** Support does not include pool chemistry recommendations, interpretation of laws or health-department requirements, advice about whether a property is safe or compliant, or training beyond any onboarding included in Customer’s subscription. Customer remains responsible for professional decisions, readings, records, and regulatory compliance.

## 7. Service Credits

7.1 **Credit schedule.** If the Monthly Uptime Percentage for a calendar month falls below the commitment in Section 3.1, Customer may qualify for a Service Credit calculated as a percentage of the monthly subscription fee attributable to the affected Service, as follows:

| Monthly Uptime Percentage | Service Credit |
|---|---:|
| Below **[99.5]%** but at or above **[99.0]%** | **[10]%** |
| Below **[99.0]%** but at or above **[95.0]%** | **[25]%** |
| Below **[95.0]%** | **[50]%** |

The thresholds and percentages above are placeholders and must be completed before this SLA is used.

7.2 **Credit cap.** Total Service Credits for any calendar month will not exceed **[X]%** of the monthly subscription fee attributable to the affected Service for that month.

7.3 **Requesting a credit.** Customer must request a Service Credit within **[30] days** after the end of the affected calendar month by emailing **support@aquarunner247.com** with the dates, approximate times, and details of the claimed Downtime. AquaRunner may request reasonable supporting information. AquaRunner will review the request in good faith and determine eligibility based on its monitoring records and other reasonable evidence.

7.4 **Application of credits.** Approved Service Credits will be applied to a future invoice. They may not be transferred, redeemed for cash, or applied to another account. If Customer’s subscription ends before a credit can be applied, the credit will expire, unless applicable law requires otherwise.

7.5 **Exclusive availability remedy.** To the maximum extent permitted by law, Service Credits under this Section are Customer’s sole and exclusive monetary remedy for a failure to meet the availability commitment in Section 3.1. This does not limit remedies for claims unrelated to Service availability or any rights that cannot lawfully be waived.

## 8. Monitoring and Incident Reporting

8.1 AquaRunner will use commercially reasonable monitoring methods to assess the availability of the hosted Service. Monitoring may not detect every issue affecting an individual Customer, device, feature, or third-party service.

8.2 Following a P1 incident that materially affects the production Service, AquaRunner will use commercially reasonable efforts to provide a post-incident summary upon reasonable request. The summary may include the incident’s general cause, impact, and corrective actions, to the extent known and appropriate to disclose.

8.3 AquaRunner is not required to provide real-time status information beyond updates it chooses to publish on the status page or through other notices.

## 9. Limitation of Liability

Service Credits are contractual billing adjustments and are not fines, penalties, or liquidated damages. The disclaimers of warranty and limitations of liability in the Terms remain in effect and apply to this SLA. Nothing in this SLA increases either party’s liability beyond the limits stated in the Terms.

## 10. Relationship to Other Documents

10.1 Except as expressly modified by this SLA, the Terms remain unchanged and in full force. Capitalized terms not defined in this SLA have the meanings given in the Terms.

10.2 If this SLA conflicts with the Terms regarding Service availability, support, or Service Credits, this SLA controls solely on those matters. The Terms control on all other matters, and the DPA controls with respect to personal-data processing.

10.3 This SLA does not change the pricing model or create any per-pool fees. Subscription fees and any other applicable charges are governed by the Terms and Customer’s order form.

## 11. Changes to This SLA

AquaRunner may update this SLA by providing notice before a material change takes effect, consistent with the notice requirements in the Terms. A change will not retroactively reduce a Service Credit already earned for an earlier period.

## 12. Contact

**Support email:** support@aquarunner247.com  
**AquaRunner247 LLC**  
**732 S 6th St, Ste N, Las Vegas, NV 89101**  
**Website:** aquarunner247.com

---

*Informational draft only. A licensed attorney should review this SLA and all bracketed placeholders before use.*
