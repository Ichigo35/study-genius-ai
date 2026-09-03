# study-genius-ai — agent instructions

AI Study Companion. TanStack Start (React 19 + Vite + Nitro) app, Supabase for
auth/DB, Gemini API for all AI features (server-side only — see
`src/lib/gemini.server.ts`). Built with Lovable; see `README.md` for the full
product spec.

## Current goal: ship this as an Android app

Target platform is Android, packaged as an APK/AAB via **Capacitor**. This app
is server-rendered with real server functions (Gemini calls, Supabase access),
not a static SPA, so the Capacitor shell should point `server.url` in
`capacitor.config.ts` at a **live deployed URL** rather than trying to bundle
a static export — a static build would break every Gemini-backed feature.

- Hosting/deployment target: **Cloudflare Workers**. The Nitro build in
  `vite.config.ts` already defaults to a Cloudflare preset
  (`@lovable.dev/vite-tanstack-config`) — use that, don't switch targets.
- If a custom domain is needed at any point, use **Cloudflare** for it
  (Cloudflare-managed DNS / Cloudflare Pages/Workers routes), not another
  registrar or host.
- iOS via Capacitor is a stated future goal in the README but is not the
  current focus — don't do iOS-specific work unless asked.

### Current deployment (2026-08-24)

- Cloudflare account subdomain: `ichigo35` (workers.dev). Worker name:
  `ichigo35-study-genius-ai`.
- Live URL: `https://ichigo35-study-genius-ai.ichigo35.workers.dev` — this is
  what `capacitor.config.ts`'s `server.url` points at.
- Worker secrets already set: `GEMINI_API_KEY`, `SUPABASE_URL`,
  `SUPABASE_PUBLISHABLE_KEY`. To redeploy after a code change:
  `bun run build && npx nitro deploy --prebuilt`, then if `server.url`
  changes, `npx cap sync android` and rebuild the APK.
- Build a debug APK: `cd android && ./gradlew assembleDebug` (needs
  `ANDROID_HOME`/`ANDROID_SDK_ROOT` set — SDK lives at
  `~/Library/Android/sdk`). Output:
  `android/app/build/outputs/apk/debug/app-debug.apk`. It's a debug build
  (debug-signed) — fine for sideloading/testing, not for a Play Store
  release, which needs a real release keystore + `assembleRelease`.
- Cloudflare Bot Fight Mode (or similar) 403s requests without a real browser
  User-Agent — expected for `curl`/`urllib` smoke tests, not a bug.
- Native Android Google Sign-In verified on-device 2026-09-03 (debug APK).
- Redeployed 2026-09-03 (version `c2c9a5f8`) with the Gemini auth/model fix
  (see "Gemini API" section). `GEMINI_API_KEY` secret rotated to the current
  `AQ.…`-format key.

### RLS audit result (2026-09-03) — Study Genius tables are clean

Audited the 14 `public.*` tables from `supabase/migrations/*` against the live
DB. **All 14 have RLS enabled with exactly one correct owner-scoped policy**
(`auth.uid() = user_id` / `= id`, role `authenticated`) — nothing deny-all,
nothing broken.

- The advisor's `rls_enabled_no_policy` list (`analysis`, `app_profile`,
  `favorites`, `groups`, `settings`, `store`, `uploads`, `posts`,
  `properties`, `lead_scores`, …) contains **zero Study Genius tables** —
  all belong to the co-hosted real-estate app or the `lao` schema app.
- The advisor showing `public.profiles` / `public.study_sessions` with extra
  policies (`profiles_select_self`, `study_sessions_owner`, …) was
  **conflating the identically-named `lao.*` tables** — direct query confirms
  our `public` tables have one policy each. No real collision.
- `function_search_path_mutable` / `pg_trgm-in-public` warnings are the other
  app's objects — leave them.

