// translate-source — on-demand translation of a source's study note and/or
// transcript into another language.
//
// Why an Edge Function: the app's Cloudflare Worker runs where the user is
// (Laos), and Google geo-blocks the free Gemini API from there. This function
// runs in ap-southeast-1 (Singapore, served by Gemini), same as
// `process-source`.
//
// Invoked with: POST { sourceId, language, kinds? }, headers:
//   Authorization: Bearer <user JWT>    (verify_jwt = false)
//   x-gemini-key:  <Gemini API key>     (forwarded by the Worker; falls back
//                                        to public.app_secrets)
//
// It acks immediately and does the work via EdgeRuntime.waitUntil. The client
// polls `public.content_translations` for (source_id, language).

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Translation is a mechanical rewrite, not a reasoning task: a lite model does
// it well, in a fraction of the time, and spends the *large* free-tier bucket
// instead of the tiny gemini-3.6-flash one (~20/day). Lite-first.
const TRANSLATE_CHAIN = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
];

// Human-readable target-language names for the prompt.
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

const noteSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    keyPoints: { type: "array", items: { type: "string" } },
    concepts: {
      type: "array",
      items: {
        type: "object",
        properties: { term: { type: "string" }, definition: { type: "string" } },
        required: ["term", "definition"],
      },
    },
    mustKnow: { type: "array", items: { type: "string" } },
    facts: { type: "array", items: { type: "string" } },
    examples: { type: "array", items: { type: "string" } },
    examTopics: { type: "array", items: { type: "string" } },
    simpleExplanation: { type: "string" },
    potentialQuestions: { type: "array", items: { type: "string" } },
    outline: { type: "array", items: { type: "string" } },
  },
  required: [
    "title",
    "summary",
    "keyPoints",
    "concepts",
    "mustKnow",
    "facts",
    "examples",
    "examTopics",
    "simpleExplanation",
    "potentialQuestions",
    "outline",
  ],
};

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
          // Some flash models reject thinkingConfig — retry once without it.
          dropThinking = true;
          return attempt();
        }
        if (res.status === 400) {
          // Model-specific rejection (schema quirk, arg) — let the chain move on.
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

async function markFailed(
  supabase: SupabaseClient,
  sourceId: string,
  language: string,
  kind: string,
  // deno-lint-ignore no-explicit-any
  e: any,
) {
  const message =
    e instanceof GeminiError ? e.message : "La traduction a échoué. Réessaie plus tard.";
  console.error(`[translate-source] ${kind}/${language} failed:`, e);
  await supabase
    .from("content_translations")
    .update({ status: "failed", error_message: message })
    .eq("source_id", sourceId)
    .eq("language", language)
    .eq("kind", kind);
}

async function translateNote(
  supabase: SupabaseClient,
  key: string,
  sourceId: string,
  language: string,
  // deno-lint-ignore no-explicit-any
  note: any,
) {
  const raw = await callGemini(key, {
    models: TRANSLATE_CHAIN,
    schema: noteSchema,
    temperature: 0.2,
    timeoutMs: 60_000,
    totalBudgetMs: 120_000,
    system:
      "You are a professional academic translator. You translate study notes faithfully and fluently, keeping every fact, number, name and formula identical. You never add, remove or reorder items. You output valid JSON only, matching the given schema exactly.",
    parts: [
      {
        // Static rules + the note JSON come first and are identical across
        // target languages, so Gemini's implicit context cache is reused when
        // the same note is translated into a second language.
        text: `Translate every human-readable string value in the study-note JSON below.
Rules:
- Keep the exact same JSON structure, the same keys, and the same number of array items.
- Translate values only, never the keys.
- Keep proper nouns, acronyms, numbers, dates and formulas unchanged.
- Natural, fluent wording suitable for a student.

--- JSON ---
${JSON.stringify(note)}

--- TARGET LANGUAGE ---
Translate every value into ${langName(language)}. Output the translated JSON only.`,
      },
    ],
  });
  // deno-lint-ignore no-explicit-any
  const translated = parseJson<any>(raw);
  await supabase
    .from("content_translations")
    .update({ status: "ready", content: translated, text: null, error_message: null })
    .eq("source_id", sourceId)
    .eq("language", language)
    .eq("kind", "note");
}

async function translateTranscript(
  supabase: SupabaseClient,
  key: string,
  sourceId: string,
  language: string,
  fullText: string,
) {
  const out = await callGemini(key, {
    models: TRANSLATE_CHAIN,
    temperature: 0.2,
    timeoutMs: 90_000,
    totalBudgetMs: 150_000,
    system:
      "You are a professional translator. You translate transcripts and extracted documents faithfully, keeping meaning, structure and layout.",
    parts: [
      {
        text: `Translate the text below.
Rules:
- Keep every [mm:ss] timestamp exactly where it is.
- Preserve markdown headings, lists and tables.
- Keep numbers, names and formulas unchanged.
- Output the translation only, nothing else.

--- TEXT ---
${fullText.slice(0, 120_000)}

--- TARGET LANGUAGE ---
Translate the text above into ${langName(language)}.`,
      },
    ],
  });
  await supabase
    .from("content_translations")
    .update({ status: "ready", text: out, content: null, error_message: null })
    .eq("source_id", sourceId)
    .eq("language", language)
    .eq("kind", "transcript");
}

async function run(
  supabase: SupabaseClient,
  key: string,
  sourceId: string,
  language: string,
  wantKinds: string[] | null,
) {
  const { data: src } = await supabase
    .from("sources")
    .select("id, user_id, space_id")
    .eq("id", sourceId)
    .maybeSingle();
  if (!src) return;

  const [{ data: notes }, { data: trs }] = await Promise.all([
    supabase
      .from("study_notes")
      .select("content")
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

  const note = notes?.[0]?.content ?? null;
  const transcript = (trs?.[0]?.full_text as string | null) || "";

  const kinds: { kind: "note" | "transcript"; has: boolean }[] = [
    { kind: "note", has: !!note },
    { kind: "transcript", has: !!transcript.trim() },
  ];

  const todo = kinds.filter(
    ({ kind, has }) => has && (!wantKinds || wantKinds.includes(kind)),
  );

  // Note + transcript are independent Gemini calls — run them concurrently.
  await Promise.all(
    todo.map(async ({ kind }) => {
      // Claim / (re)create the row as pending so the client sees progress.
      await supabase.from("content_translations").upsert(
        {
          user_id: src.user_id,
          source_id: sourceId,
          kind,
          language,
          status: "pending",
          error_message: null,
        },
        { onConflict: "source_id,kind,language" },
      );

      try {
        if (kind === "note") await translateNote(supabase, key, sourceId, language, note);
        else await translateTranscript(supabase, key, sourceId, language, transcript);
        await supabase
          .from("usage_events")
          .insert({ user_id: src.user_id, kind: "translation", amount: 1 });
      } catch (e) {
        await markFailed(supabase, sourceId, language, kind, e);
      }
    }),
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  let payload: { sourceId?: string; language?: string; kinds?: string[] };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400 });
  }
  const sourceId = payload.sourceId;
  const language = (payload.language ?? "").trim();
  if (!sourceId || !language) {
    return new Response(JSON.stringify({ error: "missing sourceId or language" }), {
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

  const kinds = Array.isArray(payload.kinds) && payload.kinds.length ? payload.kinds : null;
  const work = run(supabase, key, sourceId, language, kinds).catch((e) =>
    console.error("[translate-source] uncaught:", e),
  );
  // @ts-ignore EdgeRuntime is provided by the Supabase runtime
  EdgeRuntime.waitUntil(work);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
});
