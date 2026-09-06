// translate-study — on-demand translation of flashcards / a quiz into
// another language.
//
// Why an Edge Function: the app's Cloudflare Worker runs where the user is
// (Laos), and Google geo-blocks the free Gemini API from there. This function
// runs in ap-southeast-1 (Singapore, served by Gemini), same as
// `process-source` / `translate-source`.
//
// Invoked with: POST { kind: "flashcards", flashcardIds: string[], language }
//            or POST { kind: "quiz", quizId: string, language }
// headers:
//   Authorization: Bearer <user JWT>    (verify_jwt = false)
//   x-gemini-key:  <Gemini API key>     (forwarded by the Worker; falls back
//                                        to public.app_secrets)
//
// It acks immediately and does the work via EdgeRuntime.waitUntil. The client
// polls `public.flashcard_translations` / `public.quiz_translations`.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Translation is a mechanical rewrite, not a reasoning task: a lite model does
// it well, faster, and spends the *large* free-tier bucket instead of the tiny
// gemini-3.6-flash one (~20/day). Lite-first.
const TRANSLATE_CHAIN = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
];

const LANG_NAME: Record<string, string> = {
  fr: "French (français)",
  en: "English",
  th: "Thai (ภาษาไทย)",
  zh: "Simplified Chinese (简体中文)",
  ko: "Korean (한국어)",
  ja: "Japanese (日本語)",
  lo: "Lao (ພາສາລາວ)",
  es: "Spanish (español)",
  de: "German (Deutsch)",
  vi: "Vietnamese (Tiếng Việt)",
};
const langName = (l: string) => LANG_NAME[l] ?? l;

class GeminiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
const FALLBACK = new Set(["rate_limit", "quota", "upstream", "network", "timeout", "model_unavailable"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// deno-lint-ignore no-explicit-any
type Part = any;

async function callGemini(
  key: string,
  opts: {
    models: string[];
    parts: Part[];
    system?: string;
    schema?: unknown;
    temperature?: number;
    timeoutMs?: number;
    totalBudgetMs?: number;
  },
): Promise<string> {
  const deadline = Date.now() + (opts.totalBudgetMs ?? 220_000);
  const timeoutMs = opts.timeoutMs ?? 110_000;
  let last = new GeminiError("unknown", "Erreur inconnue du service AI.");
  let dropThinking = false;

  for (let i = 0; i < opts.models.length; i++) {
    const model = opts.models[i];
    if (deadline - Date.now() < 15_000) throw last;

    const attempt = async (): Promise<string> => {
      const body: Record<string, unknown> = {
        contents: [{ role: "user", parts: opts.parts }],
        generationConfig: {
          temperature: opts.temperature ?? 0.3,
          // Lite models don't "think" and 400 on thinkingConfig — only send it
          // to the thinking-capable flash models (to force thinking OFF there).
          ...(dropThinking || /lite/i.test(model)
            ? {}
            : { thinkingConfig: { thinkingBudget: 0 } }),
          ...(opts.schema
            ? { responseMimeType: "application/json", responseSchema: opts.schema }
            : {}),
        },
      };
      if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), Math.min(timeoutMs, deadline - Date.now()));
      try {
        const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const text = await res.text();

        if (res.ok) {
          const json = JSON.parse(text);
          const out =
            json.candidates?.[0]?.content?.parts?.map((p: Part) => p.text ?? "").join("") ?? "";
          if (!out.trim()) throw new GeminiError("empty", "Réponse AI vide.");
          return out;
        }
        if (res.status === 429) {
          throw new GeminiError("quota", "Quota de l'API Gemini atteint, réessaie plus tard.");
        }
        if (res.status >= 500) throw new GeminiError("upstream", "Le service AI Gemini est surchargé.");
        if (res.status === 404) throw new GeminiError("model_unavailable", `Modèle "${model}" indisponible.`);
        if (/User location is not supported|FAILED_PRECONDITION/i.test(text)) {
          throw new GeminiError("geo_blocked", "Google bloque l'API Gemini pour cette région.");
        }
        if (/api[_ ]?key|API_KEY_INVALID/i.test(text) || res.status === 401 || res.status === 403) {
          throw new GeminiError("auth", `Requête Gemini refusée (${res.status}): ${text.slice(0, 200)}`);
        }
        if (res.status === 400 && !dropThinking && !/lite/i.test(model)) {
          dropThinking = true;
          return attempt();
        }
        if (res.status === 400) {
          throw new GeminiError("model_unavailable", `Requête refusée par "${model}".`);
        }
        throw new GeminiError("upstream", `Erreur Gemini ${res.status}.`);
      } catch (e) {
        clearTimeout(timer);
        if (e instanceof GeminiError) throw e;
        throw new GeminiError(
          "timeout",
          e instanceof Error && e.name === "AbortError"
            ? `Modèle "${model}" trop lent.`
            : "Connexion au service AI interrompue.",
        );
      }
    };

    try {
      return await attempt();
    } catch (e) {
      if (e instanceof GeminiError) {
        if (!FALLBACK.has(e.code)) throw e;
        last = e;
      } else {
        last = new GeminiError("unknown", "Erreur inconnue du service AI.");
      }
    }
    console.error(`[gemini] "${model}" failed (${last.code}) → next`);
    await sleep(400);
  }
  throw last;
}

