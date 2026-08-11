# Setting Up an Isolated Test Environment — AquaRunner 24/7 Pro

Goal: create a fully separate database + Preview deployment so Stripe test-mode
signup flows (and future testing) never touch production data.

---

## Part 1 — Create a second Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New Project**
3. Name it something clearly distinct, e.g. `aquarunner-test`
4. Choose the same region as your production project (keeps latency consistent
   and avoids surprises)
5. Set a strong database password — save it in your password manager labeled
   **"AquaRunner TEST DB — postgres (full)"**
6. Wait for provisioning to finish (~2 min)

Once created, grab two connection strings from **Project Settings → Database**:
- **Session pooler (port 5432)** — this is what your app uses in production
  (`aws-1-us-east-1.pooler.supabase.com`, username `postgres.<project-ref>`).
  Not the Transaction pooler (port 6543): that mode disables prepared
  statements, which breaks the `@prisma/adapter-pg` setup this app uses. Use
  the same Session pooler connection type here.
- Note the project ref (the random string in the URL) so you never confuse it
  with your production project ref (`dsamkhorbythfcjygpxz`)

---

## Part 2 — Push your schema to the test database

From your project root, **temporarily** (don't save this to `.env` permanently
yet — just export it for this one command):

```bash
DATABASE_URL="postgresql://postgres.[TEST_PROJECT_REF]:[TEST_DB_PASSWORD]@[TEST_HOST]:5432/postgres" npx prisma migrate deploy
```

This runs all your existing migrations fresh against the empty test database,
creating every table with zero data in it.

**Verify it worked:**
```bash
DATABASE_URL="postgresql://postgres.[TEST_PROJECT_REF]:[TEST_DB_PASSWORD]@[TEST_HOST]:5432/postgres" npx prisma studio
```
This opens Prisma Studio pointed at the test DB — confirm tables exist and are
empty.

---

## Part 3 — Create a Stripe test-mode Price (if not already reused)

You likely already have a test Price ID (`price_1Tse8B2LKyUNW1VQUA4q7kSf` per
prior setup) — confirm it still exists in your Stripe Dashboard under **Test
mode → Product catalog**. If it does, reuse it. If not, create a new test
Product/Price and note the new `price_...` ID.

---

## Part 4 — Configure Vercel Preview environment variables

Go to **Vercel → your project → Settings → Environment Variables**.

For each variable below, add it scoped to **Preview only** (uncheck Production):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Test Supabase pooled connection string |
| `STRIPE_SECRET_KEY` | Your `sk_test_...` key (mark Sensitive) |
| `STRIPE_PUBLISHABLE_KEY` | Your `pk_test_...` key |
| `STRIPE_PRICE_ID` | Test mode price ID |
| `STRIPE_WEBHOOK_SECRET` | New value — see Part 5 below (mark Sensitive) |
| `NEXT_PUBLIC_APP_URL` | Your Preview deployment URL (see note below) |

**Important:** If Production currently has these same variable names set
without environment scoping restrictions, double check they're scoped to
**Production only** so Preview doesn't accidentally inherit prod values.
Vercel lets a variable exist multiple times with different values per
environment — that's what you want here.

---

## Part 5 — Set up a Preview-specific Stripe webhook

Preview URLs change per branch, so rather than a fixed webhook endpoint,
use the Stripe CLI locally while testing, OR register a webhook pointed
at a stable preview URL if you're using a consistent branch.

**Simplest option — local CLI forwarding (recommended for now):**
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```
This prints a `whsec_...` value — use that as `STRIPE_WEBHOOK_SECRET` in
your **local** `.env` for `npm run dev` testing, separate from Vercel Preview.

**If testing against an actual Vercel Preview URL instead of local:**
1. Push your branch, get the generated preview URL
   (e.g. `aquarunner247-git-yourbranch-yourteam.vercel.app`)
2. In Stripe Dashboard (test mode) → Developers → Webhooks → Add destination
3. Endpoint URL: `https://[your-preview-url]/api/stripe/webhook`
4. Events: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`
5. Copy the signing secret into Vercel's Preview-scoped `STRIPE_WEBHOOK_SECRET`

---

## Part 6 — Deploy and verify isolation before testing

1. Push a branch (e.g. `test-signup-flow`) or open a PR — Vercel auto-generates
   a Preview deployment
2. Visit the Preview URL, confirm the app loads
3. **Before running any signup test**, verify isolation:
   - Check Supabase test project's table editor — should be empty except
     whatever `migrate deploy` created
   - Confirm production Supabase project is untouched (spot check org count
     matches what it was before)
4. Now safe to run through `STRIPE_TEST_PLAN.md` against the Preview URL

---

## After testing — cleanup

- Test orgs/data live only in the `aquarunner-test` Supabase project — safe
  to leave, wipe, or delete the whole test project when done
- No production cleanup needed since production was never touched
- Consider keeping the test Supabase project around long-term for future
  feature testing, rather than recreating it each time
