import type { SupabaseClient } from "@supabase/supabase-js";
import { geminiService, GeminiError, type DetailLevel, type StudyNoteContent } from "./gemini.server";
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
  await supabase.from("study_spaces").update({ last_activity_at: new Date().toISOString() }).eq("id", spaceId);
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

export async function runYouTubeAnalysis(
  supabase: DB,
  userId: string,
  data: { spaceId: string; url: string; detailLevel: DetailLevel; outputLanguage: string },
) {
  const videoId = parseYouTubeUrl(data.url);
  if (!videoId) {
    return { ok: false as const, error: { code: "invalid_url", message: "Ce lien YouTube n'est pas valide." } };
  }
  await assertQuota(supabase, userId, "video");
  await assertQuota(supabase, userId, "analysis");

  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const { data: existing } = await supabase
    .from("sources")
    .select("id, status")
    .eq("space_id", data.spaceId)
    .eq("original_url", cleanUrl)
    .eq("status", "completed")
    .maybeSingle();
  if (existing) return { ok: true as const, sourceId: existing.id as string, cached: true };

  const { data: source, error } = await supabase
    .from("sources")
    .insert({
      user_id: userId,
      space_id: data.spaceId,
      title: `YouTube — ${videoId}`,
      type: "youtube",
      status: "processing",
      progress_step: "transcribing",
      original_url: cleanUrl,
      detail_level: data.detailLevel,
    })
    .select("id")
    .single();
  if (error) throw new GeminiError("db", error.message, 500);
  const sourceId = source.id as string;

  try {
    const result = await geminiService.analyzeVideo({
      url: cleanUrl,
      detailLevel: data.detailLevel,
      outputLanguage: data.outputLanguage,
    });
    await supabase.from("transcripts").insert({
      user_id: userId,
      source_id: sourceId,
      full_text: result.transcript,
      language: data.outputLanguage,
    });
    await persistNotes(supabase, userId, data.spaceId, sourceId, result.notes, data.detailLevel, data.outputLanguage);
    await supabase
      .from("sources")
      .update({ status: "completed", progress_step: "done", title: result.notes.title || `YouTube — ${videoId}` })
      .eq("id", sourceId);
    await recordUsage(supabase, userId, "video");
    await recordUsage(supabase, userId, "analysis");
    await touchSpace(supabase, data.spaceId);
    return { ok: true as const, sourceId };
  } catch (e) {
    return fail(supabase, sourceId, e);
  }
}

export async function runTextAnalysis(
  supabase: DB,
  userId: string,
  data: { spaceId: string; title: string; text: string; detailLevel: DetailLevel; outputLanguage: string },
) {
  await assertQuota(supabase, userId, "analysis");
  const { data: source, error } = await supabase
    .from("sources")
    .insert({
      user_id: userId,
      space_id: data.spaceId,
      title: data.title,
      type: "text",
      status: "processing",
      progress_step: "analyzing",
      raw_text: data.text,
      detail_level: data.detailLevel,
    })
    .select("id")
    .single();
  if (error) throw new GeminiError("db", error.message, 500);
  const sourceId = source.id as string;

  try {
    const notes = await geminiService.generateStudyNotes({
      content: data.text,
      detailLevel: data.detailLevel,
      outputLanguage: data.outputLanguage,
    });
    await persistNotes(supabase, userId, data.spaceId, sourceId, notes, data.detailLevel, data.outputLanguage);
    await supabase.from("sources").update({ status: "completed", progress_step: "done" }).eq("id", sourceId);
    await recordUsage(supabase, userId, "analysis");
    await touchSpace(supabase, data.spaceId);
    return { ok: true as const, sourceId };
  } catch (e) {
    return fail(supabase, sourceId, e);
  }
}

export async function runMediaAnalysis(
  supabase: DB,
  userId: string,
  data: {
    spaceId: string;
    title: string;
    kind: "audio" | "recording" | "image" | "pdf";
    mimeType: string;
    base64: string;
    durationSeconds?: number | undefined;
    detailLevel: DetailLevel;
    outputLanguage: string;
  },
) {
  await assertQuota(supabase, userId, "analysis");
  const minutes = Math.max(1, Math.ceil((data.durationSeconds ?? 60) / 60));
  const isDoc = data.kind === "image" || data.kind === "pdf";
  if (!isDoc) await assertQuota(supabase, userId, "audio_minutes", minutes);

  const { data: source, error } = await supabase
    .from("sources")
    .insert({
      user_id: userId,
      space_id: data.spaceId,
      title: data.title,
      type: data.kind,
      status: "processing",
      progress_step: isDoc ? "analyzing" : "transcribing",
      duration_seconds: data.durationSeconds ?? null,
      detail_level: data.detailLevel,
    })
    .select("id")
    .single();
  if (error) throw new GeminiError("db", error.message, 500);
  const sourceId = source.id as string;

  try {
    const content =
      isDoc
        ? await geminiService.analyzeImage({
            base64: data.base64,
            mimeType: data.mimeType,
            outputLanguage: data.outputLanguage,
          })
        : await geminiService.transcribeAudio({ base64: data.base64, mimeType: data.mimeType });

    await supabase.from("transcripts").insert({
      user_id: userId,
      source_id: sourceId,
      full_text: content,
      language: data.outputLanguage,
    });
    await supabase.from("sources").update({ progress_step: "generating_notes" }).eq("id", sourceId);

    const notes = await geminiService.generateStudyNotes({
      content,
      detailLevel: data.detailLevel,
      outputLanguage: data.outputLanguage,
    });
    await persistNotes(supabase, userId, data.spaceId, sourceId, notes, data.detailLevel, data.outputLanguage);
    await supabase
      .from("sources")
      .update({ status: "completed", progress_step: "done", title: notes.title || data.title })
      .eq("id", sourceId);
    await recordUsage(supabase, userId, "analysis");
    if (!isDoc) await recordUsage(supabase, userId, "audio_minutes", minutes);
    await touchSpace(supabase, data.spaceId);
    return { ok: true as const, sourceId };
  } catch (e) {
    return fail(supabase, sourceId, e);
  }
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
    const message = "Ce cours ne contient encore aucune source analysée. Ajoute un contenu pour que je puisse t'aider.";
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
  if (!context.trim()) throw new GeminiError("empty_space", "Ajoute d'abord une source à ce cours.", 400);

  const cards = await geminiService.generateFlashcards({
    content: context,
    count: data.count,
    outputLanguage: data.outputLanguage,
  });
  const { error } = await supabase.from("flashcards").insert(
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
  if (!context.trim()) throw new GeminiError("empty_space", "Ajoute d'abord une source à ce cours.", 400);

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
