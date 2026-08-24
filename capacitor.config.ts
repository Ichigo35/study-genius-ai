import type { CapacitorConfig } from '@capacitor/cli';

// This app runs server functions (Gemini calls, Supabase access) via TanStack
// Start/Nitro — it can't work as a static export. The Android shell loads the
// live Cloudflare Workers deployment instead of bundling `.output/public`
// locally. `webDir` still points at a real build output so `cap sync`
// validation passes, but its contents aren't what gets shown on-device.
const config: CapacitorConfig = {
  appId: 'com.studygenius.ai',
  appName: 'Study Genius AI',
  webDir: '.output/public',
  server: {
    url: 'https://ichigo35-study-genius-ai.ichigo35.workers.dev',
    cleartext: false,
  },
};

export default config;
