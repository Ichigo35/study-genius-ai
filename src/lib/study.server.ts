import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";
import { GeminiError } from "./gemini.server";

/**
 * Run `promise` beyond the lifetime of the current request. On Cloudflare
 * Workers, `request.waitUntil` (wired by the Nitro preset) keeps the isolate
 * alive until it settles — so a transcription survives the client hanging up.
 * If `waitUntil` isn't available it's a plain floating promise (runs only while
 * the isolate stays warm) — no worse than awaiting it inline.
 */
export function runInBackground(promise: Promise<unknown>) {
  const p = Promise.resolve(promise).catch((e) => {
    console.error("[bg] task failed:", e);
  });
  try {
    const req = getRequest() as unknown as {
      waitUntil?: (pr: Promise<unknown>) => void;
    };
    if (typeof req?.waitUntil === "function") {
      req.waitUntil(p);
      console.log("[bg] registered with waitUntil");
    } else {
      console.warn("[bg] no waitUntil available — task runs only while isolate is warm");
    }
  } catch (e) {
    console.warn("[bg] waitUntil lookup failed:", e);
  }
  return p;
}

export type UsageKind = "analysis" | "video" | "audio_minutes" | "quiz" | "chat";

const LIMIT_COLUMN: Record<UsageKind, string> = {
  analysis: "daily_analyses",
  video: "daily_videos",
  audio_minutes: "daily_audio_minutes",
  quiz: "daily_quizzes",
  chat: "daily_chat_messages",
};

export interface UsageSnapshot {
  limits: Record<UsageKind, number>;
  used: Record<UsageKind, number>;
  remaining: Record<UsageKind, number>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

export async function getUsageSnapshot(supabase: DB, userId: string): Promise<UsageSnapshot> {
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: limitRow }, { data: events }] = await Promise.all([
    supabase.from("usage_limits").select("*").eq("plan", "free").maybeSingle(),
    supabase.from("usage_events").select("kind, amount").eq("user_id", userId).eq("day", today),
  ]);

  const limits = {} as Record<UsageKind, number>;
  const used = {} as Record<UsageKind, number>;
  const remaining = {} as Record<UsageKind, number>;

  (Object.keys(LIMIT_COLUMN) as UsageKind[]).forEach((kind) => {
    limits[kind] = Number(limitRow?.[LIMIT_COLUMN[kind]] ?? 0);
    used[kind] = (events ?? [])
      .filter((e: { kind: string }) => e.kind === kind)
      .reduce((sum: number, e: { amount: number }) => sum + Number(e.amount), 0);
    remaining[kind] = Math.max(0, limits[kind] - used[kind]);
  });

  return { limits, used, remaining };
}

export async function assertQuota(supabase: DB, userId: string, kind: UsageKind, amount = 1) {
  const snapshot = await getUsageSnapshot(supabase, userId);
  if (snapshot.used[kind] + amount > snapshot.limits[kind]) {
    throw new GeminiError("quota", "Tu as atteint ta limite quotidienne.", 429);
  }
}

export async function recordUsage(supabase: DB, userId: string, kind: UsageKind, amount = 1) {
  await supabase.from("usage_events").insert({ user_id: userId, kind, amount });
}

/** Concatenates every available textual material of a study space. */
export async function buildSpaceContext(supabase: DB, spaceId: string, maxChars = 250000) {
  const [{ data: sources }, { data: notes }] = await Promise.all([
    supabase
      .from("sources")
      .select("id, title, type, raw_text, transcripts(full_text)")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: true }),
    supabase.from("study_notes").select("title, content").eq("space_id", spaceId),
  ]);

  const chunks: string[] = [];
  for (const s of sources ?? []) {
    const transcript = Array.isArray(s.transcripts) ? s.transcripts[0]?.full_text : undefined;
    const body = transcript || s.raw_text;
    if (body) chunks.push(`### Source: ${s.title} (${s.type})\n${body}`);
  }
  for (const n of notes ?? []) {
    chunks.push(`### Study notes: ${n.title}\n${JSON.stringify(n.content)}`);
  }
  return chunks.join("\n\n").slice(0, maxChars);
}

export function parseYouTubeUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1) || null;
    if (host.endsWith("youtube.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = u.pathname.match(/\/(shorts|embed|live)\/([\w-]+)/);
      if (m) return m[2] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export function errorPayload(error: unknown) {
  if (error instanceof GeminiError) return { code: error.code, message: error.message };
  console.error(error);
  return { code: "unknown", message: "Une erreur inattendue est survenue." };
}
