# EmoMap → paid Venue Boost (Stripe) setup

Written for: an AI assistant (Gemini, or whoever picks this up) executing this hand-off, with the project owner present for anything that touches their Stripe/Supabase accounts or secret keys.

## Context

- Free venue claiming already works end-to-end: the `venues` table (`supabase_venues_schema.sql`) and the "Claim this spot" flow in the app (`src/components/VenueClaim.jsx`) are live. Any signed-in user can put a venue on the map for free — that's the growth mechanic, not the product.
- The **paid** product is a 24h "Boost" on top of a claimed venue. A boost must only be created after Stripe actually confirms payment — never from a client-side "success" redirect alone, or anyone could fake it.
- This is why the design has three pieces, not one:
  1. `venue_boosts` table — **no insert/update grant for anon or authenticated**, only `service_role` can write to it (already in `supabase_venue_boosts_schema.sql`).
  2. `create-boost-checkout` Edge Function — called from the frontend, creates a Stripe Checkout Session, returns its URL.
  3. `stripe-webhook` Edge Function — a public endpoint Stripe calls after real payment, verifies the signature, and is the *only* thing that inserts into `venue_boosts`.
- Both Edge Function files already exist at `supabase/functions/create-boost-checkout/index.ts` and `supabase/functions/stripe-webhook/index.ts`. They're written, not deployed — deploying and wiring secrets is what's left, and that needs the owner's actual Stripe account.

## Step 1 — Apply the schema

Run `supabase_venue_boosts_schema.sql` in the Supabase SQL editor for project `sfbuabdzkpzwpffuuwva` (same project as everything else — see `CLOUDFLARE_DEPLOY.md` for why this is the right one if there's any doubt).

## Step 2 — Stripe dashboard setup

1. In the Stripe Dashboard (**start in test mode** — don't touch live mode until this is proven end-to-end), create a Product called "EmoMap Venue Boost" with a one-time Price (owner picks the amount — the business-direction conversation suggested a small, low-friction price, not a subscription).
2. Copy the **Price ID** (`price_...`, not the product ID).
3. Note the account's **Secret key** (`sk_test_...` for now) from **Developers → API keys**. Never put this in frontend code or commit it anywhere.

## Step 3 — Deploy the Edge Functions

```bash
# from the repo root, with the Supabase CLI installed and logged in
supabase link --project-ref sfbuabdzkpzwpffuuwva

supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_BOOST_PRICE_ID=price_...
supabase secrets set APP_URL=https://<the-cloudflare-pages-url-or-custom-domain>
# STRIPE_WEBHOOK_SECRET comes from step 4 below — set it after creating the webhook

supabase functions deploy create-boost-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
```

`--no-verify-jwt` on `stripe-webhook` matters: Stripe calls this endpoint directly, with no Supabase auth header — the function verifies the *Stripe* signature itself instead (see the code). `create-boost-checkout` keeps default JWT verification since it's called by a signed-in app user.

## Step 4 — Register the webhook in Stripe

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://sfbuabdzkpzwpffuuwva.supabase.co/functions/v1/stripe-webhook`
3. Listen for event: `checkout.session.completed`.
4. Copy the **Signing secret** (`whsec_...`) and set it:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   ```
5. Redeploy `stripe-webhook` after setting the secret (secrets apply on next deploy/cold start — redeploying is the safe way to be sure).

## Step 5 — Test it before going anywhere near live mode

1. Use a Stripe test card (`4242 4242 4242 4242`, any future expiry/CVC) through a Checkout Session created by calling `create-boost-checkout` (e.g. via `supabase.functions.invoke('create-boost-checkout', { body: { venue_id } })` from the browser console against a real venue the test user owns).
2. Confirm in the Supabase dashboard that a row actually landed in `venue_boosts` after payment, with a sensible `ends_at`.
3. Only after that works, repeat Steps 2–4 in **live mode** with real keys, and update the secrets accordingly.

## Step 6 — Frontend wiring (not built yet — intentionally)

This hand-off stops at a working, testable backend. Still needed once the above is verified:
- A "Boost" button shown only on venues the signed-in user owns, calling `create-boost-checkout` and redirecting `window.location` to the returned `url`.
- A distinct visual treatment for boosted venues on the map (join `venues` with `venue_boosts` where `ends_at > now()`), per the product direction's "boosted must look visibly different from organic, or trust in the map breaks" rule.

Come back to whoever is driving the main app build for this part — it's a quick addition once there's a real Price ID and working webhook to point it at, and it's better built against the live price/currency than guessed at now.
