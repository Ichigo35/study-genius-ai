import type { SupabaseClient } from "@supabase/supabase-js";
import {
  geminiService,
  GeminiError,
  type DetailLevel,
  type StudyNoteContent,
} from "./gemini.server";
import {
  assertQuota,
  recordUsage,
  buildSpaceContext,
  parseYouTubeUrl,
  errorPayload,
} from "./study.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

async function touchSpace(supabase: DB, spaceId: string) {
  await supabase
    .from("study_spaces")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", spaceId);
}

async function persistNotes(
  supabase: DB,
  userId: string,
  spaceId: string,
  sourceId: string,
  notes: StudyNoteContent,
  detailLevel: DetailLevel,
  language: string,
) {
  const { data, error } = await supabase
    .from("study_notes")
    .insert({
      user_id: userId,
      space_id: spaceId,
      source_id: sourceId,
      title: notes.title,
      detail_level: detailLevel,
      language,
      content: notes,
    })
    .select("id")
    .single();
  if (error) throw new GeminiError("db", error.message, 500);
  return data.id as string;
}

async function fail(supabase: DB, sourceId: string, error: unknown) {
  const payload = errorPayload(error);
  await supabase
    .from("sources")
    .update({ status: "failed", error_message: payload.message, progress_step: null })
    .eq("id", sourceId);
  return { ok: false as const, sourceId, error: payload };
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
const STEP_CLAIM_STALE_MS = 4 * 60 * 1000;

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
  return { ok: true, sourceId: source.id as string };
}

export interface AdvanceResult {
  ok: true;
  sourceId: string;
  status: "processing" | "completed" | "failed";
  step: string;
  error?: { code: string; message: string };
}

/**
 * Atomically claims a pending step: flips `from` → `to`, or re-claims a `to`
 * whose last touch is older than STEP_CLAIM_STALE_MS. Returns true if this call
 * won the claim and should do the work.
 */
async function claimStep(supabase: DB, sourceId: string, from: string, to: string) {
  const staleBefore = new Date(Date.now() - STEP_CLAIM_STALE_MS).toISOString();
  const { data } = await supabase
    .from("sources")
    .update({ progress_step: to })
    .eq("id", sourceId)
    .or(`progress_step.eq.${from},and(progress_step.eq.${to},updated_at.lt.${staleBefore})`)
    .select("id");
  return !!data && data.length > 0;
}

