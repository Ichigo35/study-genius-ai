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
  `SUPABASE_PUBLISHABLE_KEY`. (`GEMINI_API_BASE` was set then **deleted** —
  the AI-Gateway relay idea didn't pan out; see the geo-block saga below.)
- **Redeploy after a code change (agent can't run `nitro deploy` — sandbox
  classifier; the user runs it):**
  `bun run build && node scripts/patch-placement.mjs && npx nitro deploy
  --prebuilt`. The `patch-placement.mjs` step re-injects
  `placement.region = "aws:us-east-1"` into the Nitro-generated
  `.output/server/wrangler.json` (needed so the Worker's Gemini calls for
  chat/flashcards/quiz aren't geo-blocked from Laos). If `server.url` ever
  changes: `npx cap sync android` + rebuild the APK.
- **Edge Function** `process-source` is deployed via
  `mcp__supabase__deploy_edge_function` (source in
  `supabase/functions/process-source/index.ts`). It reads
  `SUPABASE_SERVICE_ROLE_KEY` (auto) and the Gemini key from
  `public.app_secrets` (or the Worker's `x-gemini-key` header).
- Build a debug APK: `cd android && ./gradlew assembleDebug` (needs
  `ANDROID_HOME`/`ANDROID_SDK_ROOT` set — SDK lives at
  `~/Library/Android/sdk`). Output:
  `android/app/build/outputs/apk/debug/app-debug.apk`. It's a debug build
  (debug-signed) — fine for sideloading/testing, not for a Play Store
  release, which needs a real release keystore + `assembleRelease`.
- Cloudflare Bot Fight Mode (or similar) 403s requests without a real browser
  User-Agent — expected for `curl`/`urllib` smoke tests, not a bug.
- Native Android Google Sign-In verified on-device 2026-09-03 (debug APK).
- Redeployed 2026-09-03 with the Gemini auth/model fix + model fallback chain
  (see "Gemini API" section); latest version `9575de0b`. `GEMINI_API_KEY`
  secret rotated to the current `AQ.…`-format key.
- **2026-09-04 — retry / delete for analyses + delete courses. LIVE**
  (version `81770e93`, deployed by the user — `npx nitro deploy` is blocked
  by the sandbox classifier for the agent). Added `retrySource` server fn
  (`src/lib/ai.functions.ts` → `retryAnalysis` in `pipeline.server.ts`) and
  client helpers in `src/lib/sources.ts` (`reclaimStaleSources`,
  `deleteSource`, `deleteSpace`). APK unchanged (loads the live URL via
  `server.url`).
- **2026-09-04 — stepped analysis pipeline. LIVE** (version `9d1eff48`,
  deployed by the user). Fixes the analysis getting stuck on "Éléments de
  révision" then failing with a timeout.
  `analyzeYouTube`/`analyzeText`/`analyzeMedia` → `startYouTube`/`startText`/
  `startMedia` + new `advanceAnalysis` server fn; new
  `src/lib/analysisDrive.ts`. See "Client analysis flow — stepped pipeline".
  APK unchanged (live URL via `server.url`).
- **2026-09-04 — Gemini timeout + wider chain. LIVE** (version `88d0dd2f`,
  deployed by the user). Fixes the analysis hanging for ~5 min on
  "Transcription" when the free-tier quota is exhausted. Per-attempt
  `AbortController` timeout, chain budget, `retries:0` for uploads, chain
  extended with `gemini-2.0-flash` / `-lite` (~200/day). Elapsed timer in
  `AnalysisProgress`. **The free tier was genuinely used up that day —
  enabling billing on the key is still the durable fix.**
- **2026-09-04 — transcription speed rewrite + model list fix. LIVE**
  (versions `63dc450d` then `984ffb13`). `wrangler tail` showed: (a) "thinking"
  models time out on big PDF/audio payloads; (b) **`gemini-2.0-flash-lite` /
  `2.5-flash-lite` now 404** ("no longer available"); (c)
  `gemini-flash-lite-latest` 400s on `thinkingConfig`. Fixes: chains rebuilt
  with only-working models (3.x + `-latest` aliases), multimodal = lite-first
  for speed; `CallOpts.noThinking`; *any* 400 with thinking on → drop it +
  isolate-wide `THINKING_CONFIG_UNSUPPORTED` + retry; leftover 400 → try next
  model instead of hard-fail; transcription budget 95s/attempt · 150s total;
  "extract raw text" prompts; `generateStudyNotes` capped at 200k chars; a
  base64-less resume driver fails a stuck media transcript after 150s.

- **2026-09-04 — ROOT CAUSE: Google geo-blocks the free Gemini API from Laos.**
  `wrangler tail` + AI Gateway logs: every model returns
  `400 FAILED_PRECONDITION: "User location is not supported for the API use"`.
  The Worker runs in a Vientiane Cloudflare colo → **the user is in Laos**,
  which `generativelanguage.googleapis.com` (the free AI Studio API) does not
  serve. Everything above (stepped pipeline, timeouts, model names) was real
  but secondary.
  - **The Cloudflare AI Gateway does NOT fix this** — confirmed: requests
    proxied through gateway `study-genius` (`google-ai-studio` provider) still
    come back `FAILED_PRECONDITION`. `GEMINI_API_BASE` secret is set to the
    gateway URL and harmless, but it doesn't help; leave it or clear it.
  - **FREE fix (chosen): a US-pinned relay Worker.** Lives at
    **`~/gemini-proxy`** (NOT in this repo — wrangler can't disambiguate its
    `wrangler.toml` from the app's generated `.wrangler/deploy/config.json`).
    Standalone Worker, `[placement] region = "aws:us-east-1"` (targeted
    placement is free on all Workers plans) → runs in the US, so its
    `fetch()` to `generativelanguage.googleapis.com` egresses from the US and
    the free API works. Deploy: `cd ~/gemini-proxy && npx wrangler deploy` →
    `gemini-proxy.ichigo35.workers.dev`. Then point the main app at it:
    `printf %s "https://gemini-proxy.ichigo35.workers.dev/v1beta" | npx
    wrangler secret put GEMINI_API_BASE --name ichigo35-study-genius-ai`
    — **no main-worker redeploy needed**, `apiBase()` reads the secret live.
    The relay stores nothing (passes the caller's `x-goog-api-key` through).
  - **Paid fix (also shipped, inactive): Vertex AI** (`{region}-aiplatform.googleapis.com`) —
    region-pinned, not country-gated. `gemini.server.ts` uses it when these
    Worker secrets are set (code shipped, **inactive until then**):
    - `VERTEX_SA_KEY` — the GCP service-account JSON, minified to one line
    - `VERTEX_PROJECT` — GCP project id (the one that owns the OAuth client)
    - `VERTEX_LOCATION` — optional, default `us-central1`
    Setup: GCP console → enable **Vertex AI API** + **billing** on the
    project → IAM → create a service account with role **Vertex AI User** →
    create a JSON key → `wrangler secret put VERTEX_SA_KEY` (paste the JSON) +
    `VERTEX_PROJECT`, then `bun run build && npx nitro deploy --prebuilt`.
    Vertex Flash pricing is ~pennies; there's also the $300 GCP trial credit.
  - Vertex model ids differ (no `-latest`, no 3.x previews):
    `DEFAULT_VERTEX_CHAIN = gemini-2.5-flash, gemini-2.5-flash-lite,
    gemini-2.0-flash`; override via `VERTEX_MODEL_TEXT` /
    `VERTEX_MODEL_MULTIMODAL`.
  - `waitUntil` **is** available in this Nitro+CF+TanStack setup (confirmed:
    `[bg] registered with waitUntil` in tail) — background execution works.

- **2026-09-04 — Storage upload + background execution. LIVE (version 8285d8a0).**
  Even with the gateway, the Lao mobile link can't hold one request long
  enough to upload a 7.5 MB PDF *and* await transcription — `wrangler tail`
  showed the `advance` request `Canceled` after ~5s, killing the Worker
  mid-transcription.
  - **Supabase Storage** bucket `study-uploads` (`{user_id}/{source_id}`,
    private, owner RLS — migration `study_genius_uploads_bucket`). Client
    uploads the file once (with retries) then navigates; `advanceAnalysis`
    pulls it server-side and deletes it after the transcript is saved.
  - **Background execution**: transcription + note-gen run via
    `runInBackground()` (`study.server.ts`) = `request.waitUntil` on Workers;
    `advanceAnalysis` returns `processing` immediately. The client only holds
    ~1s poll connections. `runInBackground` logs whether `waitUntil` was
    actually found — **check `wrangler tail` for `[bg] registered with
    waitUntil` vs `[bg] no waitUntil available`**; if the latter, a cron/queue
    backstop is needed (TanStack's `new H3Event(request)` may drop the CF
    execution context).
  - Add screens just start + navigate now; the source page poll + driver runs
    the rest.

- **2026-09-04 — analysis WORKS from Laos. Architecture: Supabase Edge
  Function.** (Worker `8a2db6a2` + edge fn `process-source` v4.) The chain of
  failures and what actually fixed each:
  1. **Gemini geo-blocks Laos** on the free AI Studio API. AI Gateway did NOT
     help. → the analysis Gemini calls now run in a **Supabase Edge Function**
     (`supabase/functions/process-source`) in `ap-southeast-1` (Singapore,
     which Gemini serves). The Worker's `advanceAnalysis` is a thin kicker: it
     POSTs `{sourceId}` + `x-gemini-key` (+ user JWT) to the edge fn, which
     acks in ~1 s and works via `EdgeRuntime.waitUntil`. `verify_jwt: false`;
     the key is stashed in `public.app_secrets` for the cron.
  2. **Free-plan Worker `waitUntil` is killed at ~30 s** — that's why
     transcription couldn't run on the Worker. The edge fn's budget is
     ~100–130 s, enough.
  3. **"Thinking" made the notes step take 11 min** on a 52 KB transcript.
     → `thinkingConfig.thinkingBudget = 0` on every edge-fn call (with a
     graceful retry when a model 400s on it). Notes now ~6 s.
     `FAST_CHAIN` = `gemini-3.5-flash-lite, flash-lite-latest, flash-latest,
     3.5-flash`; notes input capped at 60 KB.
  4. **Worker still runs `[placement] region = "aws:us-east-1"`**
     (`scripts/patch-placement.mjs`, run after `bun run build`) so chat /
     flashcards / quiz — still Gemini-from-Worker — aren't geo-blocked.
     `GEMINI_API_BASE` secret was deleted (direct Google from us-east-1).
  - **`gemini-proxy` (`~/gemini-proxy`, US-pinned relay) is now UNUSED** —
     kept deployed as a spare. `GEMINI_API_BASE` unset means it isn't hit.
  - **Still to do (needs the user — logged-in Supabase dashboard):** run
     `supabase/setup-processor-cron.sql` — a `pg_cron` job that kicks
     `process-source` every minute for any stuck analysis, so the pipeline
     finishes even if the app stops polling. Without it, the app must stay on
     the source page while each step runs (~30 s each now, so usually fine).

- **2026-09-04 — on-demand translation of the fiche + transcription. LIVE**
  (Worker version `49b5ad40`, deployed by the user).
  The source page (`sources.$sourceId.tsx`) has a "Langue d'affichage" picker:
  Original / Français / English / ไทย / 中文 / 한국어 / 日本語. Picking a
  language translates **both** the study note (structure-preserving, via the
  `noteSchema`) and the transcript, caching each in the new
  `public.content_translations` table (`UNIQUE (source_id, kind, language)`,
  migration `20260904120000_content_translations.sql`, already applied to the
  DB via MCP).
  - Gemini for translation is **geo-blocked from Laos too**, so it runs in a
    new Edge Function **`translate-source`** (Singapore, `verify_jwt: false`,
    `thinkingBudget: 0`, `TEXT_CHAIN`). Already deployed via
    `mcp__supabase__deploy_edge_function` (v1).
  - Worker server fn **`translateContent`** (`ai.functions.ts` →
    `startTranslation` in `pipeline.server.ts`) is the thin kicker: it marks
    the needed `content_translations` rows `pending`, POSTs
    `{ sourceId, language, kinds }` + `x-gemini-key` + user JWT to
    `translate-source`, returns fast. Client polls `content_translations`
    every 3 s while any row is `pending`.
  - `retryAnalysis` now also deletes `content_translations` for the source
    (stale once the base content is regenerated).
  - `src/integrations/supabase/types.ts` regenerated (adds
    `content_translations`).
  - **No cron backstop** — translation only runs while the user is on the
    source page. Each translate call is one Gemini request per kind (~5–15 s).

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

> **Scope:** `gemini.server.ts` on the Worker now only serves **chat /
> flashcards / quiz** (`runChat` / `runFlashcards` / `runQuiz`). The
> **analysis** path (transcription + study notes) moved to the
> `process-source` Supabase Edge Function — see "Analysis flow" below and the
> "analysis WORKS from Laos" deploy entry. The Worker's own Gemini calls work
> because the Worker is pinned to `aws:us-east-1` (`placement.region`).

- **Auth:** always send the key as the `x-goog-api-key` header. Do **not** use
  `Authorization: Bearer` (that's for OAuth2 access tokens only) and don't
  gate on the key prefix — Google now issues keys as `AQ.…` as well as the
  older `AIza…`. Getting this wrong = 401 → "Clé Gemini invalide ou non
  autorisée" in the app (this exact bug, fixed 2026-09-03).
- **Available models (checked live 2026-09-04 via `wrangler tail`).** The
  **2.0 and 2.5 families now 404** ("no longer available" / "no longer
  available to new users") — Google's own error points to
  `gemini-3.5-flash-lite`. Working: `gemini-3.6-flash`, `gemini-3.5-flash`,
  `gemini-3.5-flash-lite`, `gemini-flash-latest`, `gemini-flash-lite-latest`.
- **Model fallback chain.** `MODELS.text` / `MODELS.multimodal` are *lists*
  (comma-separated `GEMINI_MODEL_TEXT` / `GEMINI_MODEL_MULTIMODAL` env
  override). Defaults: text = `3.6-flash, 3.5-flash, 3.5-flash-lite,
  flash-latest, flash-lite-latest` (quality first); multimodal =
  `3.5-flash-lite, flash-lite-latest, flash-latest, 3.5-flash, 3.6-flash`
  (speed first). `callGemini` walks the chain on 429, 404, 5xx, per-attempt
  timeout, network error, **or any leftover 400** (treated as model-specific
  → try next model). Only 401/403 / API_KEY_INVALID short-circuit.
- **Timeouts / speed (2026-09-04).** Every Gemini `fetch` has an
  `AbortController` timeout (`CallOpts.timeoutMs`, default 70s) plus an
  overall chain budget (`totalBudgetMs`, default 150s). `callGemini` skips a
  model when <18s of budget is left.
  - **Transcription / OCR** (`transcribeAudio` / `transcribeVideo` /
    `analyzeImage`) uses `MULTIMODAL_OPTS`: `noThinking: true`
    (`thinkingConfig.thinkingBudget = 0`), `retries: 0`, `timeoutMs: 95s`,
    `totalBudgetMs: 150s` — must finish inside one mobile HTTP request.
    Prompts are "extract raw text only"; structuring is
    `generateStudyNotes`'s job (which is capped at 200k input chars).
  - **`thinkingConfig` is not universally accepted** — several models 400
    with just "Request contains an invalid argument". So *any* 400 while
    `includeThinking` is on → drop it, set the isolate-wide
    `THINKING_CONFIG_UNSUPPORTED` flag, retry the same model once.
- Each *distinct* model version has its **own** free-tier bucket (~20–50/day
  on the 3.x previews). Sustained use still needs **billing on the key**.
- The Worker secret `GEMINI_API_KEY` is set via
  `wrangler secret put GEMINI_API_KEY --name ichigo35-study-genius-ai`. The
  code trims surrounding quotes/whitespace defensively.
- Gemini 3.x models "think" by default — analyses can take 20–60s; that's
  normal, not a hang.
- **The `AQ.…` key is on the FREE TIER.** The fallback chain keeps things
  working, but for real usage **enable billing on the key**
  (aistudio.google.com/apikey → the project → Set up billing) — flash pricing
  is cheap. When every model in the chain is quota-capped, the app shows the
  `quota_free_tier` message pointing there.

### Analysis flow — Worker kicks a Supabase Edge Function (current, 2026-09-04)

The whole reason this is complicated: **the user is in Laos, where Google
geo-blocks the free Gemini API**, and the Cloudflare Worker's own free-plan
limits (`waitUntil` killed at ~30 s) can't run a 60–120 s transcription. See
the big "analysis WORKS from Laos" entry under *Current deployment* for the
full story. End state:

1. **`start{YouTube,Text,Media}Analysis`** (`start*` server fns in
   `ai.functions.ts` → `pipeline.server.ts`) — quota-check + insert the
   `sources` row, return `{ ok, sourceId }` instantly. `startMedia` also sets
   `storage_path`.
2. **Client uploads media once to Supabase Storage** (`study-uploads` bucket,
   `MediaAnalyzer.tsx` `uploadWithRetry`), then navigates to
   `/sources/$sourceId`. Text/YouTube skip the upload.
3. **`advanceAnalysis({ sourceId, outputLanguage })`** on the Worker is a
   **thin kicker**: if a step is pending (or a `*_running` claim is stale) it
   POSTs `{ sourceId }` + `x-gemini-key` (+ the forwarded user JWT) to the
   `process-source` Edge Function and returns `processing` fast. The client
   (`sources.$sourceId.tsx` `driveAnalysis` + the 4 s `useQuery` poll) keeps
   calling it until `completed` / `failed`.
4. **`supabase/functions/process-source`** (Deno, Singapore, `verify_jwt:
   false`) does ONE step per invocation via `EdgeRuntime.waitUntil`:
   downloads the upload from Storage, calls Gemini **directly** (no geo-block
   from Singapore, `thinkingBudget: 0`, `FAST_CHAIN`), writes
   `transcripts` / `study_notes`, records `usage_events`, advances
   `progress_step`. Gemini key comes from the header or `public.app_secrets`.
5. **`pg_cron` backstop** (`supabase/setup-processor-cron.sql`, run in the
   dashboard) kicks `process-source` every minute for stuck sources — covers
   the app closing mid-run.

`progress_step` state machine (unchanged):
`transcript_pending → transcript_running → notes_pending → notes_running → done`
(text starts at `notes_pending`). `claimStep` (in the Edge Function) is an
atomic compare-and-set via a PostgREST `.or()` on `progress_step` +
`updated_at`; stale after `STEP_CLAIM_STALE_MS` (4 min). `reclaimStaleSources`
(`src/lib/sources.ts`, client-side) still hard-fails `processing` rows older
than 10 min. Steps delete transcript/notes before re-insert (idempotent).

**Uploads are deleted from Storage once the transcript is saved.** A media
source that failed before a transcript existed → `retryAnalysis` /
`process-source` returns `needs_reupload` → UI sends the user to `/add`.
`retryAnalysis` just clears the error + resets `progress_step`; the
source-page driver (and the cron) pick it up.

`src/lib/analysisDrive.ts` `driveAnalysis()` / `study.server.ts`
`runInBackground()` still exist but the Worker no longer runs Gemini for
analysis — `runInBackground` (Worker `waitUntil`) proved unreliable on the
free plan.

**Deleting sources & courses (2026-09-04).** `deleteSource` / `deleteSpace`
in `src/lib/sources.ts` — plain client-side Supabase deletes (RLS `FOR ALL`
covers it; FK `ON DELETE CASCADE` cleans up transcripts/notes/flashcards/
quizzes/chat). UI: trash button + `ConfirmDelete` (`AlertDialog` wrapper) on
the source page, the space page header, and each row of the courses list.

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
