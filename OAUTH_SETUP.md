# Google + Apple Sign-In Setup

The code side is done (Auth.jsx has "Continue with Google" / "Continue
with Apple" buttons, no username-picker screen — a brand-new OAuth user
gets an auto-generated username, see `supabase_oauth_profiles.sql`). This
doc is the dashboard-side setup, which needs manual steps in 3 places:
Google Cloud Console, Apple Developer Portal, and Supabase.

Supabase project ref: `sfbuabdzkpzwpffuuwva`
Supabase OAuth callback URL (needed in BOTH Google's and Apple's config):
**`https://sfbuabdzkpzwpffuuwva.supabase.co/auth/v1/callback`**

Production app URL: `https://emomap.pages.dev`

## 0. Run the SQL migration first

In the Supabase SQL editor, run `supabase_oauth_profiles.sql`. Without
this, a Google/Apple sign-up still works but every new OAuth user gets
`profiles.username = NULL` forever (breaks friend search and the
`@username` shown on Pulses/Chat).

## 1. Google

1. Go to **console.cloud.google.com** → create a project (or pick an
   existing one) — any name, e.g. "EmoMap".
2. **APIs & Services → OAuth consent screen**: User type "External", fill
   in app name (EmoMap), support email, developer contact email. Add the
   non-sensitive scopes `email`, `profile`, `openid` (usually default).
   Publish it (or leave in Testing while you're the only tester, but
   Testing mode caps you at ~100 test users and shows an "unverified app"
   warning — fine to launch with, switch to Production later if needed).
3. **APIs & Services → Credentials → + Create Credentials → OAuth client
   ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://emomap.pages.dev`
   - Authorized redirect URIs: `https://sfbuabdzkpzwpffuuwva.supabase.co/auth/v1/callback`
   - Create → copy the **Client ID** and **Client Secret**.
4. **Supabase Dashboard → Authentication → Providers → Google**: toggle
   it on, paste the Client ID + Client Secret, Save.

That's it for Google — no paid account needed.

## 2. Apple

Needs your Apple Developer account (you said you have one — this is
where it's used). Apple's flow has more steps than Google's:

1. **developer.apple.com → Certificates, Identifiers & Profiles →
   Identifiers**:
   - If you don't already have an App ID for this, register one (type
     "App IDs", any bundle-style identifier, e.g. `app.emomap.ios` — it
     never has to ship an actual app). Under its Capabilities, enable
     **Sign in with Apple**.
   - Register a second identifier, type **Services IDs** — e.g.
     `app.emomap.web.signin`, description "EmoMap Web Sign In". Enable
     **Sign in with Apple** for it, click Configure:
     - Primary App ID: the App ID from the step above.
     - Domains and Subdomains: `sfbuabdzkpzwpffuuwva.supabase.co`
     - Return URLs: `https://sfbuabdzkpzwpffuuwva.supabase.co/auth/v1/callback`
     - Save.
2. **Keys → + (register a new key)**: name it anything (e.g. "EmoMap
   Sign in with Apple"), enable **Sign in with Apple**, configure it with
   the same Primary App ID as above. Register → **download the `.p8`
   file immediately** — Apple only lets you download it once. Note the
   **Key ID** shown on this page.
3. Note your **Team ID** — top-right of the Developer Portal, under your
   account name (10-character code).
4. **Supabase Dashboard → Authentication → Providers → Apple**: toggle it
   on, fill in:
   - **Client ID (Services ID)**: the Services ID string from step 1, e.g. `app.emomap.web.signin`
   - **Team ID**: from step 3
   - **Key ID**: from step 2
   - **Private Key**: paste the entire contents of the `.p8` file
   - Save.

## 3. Double-check redirect URLs are allowed

**Supabase Dashboard → Authentication → URL Configuration**: make sure
`https://emomap.pages.dev` is in the Site URL / Redirect URLs list (it
should already be, from the Cloudflare Pages setup — if Google/Apple
login redirects back to a blank page or an error instead of the app,
check here first).

## Testing

Once both providers are enabled, the "Continue with Google" / "Continue
with Apple" buttons on the live Auth screen will do a full-page redirect
out to Google/Apple and back — no further code changes needed on this
side. First-time sign-in auto-creates a profile with a generated username
(check the `profiles` table in Supabase to see what it picked).