export async function advanceAnalysis(
  supabase: DB,
  userId: string,
  data: {
    sourceId: string;
    outputLanguage: string;
    base64?: string | undefined;
    mimeType?: string | undefined;
  },
): Promise<AdvanceResult | { ok: false; error: { code: string; message: string } }> {
  const { data: src, error } = await supabase
    .from("sources")
    .select("*")
    .eq("id", data.sourceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { ok: false, error: { code: "db", message: error.message } };
  if (!src) return { ok: false, error: { code: "not_found", message: "Source introuvable." } };

  const sourceId = src.id as string;
  const spaceId = src.space_id as string;
  const type = src.type as string;
  const isDoc = type === "image" || type === "pdf";
  const detailLevel = (src.detail_level ?? "standard") as DetailLevel;
  const outputLanguage = data.outputLanguage || (src.language as string | null) || "same";

  const result = (
    status: "processing" | "completed" | "failed",
    step: string,
    err?: { code: string; message: string },
  ): AdvanceResult => ({ ok: true, sourceId, status, step, ...(err ? { error: err } : {}) });

  if (src.status === "completed") return result("completed", "done");
  if (src.status === "failed") {
    return result(
      "failed",
      "failed",
      src.error_message
        ? { code: "failed", message: src.error_message as string }
        : { code: "unknown", message: "Une erreur inattendue est survenue." },
    );
  }

  const [{ data: notes }, { data: transcripts }] = await Promise.all([
    supabase
      .from("study_notes")
      .select("id")
      .eq("source_id", sourceId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("transcripts")
      .select("full_text")
      .eq("source_id", sourceId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  // Notes already exist → just close the row.
  if (notes && notes.length > 0) {
    await supabase
      .from("sources")
      .update({ status: "completed", progress_step: "done" })
      .eq("id", sourceId);
    await touchSpace(supabase, spaceId);
    return result("completed", "done");
  }

  const transcriptText = transcripts?.[0]?.full_text ?? "";
  const content = transcriptText || (src.raw_text as string | null) || "";

  // ---- Step 1: produce a transcript / extracted text ----
  if (!content) {
    if (type === "youtube" && src.original_url) {
      if (!(await claimStep(supabase, sourceId, "transcript_pending", "transcript_running"))) {
        return result("processing", "transcript_running");
      }
      try {
        const text = await geminiService.transcribeVideo({ url: src.original_url as string });
        await supabase.from("transcripts").delete().eq("source_id", sourceId);
        await supabase.from("transcripts").insert({
          user_id: userId,
          source_id: sourceId,
          full_text: text,
          language: outputLanguage,
        });
        await supabase
          .from("sources")
          .update({ progress_step: "notes_pending" })
          .eq("id", sourceId);
        return result("processing", "notes_pending");
      } catch (e) {
        const p = await fail(supabase, sourceId, e);
        return result("failed", "failed", p.error);
      }
    }

    if (data.base64 && data.mimeType) {
      if (!(await claimStep(supabase, sourceId, "transcript_pending", "transcript_running"))) {
        return result("processing", "transcript_running");
      }
      try {
        const text = isDoc
          ? await geminiService.analyzeImage({
              base64: data.base64,
              mimeType: data.mimeType,
              outputLanguage,
            })
          : await geminiService.transcribeAudio({ base64: data.base64, mimeType: data.mimeType });
        await supabase.from("transcripts").delete().eq("source_id", sourceId);
        await supabase.from("transcripts").insert({
          user_id: userId,
          source_id: sourceId,
          full_text: text,
          language: outputLanguage,
        });
        await supabase
          .from("sources")
          .update({ progress_step: "notes_pending" })
          .eq("id", sourceId);
        return result("processing", "notes_pending");
      } catch (e) {
        const p = await fail(supabase, sourceId, e);
        return result("failed", "failed", p.error);
      }
    }

    // Media source with no transcript yet and this caller has no file to send
    // (e.g. the source page resuming after the upload screen was closed). The
    // driver that holds the upload does the real work; here we only wait a
    // bounded time, then fail cleanly so the UI stops spinning. 150s > the
    // transcription chain budget, so we never clobber an in-flight attempt.
    const untouchedFor = Date.now() - new Date(src.updated_at as string).getTime();
    if (untouchedFor > 150_000) {
      const p = await fail(
        supabase,
        sourceId,
        new GeminiError("needs_reupload", "Réimporte le fichier pour relancer l'analyse.", 400),
      );
      return result("failed", "failed", p.error);
    }
    return result("processing", (src.progress_step as string) ?? "transcript_pending");
  }

  // ---- Step 2: generate the study notes ----
  if (!(await claimStep(supabase, sourceId, "notes_pending", "notes_running"))) {
    return result("processing", "notes_running");
  }
  try {
    const generated = await geminiService.generateStudyNotes({
      content,
      detailLevel,
      outputLanguage,
    });
    await supabase.from("study_notes").delete().eq("source_id", sourceId);
    await persistNotes(supabase, userId, spaceId, sourceId, generated, detailLevel, outputLanguage);
    await supabase
      .from("sources")
      .update({
        status: "completed",
        progress_step: "done",
        title: generated.title || (src.title as string),
      })
      .eq("id", sourceId);

    await recordUsage(supabase, userId, "analysis");
    if (type === "youtube") await recordUsage(supabase, userId, "video");
    if (type === "audio" || type === "recording") {
      const minutes = Math.max(1, Math.ceil(((src.duration_seconds as number | null) ?? 60) / 60));
      await recordUsage(supabase, userId, "audio_minutes", minutes);
    }
    await touchSpace(supabase, spaceId);
    return result("completed", "done");
  } catch (e) {
    const p = await fail(supabase, sourceId, e);
    return result("failed", "failed", p.error);
  }
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
  if (!hasContent && !canRegenFromUrl) {
    return {
      ok: false as const,
      error: { code: "needs_reupload", message: "Réimporte le fichier pour relancer l'analyse." },
    };
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