function parseJson<T>(text: string): T {
  const c = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(c) as T;
  } catch {
    const s = c.indexOf("{");
    const e = c.lastIndexOf("}");
    if (s >= 0 && e > s) return JSON.parse(c.slice(s, e + 1)) as T;
    throw new GeminiError("invalid_json", "La réponse de l'IA n'a pas pu être lue.");
  }
}

const TRANSLATOR_SYSTEM =
  "You are a professional academic translator. You translate study material faithfully and fluently, keeping every fact, number, name and formula identical. You never add, remove or reorder items. You output valid JSON only, matching the given schema exactly.";

async function translateFlashcards(
  supabase: SupabaseClient,
  key: string,
  userId: string,
  flashcardIds: string[],
  language: string,
) {
  const { data: cards, error } = await supabase
    .from("flashcards")
    .select("id, front, back")
    .in("id", flashcardIds)
    .eq("user_id", userId);
  if (error || !cards) throw new GeminiError("db", error?.message ?? "Flashcards introuvables.");

  const schema = {
    type: "object",
    properties: {
      cards: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            front: { type: "string" },
            back: { type: "string" },
          },
          required: ["id", "front", "back"],
        },
      },
    },
    required: ["cards"],
  };

  const raw = await callGemini(key, {
    models: TRANSLATE_CHAIN,
    schema,
    temperature: 0.2,
    timeoutMs: 60_000,
    totalBudgetMs: 120_000,
    system: TRANSLATOR_SYSTEM,
    parts: [
      {
        text: `Translate every "front" and "back" value in the flashcards below.
Rules:
- Keep the exact same "id" for every card, unchanged.
- Keep the same number of cards, same order.
- Front = a precise question, back = a clear short answer.
- Keep proper nouns, acronyms, numbers, dates and formulas unchanged.

--- CARDS (JSON) ---
${JSON.stringify(cards)}

--- TARGET LANGUAGE ---
Translate every "front" and "back" into natural, fluent ${langName(language)}. Output JSON only.`,
      },
    ],
  });
  const translated = parseJson<{ cards: { id: string; front: string; back: string }[] }>(raw).cards;

  for (const card of cards) {
    const t = translated.find((c) => c.id === card.id);
    if (!t) {
      await supabase
        .from("flashcard_translations")
        .update({ status: "failed", error_message: "Traduction manquante pour cette carte." })
        .eq("flashcard_id", card.id)
        .eq("language", language);
      continue;
    }
    await supabase
      .from("flashcard_translations")
      .update({ status: "ready", front: t.front, back: t.back, error_message: null })
      .eq("flashcard_id", card.id)
      .eq("language", language);
  }
}

async function translateQuiz(
  supabase: SupabaseClient,
  key: string,
  userId: string,
  quizId: string,
  language: string,
) {
  const { data: questions, error } = await supabase
    .from("quiz_questions")
    .select("id, position, type, question, options, correct_answer, explanation")
    .eq("quiz_id", quizId)
    .eq("user_id", userId)
    .order("position", { ascending: true });
  if (error || !questions || questions.length === 0) {
    throw new GeminiError("db", error?.message ?? "Questions introuvables.");
  }

  const schema = {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            question: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            correctAnswer: { type: "string" },
            explanation: { type: "string" },
          },
          required: ["id", "question", "options", "correctAnswer", "explanation"],
        },
      },
    },
    required: ["questions"],
  };

  const source = questions.map((q) => ({
    id: q.id,
    type: q.type,
    question: q.question,
    options: q.options ?? [],
    correctAnswer: q.correct_answer,
    explanation: q.explanation ?? "",
  }));

  const raw = await callGemini(key, {
    models: TRANSLATE_CHAIN,
    schema,
    temperature: 0.2,
    timeoutMs: 60_000,
    totalBudgetMs: 120_000,
    system: TRANSLATOR_SYSTEM,
    parts: [
      {
        text: `Translate the quiz questions below.
Rules:
- Keep the exact same "id" for every question, unchanged.
- Keep the same number of questions and options per question, same order.
- "correctAnswer" MUST be exactly equal (after translation) to one of the translated "options" for that question.
- For true/false questions, translate "true"/"false" consistently across options and correctAnswer.
- Keep proper nouns, acronyms, numbers, dates and formulas unchanged.

--- QUESTIONS (JSON) ---
${JSON.stringify(source)}

--- TARGET LANGUAGE ---
Translate every question, option, correctAnswer and explanation into natural, fluent ${langName(
          language,
        )} suitable for a student. Output JSON only.`,
      },
    ],
  });
  const translated = parseJson<{
    questions: { id: string; question: string; options: string[]; correctAnswer: string; explanation: string }[];
  }>(raw).questions;

  const byId = new Map(translated.map((q) => [q.id, q]));
  const payload = questions.map((q) => {
    const t = byId.get(q.id);
    return t
      ? {
          id: q.id,
          position: q.position,
          type: q.type,
          question: t.question,
          options: t.options,
          correctAnswer: t.correctAnswer,
          explanation: t.explanation,
        }
      : {
          id: q.id,
          position: q.position,
          type: q.type,
          question: q.question,
          options: q.options,
          correctAnswer: q.correct_answer,
          explanation: q.explanation,
        };
  });

  await supabase
    .from("quiz_translations")
    .update({ status: "ready", questions: payload, error_message: null })
    .eq("quiz_id", quizId)
    .eq("language", language);
}

