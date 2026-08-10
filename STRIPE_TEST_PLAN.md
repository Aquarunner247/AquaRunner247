# Stripe Test-Mode Signup Plan — AquaRunner 24/7 Pro

Purpose: end-to-end verification of the multi-tenant self-serve signup flow using Stripe test mode, before enabling live billing.

## Prerequisites

- [x] Stripe CLI installed and authenticated (`stripe login`)
- [x] Local dev server running (`npm run dev` or equivalent)
- [x] Stripe CLI forwarding webhooks to local endpoint:
  ```bash
  stripe listen --forward-to localhost:3000/api/stripe/webhook
  ```
- [x] Confirm `.env` has Stripe **test mode** keys (`sk_test_...` / `pk_test_...`), not live keys — confirmed in `.env.local`, used against the isolated `aquarunner-test` project only
- [ ] Confirm Supabase restricted Postgres role is used for new-tenant provisioning — not separately re-verified this pass; provisioning goes through the app's normal Prisma `DATABASE_URL`, not the service-role key, consistent with prior audit

## Test Cards

| Scenario | Card number | Notes |
|---|---|---|
| Successful payment | `4242 4242 4242 4242` | Any future expiry, any CVC, any ZIP |
| Requires 3D Secure | `4000 0025 0000 3155` | Confirm auth modal appears and flow completes after confirming |
| Declined (generic) | `4000 0000 0000 0002` | Confirm graceful failure, no tenant created |
| Declined (insufficient funds) | `4000 0000 0000 9995` | Same as above |
| Declined (expired card) | `4000 0000 0000 0069` | Same as above |

## Test Sequence

### 1. Happy path signup
- [x] Go through actual signup UI (not direct API call)
- [x] Complete checkout with `4242...` card
- [x] Confirm redirect/success state renders correctly — reached `/signup/complete` → password set → redirected to `/login`

### 2. Webhook verification
- [x] Confirm `checkout.session.completed` (or relevant event) is received
- [x] Confirm webhook handler processes it without error — all events 200'd, including `customer.created`, `customer.subscription.created`, `invoice.payment_succeeded`
- [x] Confirm webhook signature verification is passing (not bypassed)

### 3. Tenant provisioning
- [x] New org/tenant record created correctly in Supabase — exactly one Organization + one ADMIN User, no duplicate from the completeSignup/webhook race
- [ ] Tenant creation uses the **restricted** Postgres role, not elevated/service role — not independently re-verified this pass (see prerequisites note)
- [ ] RLS policies correctly applied/scoped to the new tenant — not exercised; app path doesn't use PostgREST/anon access (see RLS incident notes), so not applicable the way it would be for a JS-client data path
- [ ] New user is correctly scoped to only their own tenant's data — not cross-checked against another tenant this pass

### 4. Trial logic
- [x] Trial start/end dates set correctly on signup — `trialEndsAt` ≈ 14 days out, `planStatus` = `TRIALING`
- [ ] Billing gates don't block access during active trial — not exercised (didn't log in as the new user and load the dashboard)
- [ ] Confirm behavior when trial expires — not tested

### 5. Decline handling
- [x] Test with `4000...0002` (generic decline)
- [x] Confirm no tenant/org record is created on failure — verified zero rows
- [x] Confirm user sees a clear error state, not a silent failure — "Your credit card was declined" shown inline, stayed on Checkout

### 6. 3D Secure flow
- [x] Test with `4000 0025 0000 3155`
- [x] Confirm auth challenge modal appears — Stripe's test ACS challenge frame rendered
- [x] Confirm flow completes successfully after confirming in the test modal — reached `/signup/complete` after clicking "Complete"

### 7. Cross-check in Stripe Dashboard (test mode)
- [x] Customer object created correctly — confirmed via `stripeCustomerId` populated on the Organization row and `customer.created`/`customer.updated` events
- [x] Subscription object created with correct plan/pricing — `stripeSubscriptionId` populated, checkout page showed correct $49/mo after a 14-day trial
- [x] Events log shows expected sequence with no errors — via `stripe listen` log, not the visual Dashboard: payment_method.attached → customer.created → customer.updated → customer.subscription.created → setup_intent.created/succeeded → invoice.created/payment_succeeded → checkout.session.completed, all 200

## Sign-off

- [ ] All above steps pass — core flow verified; tenant-isolation/trial-gating/expiry items above still open
- [ ] No elevated DB role used anywhere in the provisioning path — believed true per architecture (Prisma `DATABASE_URL`, not service role) but not independently re-checked this pass
- [ ] Ready to move to live-mode key swap — not yet; close the open items above first
