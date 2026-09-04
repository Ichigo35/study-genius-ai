import type { SupabaseClient } from "@supabase/supabase-js";
import { geminiService, GeminiError, type DetailLevel } from "./gemini.server";
import {
  assertQuota,
  recordUsage,
  buildSpaceContext,
  parseYouTubeUrl,
  errorPayload,
} from "./study.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

export const UPLOAD_BUCKET = "study-uploads";

async function touchSpace(supabase: DB, spaceId: string) {
  await supabase
    .from("study_spaces")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", spaceId);
}

/**
 * The analysis pipeline is split into short, client-driven steps so no single
 * request has to survive two back-to-back 20–60s Gemini calls (which used to
 * time out on the client / the Worker and leave the progress bar stuck).
 *
 *   `start*`          — validates + quota-checks + inserts the `sources` row,
 *                       returns instantly. No Gemini call.
 *   `advanceAnalysis` — does exactly ONE unit of work (one Gemini call) then
 *                       returns. The client calls it in a loop until the source
 *                       is `completed`/`failed`; the source page does the same,
 *                       so an interrupted run resumes on its own.
 *
 * `progress_step` state machine:
 *   transcript_pending → transcript_running → notes_pending → notes_running → done
 * (text sources start straight at `notes_pending`.)
 */

type StartResult =
  | { ok: true; sourceId: string; cached?: boolean }
  | { ok: false; error: { code: string; message: string } };

// A step claim older than this is assumed dead (Worker killed / connection
// dropped mid-call) and may be re-claimed by another `advanceAnalysis` call.
// Shorter than STALE_ANALYSIS_MS in sources.ts so a run self-heals before the
// UI hard-fails it.
const STEP_CLAIM_STALE_MS = 6 * 60 * 1000;

