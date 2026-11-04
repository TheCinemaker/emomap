# EmoMap → Cloudflare Pages deploy

Written for: an AI assistant (Gemini) executing this hand-off, with the project owner present to click through dashboard steps and approve anything account-specific.

## Context

- This is `emomap`, a Vite + React 18 SPA (no SSR, no API routes, no router — single page). Repo: `https://github.com/TheCinemaker/emomap`, branch `main`.
- Backend is Supabase (project ref `sfbuabdzkpzwpffuuwva`, URL `https://sfbuabdzkpzwpffuuwva.supabase.co`). The frontend only needs two public, client-safe env vars — nothing else talks to Supabase from build-time code.
- **No hosting exists yet for this project** — not Netlify, not anything else. This is a first deploy, not a migration. There is no DNS cutover, no old deployment to decommission, no redirects to preserve.
- Goal: get the current `main` branch building and serving on Cloudflare Pages, on Cloudflare's own `*.pages.dev` subdomain. A custom domain is a later, optional step — don't block on it.

## Prerequisite: push the latest commit

The local repo is ahead of `origin/main` by a couple of commits (most recently `feat: GPS jitter + grid k-anonymity, drop RandomMatch, add en/hu/de i18n`). Cloudflare Pages' Git integration builds from GitHub, so:

```bash
git push origin main
```

Confirm with the project owner before pushing if you're not sure it's wanted — this is the first push since some privacy/i18n changes landed.

## Step 1 — Connect the repo in Cloudflare

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Authorize Cloudflare's GitHub App for the `TheCinemaker/emomap` repo (owner's GitHub account — they have several Cloudflare accounts too, so double-check you're in the intended one before creating the project).
3. Select the repo, branch `main`.

## Step 2 — Build configuration

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` (repo root — `package.json` lives at the top level) |

These match `vite.config.js` (plain `vite build`, default `dist` output) — no custom Vite output path is set, so don't second-guess this against the repo.

## Step 3 — Environment variables

In the Pages project's **Settings → Environment variables**, add for **both** Production and Preview:

```
VITE_SUPABASE_URL=https://sfbuabdzkpzwpffuuwva.supabase.co
VITE_SUPABASE_ANON_KEY=<value from the project owner's local .env, same file — ask them to paste it, don't invent or reuse a different project's key>
```

These are `VITE_`-prefixed, so Vite inlines them into the built JS at build time — they are **not** request-time secrets, they're the same public anon key already sitting in a git-ignored `.env` on the owner's machine. Still: set them through the Cloudflare UI, don't commit them to the repo.

No other env vars are needed. `VITE_DEMO_MODE` exists in the code (`App.jsx`) but defaults to off and isn't required for a real deploy — leave it unset unless the owner specifically wants the synthetic demo-data mode live.

## Step 4 — Deploy and verify

1. Trigger the first deploy (it runs automatically after project creation).
2. Open the `*.pages.dev` URL Cloudflare gives you.
3. Smoke-test the actual product loop, not just "does it load":
   - Sign up with a throwaway email + username → should get a Supabase confirmation email.
   - Log in with username + password.
   - Allow location, cast a mood vote → confirm no console errors (this is the first real test of the `supabase_grants_fix.sql` GRANTs the owner ran earlier today — if voting silently fails, check the Supabase SQL editor logs for `permission denied` first, not the frontend code).
   - Upload a Reels photo via the "+" thumbnail → confirm it appears in the strip.

## Step 5 — Supabase auth redirect URL (easy to miss)

Supabase Auth has an allow-list for redirect URLs (used by email-confirmation links). In the Supabase dashboard → **Authentication → URL Configuration**, add the new `https://<project>.pages.dev` URL (and later, the custom domain, if/when one is added) to **Redirect URLs** / **Site URL** as appropriate. Skip this and sign-up confirmation emails will link back to nothing.

## Explicitly out of scope for this task

- Don't touch the Supabase project, schema, or any SQL file — that's already handled elsewhere.
- Don't add a custom domain, `_redirects` file, or any routing config unless asked — this app has no client-side router today, so none is needed.
- Don't migrate anything *away* from — there is nothing else live to turn off.