async function markFlashcardsFailed(
  supabase: SupabaseClient,
  flashcardIds: string[],
  language: string,
  // deno-lint-ignore no-explicit-any
  e: any,
) {
  const message = e instanceof GeminiError ? e.message : "La traduction a échoué. Réessaie plus tard.";
  console.error(`[translate-study] flashcards/${language} failed:`, e);
  await supabase
    .from("flashcard_translations")
    .update({ status: "failed", error_message: message })
    .in("flashcard_id", flashcardIds)
    .eq("language", language);
}

async function markQuizFailed(
  supabase: SupabaseClient,
  quizId: string,
  language: string,
  // deno-lint-ignore no-explicit-any
  e: any,
) {
  const message = e instanceof GeminiError ? e.message : "La traduction a échoué. Réessaie plus tard.";
  console.error(`[translate-study] quiz/${language} failed:`, e);
  await supabase
    .from("quiz_translations")
    .update({ status: "failed", error_message: message })
    .eq("quiz_id", quizId)
    .eq("language", language);
}

async function run(
  supabase: SupabaseClient,
  key: string,
  payload: {
    kind: "flashcards" | "quiz";
    flashcardIds?: string[];
    quizId?: string;
    language: string;
  },
) {
  if (payload.kind === "flashcards") {
    const ids = payload.flashcardIds ?? [];
    if (ids.length === 0) return;
    const { data: card } = await supabase
      .from("flashcards")
      .select("user_id")
      .eq("id", ids[0])
      .maybeSingle();
    if (!card) return;
    try {
      await translateFlashcards(supabase, key, card.user_id, ids, payload.language);
      await supabase
        .from("usage_events")
        .insert({ user_id: card.user_id, kind: "translation", amount: 1 });
    } catch (e) {
      await markFlashcardsFailed(supabase, ids, payload.language, e);
    }
  } else {
    const quizId = payload.quizId;
    if (!quizId) return;
    const { data: quiz } = await supabase
      .from("quizzes")
      .select("user_id")
      .eq("id", quizId)
      .maybeSingle();
    if (!quiz) return;
    try {
      await translateQuiz(supabase, key, quiz.user_id, quizId, payload.language);
      await supabase
        .from("usage_events")
        .insert({ user_id: quiz.user_id, kind: "translation", amount: 1 });
    } catch (e) {
      await markQuizFailed(supabase, quizId, payload.language, e);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  let payload: {
    kind?: string;
    flashcardIds?: string[];
    quizId?: string;
    language?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400 });
  }
  const kind = payload.kind;
  const language = (payload.language ?? "").trim();
  if ((kind !== "flashcards" && kind !== "quiz") || !language) {
    return new Response(JSON.stringify({ error: "missing kind or language" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (kind === "flashcards" && (!Array.isArray(payload.flashcardIds) || payload.flashcardIds.length === 0)) {
    return new Response(JSON.stringify({ error: "missing flashcardIds" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (kind === "quiz" && !payload.quizId) {
    return new Response(JSON.stringify({ error: "missing quizId" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  let key = req.headers.get("x-gemini-key") ?? "";
  if (key) {
    await supabase.from("app_secrets").upsert({ key: "gemini_api_key", value: key });
  } else {
    const { data } = await supabase
      .from("app_secrets")
      .select("value")
      .eq("key", "gemini_api_key")
      .maybeSingle();
    key = data?.value ?? "";
  }
  if (!key) {
    return new Response(JSON.stringify({ error: "no gemini key available" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const work = run(supabase, key, {
    kind,
    flashcardIds: payload.flashcardIds,
    quizId: payload.quizId,
    language,
  }).catch((e) => console.error("[translate-study] uncaught:", e));
  // @ts-ignore EdgeRuntime is provided by the Supabase runtime
  EdgeRuntime.waitUntil(work);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
});