export async function startYouTubeAnalysis(
  supabase: DB,
  userId: string,
  data: { spaceId: string; url: string; detailLevel: DetailLevel; outputLanguage: string },
): Promise<StartResult> {
  const videoId = parseYouTubeUrl(data.url);
  if (!videoId) {
    return {
      ok: false,
      error: { code: "invalid_url", message: "Ce lien YouTube n'est pas valide." },
    };
  }
  try {
    await assertQuota(supabase, userId, "video");
    await assertQuota(supabase, userId, "analysis");
  } catch (e) {
    return { ok: false, error: errorPayload(e) };
  }

  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const { data: existing } = await supabase
    .from("sources")
    .select("id")
    .eq("space_id", data.spaceId)
    .eq("original_url", cleanUrl)
    .eq("status", "completed")
    .maybeSingle();
  if (existing) return { ok: true, sourceId: existing.id as string, cached: true };

  const { data: source, error } = await supabase
    .from("sources")
    .insert({
      user_id: userId,
      space_id: data.spaceId,
      title: `YouTube — ${videoId}`,
      type: "youtube",
      status: "processing",
      progress_step: "transcript_pending",
      original_url: cleanUrl,
      detail_level: data.detailLevel,
      language: data.outputLanguage,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: { code: "db", message: error.message } };
  return { ok: true, sourceId: source.id as string };
}

export async function startTextAnalysis(
  supabase: DB,
  userId: string,
  data: {
    spaceId: string;
    title: string;
    text: string;
    detailLevel: DetailLevel;
    outputLanguage: string;
  },
): Promise<StartResult> {
  try {
    await assertQuota(supabase, userId, "analysis");
  } catch (e) {
    return { ok: false, error: errorPayload(e) };
  }
  const { data: source, error } = await supabase
    .from("sources")
    .insert({
      user_id: userId,
      space_id: data.spaceId,
      title: data.title,
      type: "text",
      status: "processing",
      progress_step: "notes_pending",
      raw_text: data.text,
      detail_level: data.detailLevel,
      language: data.outputLanguage,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: { code: "db", message: error.message } };
  return { ok: true, sourceId: source.id as string };
}

export async function startMediaAnalysis(
  supabase: DB,
  userId: string,
  data: {
    spaceId: string;
    title: string;
    kind: "audio" | "recording" | "image" | "pdf";
    mimeType: string;
    durationSeconds?: number | undefined;
    detailLevel: DetailLevel;
    outputLanguage: string;
  },
): Promise<StartResult> {
  const isDoc = data.kind === "image" || data.kind === "pdf";
  const minutes = Math.max(1, Math.ceil((data.durationSeconds ?? 60) / 60));
  try {
    await assertQuota(supabase, userId, "analysis");
    if (!isDoc) await assertQuota(supabase, userId, "audio_minutes", minutes);
  } catch (e) {
    return { ok: false, error: errorPayload(e) };
  }

  const { data: source, error } = await supabase
    .from("sources")
    .insert({
      user_id: userId,
      space_id: data.spaceId,
      title: data.title,
      type: data.kind,
      status: "processing",
      progress_step: "transcript_pending",
      duration_seconds: data.durationSeconds ?? null,
      detail_level: data.detailLevel,
      language: data.outputLanguage,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: { code: "db", message: error.message } };
  const sourceId = source.id as string;
  // The client uploads the file to this path next; `advanceAnalysis` reads it.
  await supabase
    .from("sources")
    .update({ storage_path: `${userId}/${sourceId}` })
    .eq("id", sourceId);
  return { ok: true, sourceId };
}

export interface AdvanceResult {
  ok: true;
  sourceId: string;
  status: "processing" | "completed" | "failed";
  step: string;
  error?: { code: string; message: string };
}

/**
 * Kicks the `process-source` Supabase Edge Function (runs in ap-southeast-1 /
 * Singapore, which the Gemini API serves — unlike the Worker's own region).
 * Fire-and-fast: the function acks in ~1s and does the Gemini work via its own
 * `EdgeRuntime.waitUntil` (a much longer budget than a free-plan Worker).
 */
async function kickProcessor(sourceId: string, outputLanguage: string, authHeader?: string) {
  const url = process.env["SUPABASE_URL"];
  const anon = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const gemKey = process.env["GEMINI_API_KEY"]
    ?.trim()
    .replace(/^["']|["']$/g, "")
    .trim();
  if (!url || !gemKey || !authHeader) {
    console.error("[advanceAnalysis] cannot kick processor — missing url/key/auth");
    return;
  }
  try {
    const res = await fetch(`${url}/functions/v1/process-source`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: authHeader,
        ...(anon ? { apikey: anon } : {}),
        "x-gemini-key": gemKey,
      },
      body: JSON.stringify({ sourceId, outputLanguage }),
    });
    if (!res.ok) console.error(`[advanceAnalysis] processor kick → ${res.status}`);
  } catch (e) {
    console.error("[advanceAnalysis] processor kick failed:", e);
  }
}

export async function advanceAnalysis(
  supabase: DB,
  userId: string,
  data: {
    sourceId: string;
    outputLanguage: string;
    authHeader?: string | undefined;
  },
): Promise<AdvanceResult | { ok: false; error: { code: string; message: string } }> {
  const { data: src, error } = await supabase
    .from("sources")
    .select("id, status, progress_step, error_message, updated_at, language")
    .eq("id", data.sourceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { ok: false, error: { code: "db", message: error.message } };
  if (!src) return { ok: false, error: { code: "not_found", message: "Source introuvable." } };

  const sourceId = src.id as string;
  const step = (src.progress_step as string | null) ?? "";
  const result = (
    status: "processing" | "completed" | "failed",
    s: string,
    err?: { code: string; message: string },
  ): AdvanceResult => ({ ok: true, sourceId, status, step: s, ...(err ? { error: err } : {}) });

  if (src.status === "completed") return result("completed", "done");
  if (src.status === "failed") {
    return result("failed", "failed", {
      code: "failed",
      message: (src.error_message as string) || "Une erreur inattendue est survenue.",
    });
  }

  // status === "processing": nudge the Singapore processor if a step is waiting
  // (or a claim looks dead). The Edge Function's own claim guards against
  // double work if several polls land at once.
  const idleMs = Date.now() - new Date(src.updated_at as string).getTime();
  const pending = step === "" || step === "transcript_pending" || step === "notes_pending";
  const staleRunning =
    (step === "transcript_running" || step === "notes_running") && idleMs > STEP_CLAIM_STALE_MS;
  if (pending || staleRunning) {
    const outputLanguage = data.outputLanguage || (src.language as string | null) || "same";
    await kickProcessor(sourceId, outputLanguage, data.authHeader);
  }
  return result("processing", step || "transcript_pending");
}

/**
 * Re-arms a failed / interrupted analysis: clears the error and resets
 * `progress_step` so the client (and the source page) resume it via
 * `advanceAnalysis`. Reuses whatever input survived — `raw_text` for pasted
 * text, the saved transcript, or `original_url` for YouTube. Uploaded files
 * aren't kept, so a media source with no transcript needs a re-import.
 */
export async function retryAnalysis(
  supabase: DB,
  userId: string,
  data: { sourceId: string; outputLanguage: string },
) {
  const { data: src, error: loadError } = await supabase
    .from("sources")
    .select("*")
    .eq("id", data.sourceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (loadError) throw new GeminiError("db", loadError.message, 500);
  if (!src)
    return { ok: false as const, error: { code: "not_found", message: "Source introuvable." } };
  if (src.status === "processing") {
    return {
      ok: false as const,
      error: { code: "processing", message: "Une analyse est déjà en cours." },
    };
  }

  try {
    await assertQuota(supabase, userId, "analysis");
  } catch (e) {
    return { ok: false as const, error: errorPayload(e) };
  }

  const sourceId = src.id as string;
  const { data: tr } = await supabase
    .from("transcripts")
    .select("full_text")
    .eq("source_id", sourceId)
    .order("created_at", { ascending: false })
    .limit(1);
  const hasContent = !!(tr?.[0]?.full_text || src.raw_text);
  const canRegenFromUrl = src.type === "youtube" && !!src.original_url;

  // Media source with no transcript yet: retry is still possible if the
  // original upload is still in Storage.
  let hasUpload = false;
  if (!hasContent && !canRegenFromUrl) {
    const path = (src.storage_path as string | null) || `${userId}/${sourceId}`;
    const { data: dl } = await supabase.storage.from(UPLOAD_BUCKET).download(path);
    hasUpload = !!dl;
    if (!hasUpload) {
      return {
        ok: false as const,
        error: {
          code: "needs_reupload",
          message: "Réimporte le fichier pour relancer l'analyse.",
        },
      };
    }
  }

  await supabase.from("study_notes").delete().eq("source_id", sourceId);
  await supabase
    .from("sources")
    .update({
      status: "processing",
      progress_step: hasContent ? "notes_pending" : "transcript_pending",
      error_message: null,
    })
    .eq("id", sourceId);

  return { ok: true as const, sourceId };
}

export async function runChat(
  supabase: DB,
  userId: string,
  data: { spaceId: string; question: string; outputLanguage: string },
) {
  await assertQuota(supabase, userId, "chat");
  const [{ data: history }, context] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("role, content")
      .eq("space_id", data.spaceId)
      .order("created_at", { ascending: true })
      .limit(20),
    buildSpaceContext(supabase, data.spaceId),
  ]);

  await supabase
    .from("chat_messages")
    .insert({ user_id: userId, space_id: data.spaceId, role: "user", content: data.question });

  if (!context.trim()) {
    const message =
      "Ce cours ne contient encore aucune source analysée. Ajoute un contenu pour que je puisse t'aider.";
    await supabase
      .from("chat_messages")
      .insert({ user_id: userId, space_id: data.spaceId, role: "assistant", content: message });
    return { ok: true as const, answer: message };
  }

  const answer = await geminiService.answerQuestion({
    context,
    history: (history ?? []) as { role: string; content: string }[],
    question: data.question,
    outputLanguage: data.outputLanguage,
  });
  await supabase
    .from("chat_messages")
    .insert({ user_id: userId, space_id: data.spaceId, role: "assistant", content: answer });
  await recordUsage(supabase, userId, "chat");
  await touchSpace(supabase, data.spaceId);
  return { ok: true as const, answer };
}

export async function runFlashcards(
  supabase: DB,
  userId: string,
  data: { spaceId: string; count: number; outputLanguage: string },
) {
  await assertQuota(supabase, userId, "analysis");
  const context = await buildSpaceContext(supabase, data.spaceId, 120000);
  if (!context.trim())
    throw new GeminiError("empty_space", "Ajoute d'abord une source à ce cours.", 400);

  const cards = await geminiService.generateFlashcards({
    content: context,
    count: data.count,
    outputLanguage: data.outputLanguage,
  });
  const { error } = await supabase
    .from("flashcards")
    .insert(
      cards.map((c) => ({ user_id: userId, space_id: data.spaceId, front: c.front, back: c.back })),
    );
  if (error) throw new GeminiError("db", error.message, 500);
  await recordUsage(supabase, userId, "analysis");
  await touchSpace(supabase, data.spaceId);
  return { ok: true as const, created: cards.length };
}

export async function runQuiz(
  supabase: DB,
  userId: string,
  data: { spaceId: string; count: number; outputLanguage: string },
) {
  await assertQuota(supabase, userId, "quiz");
  const context = await buildSpaceContext(supabase, data.spaceId, 120000);
  if (!context.trim())
    throw new GeminiError("empty_space", "Ajoute d'abord une source à ce cours.", 400);

  const questions = await geminiService.generateQuiz({
    content: context,
    count: data.count,
    outputLanguage: data.outputLanguage,
  });

  const { data: quiz, error } = await supabase
    .from("quizzes")
    .insert({
      user_id: userId,
      space_id: data.spaceId,
      title: `Quiz — ${new Date().toLocaleDateString()}`,
      question_count: questions.length,
    })
    .select("id")
    .single();
  if (error) throw new GeminiError("db", error.message, 500);

  const { error: qError } = await supabase.from("quiz_questions").insert(
    questions.map((q, i) => ({
      user_id: userId,
      quiz_id: quiz.id,
      position: i,
      type: q.type,
      question: q.question,
      options: q.options ?? [],
      correct_answer: q.correctAnswer,
      explanation: q.explanation,
    })),
  );
  if (qError) throw new GeminiError("db", qError.message, 500);

  await recordUsage(supabase, userId, "quiz");
  await touchSpace(supabase, data.spaceId);
  return { ok: true as const, quizId: quiz.id as string };
}