**Real finding — anonymous sign-ins are ENABLED project-wide.** 2 of 3
`auth.users` are `is_anonymous=true` (created 08-26 / 08-28). Our app never
calls `signInAnonymously`, but the setting is on (needed by / left on for a
co-hosted app?), our `on_auth_user_created` trigger gives anon users a
`profiles` row, and our `TO authenticated` policies also admit anon-session
users (Supabase's `authenticated` role covers them). Not urgent, but it's an
unintended surface — anyone gets a working session + can hit Gemini endpoints
without Google. Options when ready: disable "Allow anonymous sign-ins" in the
dashboard (confirm the other apps don't need it first), or add
`AND (auth.jwt()->>'is_anonymous')::boolean IS FALSE` to each policy.

Minor: leaked-password protection is disabled (dashboard toggle) — low
priority since primary auth is Google OAuth.

### Backend: Supabase project `knqcmptpejylvlnhmssx` ("App Claude")

This app originally ran on Lovable Cloud's managed Supabase
(`yxhktlafavsgxtpucytn`), but that setup only exposes Google Sign-In through
Lovable's own OAuth broker (`oauth.lovable.app`), which **only works for
Lovable-hosted origins** — not a Capacitor app or an externally-deployed
Cloudflare Worker. So the backend was migrated (2026-08-24) to a Supabase
project the user owns directly, reachable via the `mcp__supabase__*` tools:
project id `knqcmptpejylvlnhmssx` ("App Claude", org `azekabhktswfmxkssqac`).

- That project **also hosts an unrelated existing app** (a real-estate
  lead-scraping pipeline — tables like `posts`, `properties`, `leads_scores`,
  `pipeline_status_history`, real production data). Study Genius AI's schema
  was added alongside it with zero name collisions. Never touch those other
  tables, and never change the project's `Site URL` in Auth settings (still
  `http://localhost:3000`, used by that other app) — only the Redirect URLs
  allowlist was extended for this app.
- Schema applied via `mcp__supabase__apply_migration` using the SQL from
  `supabase/migrations/*.sql` in this repo (kept as the source of truth for
  the schema, even though `supabase db push` isn't the deploy path here).
- `src/integrations/supabase/types.ts` was regenerated for this project via
  `mcp__supabase__generate_typescript_types` — it now includes the other
  app's tables too; that's expected, not a bug.
- `.env` (`SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`/`VITE_*` equivalents) and
  the Cloudflare Worker secrets both point at this project now.

## Google Sign-In

**Fully working end-to-end** on web (verified 2026-08-24 via Playwright) **and
on native Android** (verified on-device 2026-09-03 from the debug APK): the
system-browser + `com.studygenius.ai://auth-callback` deep-link flow completes
and creates a session.

Implemented in `src/lib/googleAuth.ts`, replacing the old
`@lovable.dev/cloud-auth-js`-based flow (removed from `auth.tsx`). Supabase
client uses `flowType: 'pkce'` (`src/integrations/supabase/client.ts`).

- Web: standard Supabase `signInWithOAuth` redirect.
- Android: Google blocks OAuth inside embedded WebViews, so the flow opens
  the system browser (`@capacitor/browser`) and catches the redirect via a
  custom-scheme deep link `com.studygenius.ai://auth-callback`
  (`@capacitor/app`, intent-filter in `AndroidManifest.xml`), then exchanges
  the PKCE code for a session.
- Google Cloud Console OAuth client (Web application type, project owned by
  the user): Client ID `851397414087-icnr220up3839i88hopsqg3658r77msd
  .apps.googleusercontent.com`. Authorized redirect URI must point at
  **this** Supabase project's callback:
  `https://knqcmptpejylvlnhmssx.supabase.co/auth/v1/callback` — if the
  Supabase project ever changes again, this is the #1 thing to update (we
  hit a `redirect_uri_mismatch` once already from forgetting it after the
  backend migration).
- Supabase side (`knqcmptpejylvlnhmssx`, configured via the dashboard UI —
  no MCP tool exposes Auth provider config): Google provider enabled with
  that Client ID + its secret; Redirect URLs allowlist includes
  `https://ichigo35-study-genius-ai.ichigo35.workers.dev/auth` and
  `com.studygenius.ai://auth-callback`.
- No Android-specific OAuth client / SHA-1 fingerprint needed — the system
  browser + deep link approach avoids that entirely.

## Workflow — commit automatique après chaque tâche de code

Quand une tâche de code demandée par l'utilisateur est **terminée**, faire
systématiquement et sans redemander : `git commit` + `git push` sur `main`,
puis mettre à jour ce `CLAUDE.md` (statut / section deployment) et la mémoire
si un fait durable a changé. Autorisation durable de commit/push pour ce repo.
Ne s'applique pas aux simples questions ou explorations.

## Gemini API (`src/lib/gemini.server.ts`)

- **Auth:** always send the key as the `x-goog-api-key` header. Do **not** use
  `Authorization: Bearer` (that's for OAuth2 access tokens only) and don't
  gate on the key prefix — Google now issues keys as `AQ.…` as well as the
  older `AIza…`. Getting this wrong = 401 → "Clé Gemini invalide ou non
  autorisée" in the app (this exact bug, fixed 2026-09-03).
- **Model:** default `gemini-3.6-flash` (text + PDF/image/audio). Override
  with `GEMINI_MODEL_TEXT` / `GEMINI_MODEL_MULTIMODAL` env vars.
  `gemini-2.5-flash` returns 404 "no longer available to new users" for keys
  created after ~2026.
- The Worker secret `GEMINI_API_KEY` is set via
  `wrangler secret put GEMINI_API_KEY --name ichigo35-study-genius-ai`. The
  code trims surrounding quotes/whitespace defensively.
- Gemini 3.x models "think" by default — analyses can take 20–60s; that's
  normal, not a hang.
- **The `AQ.…` key is on the FREE TIER** → `gemini-3.6-flash` is capped at
  **20 requests/day**. One document analysis = 2+ calls, so the app runs dry
  almost immediately (seen 2026-09-03: analyses failing with 429
  RESOURCE_EXHAUSTED / 503 "high demand"). **Fix = enable billing on the key**
  (aistudio.google.com/apikey → the project → Set up billing). Flash pricing
  is cheap; no code change needed once billing is on. `gemini-2.5-flash` is
  not an escape hatch — it 404s for this key ("no longer available to new
  users").
- Code now distinguishes a daily-cap 429 (`quota_free_tier`, no retry, clear
  message) from a transient per-minute 429 (honors `retryDelay`).

### Client analysis flow (`MediaAnalyzer.tsx`) — known weakness

The progress screen steps (`upload → transcribe → analyze → notes → review`)
are a **fake 9s ticker**, not real backend progress; the whole analysis is
one long synchronous server fn call. Capped with a 180s client timeout so it
can't spin forever, but the proper fix is to fire-and-navigate to
`/sources/$sourceId` and poll `sources.status` / `progress_step` (already
written by `pipeline.server.ts`).

## Browser automation

When a task needs to drive a browser (testing the deployed app, checking a
page renders, etc.), always use the **Playwright** MCP tools
(`mcp__playwright__*`). Do not use `claude-in-chrome`, even if it's suggested
by a skill trigger.

## Known issue — do not reintroduce

`README.md` previously had a live Gemini API key committed in plaintext. The
key must never live in a frontend file, a markdown file, or anywhere in git —
only as the `GEMINI_API_KEY` env var / Cloudflare Worker secret, exactly as
`src/lib/gemini.server.ts` already expects it.

## Notes from the README spec worth keeping in mind

- Never expose `GEMINI_API_KEY` client-side; all Gemini calls go through
  server code (already the pattern in `src/lib/*.server.ts` — keep following
  it for new features).
- Mobile-first UI, French/English/Lao/Thai i18n (`src/i18n/`).
- Capacitor-compatible abstractions for mic, camera, storage, share,
  notifications — avoid browser-only APIs without a Capacitor-compatible path.
