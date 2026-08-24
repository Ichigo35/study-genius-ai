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
  `android/app/build/outputs/apk/debug/app-debug.apk`.
- Cloudflare Bot Fight Mode (or similar) 403s requests without a real browser
  User-Agent — expected for `curl`/`urllib` smoke tests, not a bug.

## Google Sign-In

Implemented in `src/lib/googleAuth.ts`, replacing the old
`@lovable.dev/cloud-auth-js`-based flow (removed from `auth.tsx`). Supabase
client uses `flowType: 'pkce'` (`src/integrations/supabase/client.ts`).

- Web: standard Supabase `signInWithOAuth` redirect.
- Android: Google blocks OAuth inside embedded WebViews, so the flow opens
  the system browser (`@capacitor/browser`) and catches the redirect via a
  custom-scheme deep link `com.studygenius.ai://auth-callback`
  (`@capacitor/app`, intent-filter in `AndroidManifest.xml`), then exchanges
  the PKCE code for a session.
- **Manual setup still required (needs the user's own accounts, not doable
  from here):**
  1. Google Cloud Console → OAuth consent screen + an OAuth 2.0 **Web
     application** Client ID, with authorized redirect URI
     `https://yxhktlafavsgxtpucytn.supabase.co/auth/v1/callback`.
  2. Supabase Dashboard (this project is on Lovable Cloud, not in the
     account reachable from here via MCP) → Authentication → Providers →
     Google → enable, paste the Client ID + Client Secret.
  3. No Android-specific client / SHA-1 fingerprint needed — the system
     browser + deep link approach avoids that entirely.

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
