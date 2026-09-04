// Adds `placement.region` to the Nitro-generated Cloudflare config so the
// Worker runs in a US region. The free Gemini API geo-blocks some countries
// (e.g. Laos) — running the Worker in the US makes its fetch() to Google
// egress from the US, which the free API accepts. Targeted placement is
// available on all Workers plans.
//
// Run after `bun run build`, before `npx nitro deploy --prebuilt`:
//   bun run build && node scripts/patch-placement.mjs && npx nitro deploy --prebuilt
//
// Override the region with PLACEMENT_REGION (e.g. "gcp:us-east4").

import { readFileSync, writeFileSync } from "node:fs";

const path = ".output/server/wrangler.json";
const region = process.env.PLACEMENT_REGION || "aws:us-east-1";

const config = JSON.parse(readFileSync(path, "utf8"));
config.placement = { region };
writeFileSync(path, JSON.stringify(config, null, 2) + "\n");

console.log(`✓ patched ${path} → placement.region = "${region}"`);
