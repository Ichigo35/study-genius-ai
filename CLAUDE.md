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

### Known DB hardening TODO (from `get_advisors` security, 2026-09-03)

- Several `public` tables have **RLS enabled but no policy** (deny-all):
  check which belong to Study Genius AI vs the co-hosted real-estate app —
  any of ours in that list means a broken/inaccessible feature. Candidates
  seen: `analysis`, `app_profile`, `favorites`, `groups`, `notifications`,
  `settings`, `store`, `uploads`.
- `public.study_sessions` shows two policies with different naming styles
  (`"own sessions"` + `study_sessions_owner`) — possible cross-app overlap,
  verify before touching.
- Auth: enable leaked-password protection (HaveIBeenPwned) in the dashboard.
- Study Genius policies target `anon`/`public` role rather than
  `authenticated` — tighten if anonymous sign-ins stay disabled.
- The `function_search_path_mutable` / `pg_trgm-in-public` warnings are the
  **other app's** objects — not ours, leave them.

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
