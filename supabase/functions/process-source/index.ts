// process-source — runs ONE analysis step (transcription OR note generation)
// for a `sources` row, in Supabase's Singapore region.
//
// Why this exists: the app's Cloudflare Worker runs where the user is (Laos),
// and Google geo-blocks the free Gemini API from there. This Edge Function
// runs in ap-southeast-1 (Singapore, supported by Gemini) and has a much
// longer execution budget than a free-plan Worker's `waitUntil`. The Worker's
// `advanceAnalysis` just kicks this function and returns; the client polls
// `sources.status`.
//
// Invoked with: POST { sourceId, outputLanguage? }, headers:
//   Authorization: Bearer <user JWT>   (verify_jwt = true)
//   x-gemini-key:  <Gemini API key>    (forwarded by the Worker)
//
// It acks immediately and does the work via EdgeRuntime.waitUntil.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UPLOAD_BUCKET = "study-uploads";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

const TEXT_CHAIN = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
];
const MULTIMODAL_CHAIN = [
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
];

const STEP_CLAIM_STALE_MS = 6 * 60 * 1000;

class GeminiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const FALLBACK = new Set(["rate_limit", "quota", "upstream", "network", "timeout", "model_unavailable"]);

const LANG: Record<string, string> = {
  fr: "français",
  en: "English",
  lo: "ພາສາລາວ (Lao)",
  th: "ภาษาไทย (Thai)",
  same: "the same language as the source content",
};
const langLine = (l: string) => `Write the entire output in ${LANG[l] ?? LANG.same}.`;
const detailLine = (d: string) =>
  d === "quick"
    ? "Be concise: short summary, only the most essential elements."
    : d === "detailed"
      ? "Be thorough and detailed, cover every part of the content."
      : d === "exam"
        ? "Exam preparation mode: prioritise concepts, definitions, dates, formulas, mechanisms, likely exam questions, traps and common mistakes."
        : "Balanced level of detail, clear and structured for a student.";

const STUDY_SYSTEM =
  "You are an expert academic assistant that turns course material into high quality study notes for students. Never invent facts not supported by the source. Always answer with valid JSON matching the requested schema.";

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

  for (let i = 0; i < opts.models.length; i++) {
    const model = opts.models[i];
    if (deadline - Date.now() < 15_000) throw last;

    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: opts.parts }],
      generationConfig: {
        temperature: opts.temperature ?? 0.4,
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
        const daily = /PerDay|free[_ ]?tier|RequestsPerDay|exceeded your current quota/i.test(text);
        last = new GeminiError(
          "quota",
          daily
            ? "Quota gratuit de l'API Gemini épuisé pour aujourd'hui."
            : "Limite de l'API Gemini atteinte, réessaie plus tard.",
        );
      } else if (res.status >= 500) {
        last = new GeminiError("upstream", "Le service AI Gemini est surchargé.");
      } else if (res.status === 404) {
        last = new GeminiError("model_unavailable", `Modèle "${model}" indisponible.`);
      } else if (/User location is not supported|FAILED_PRECONDITION/i.test(text)) {
        // Should not happen from Singapore, but surface it clearly if it does.
        throw new GeminiError("geo_blocked", "Google bloque l'API Gemini pour cette région.");
      } else if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new GeminiError("auth", `Requête Gemini refusée (${res.status}): ${text.slice(0, 200)}`);
      } else {
        last = new GeminiError("upstream", `Erreur Gemini ${res.status}.`);
      }
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof GeminiError) {
        if (!FALLBACK.has(e.code)) throw e;
        last = e;
      } else {
        last = new GeminiError(
          "timeout",
          e instanceof Error && e.name === "AbortError"
            ? `Modèle "${model}" trop lent.`
            : "Connexion au service AI interrompue.",
        );
      }
    }
    console.error(`[gemini] "${model}" failed (${last.code}) → next`);
    await sleep(500);
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

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// deno-lint-ignore no-explicit-any
async function fail(supabase: SupabaseClient, sourceId: string, e: any) {
  const message =
    e instanceof GeminiError ? e.message : "Une erreur inattendue est survenue pendant l'analyse.";
  console.error("[process-source] fail:", e);
  await supabase
    .from("sources")
    .update({ status: "failed", error_message: message, progress_step: null })
    .eq("id", sourceId);
}

async function claimStep(supabase: SupabaseClient, id: string, from: string, to: string) {
  const staleBefore = new Date(Date.now() - STEP_CLAIM_STALE_MS).toISOString();
  const { data } = await supabase
    .from("sources")
    .update({ progress_step: to })
    .eq("id", id)
    .or(`progress_step.eq.${from},and(progress_step.eq.${to},updated_at.lt.${staleBefore})`)
    .select("id");
  return !!data && data.length > 0;
}

async function processStep(supabase: SupabaseClient, sourceId: string, outLang: string, key: string) {
  const { data: src } = await supabase.from("sources").select("*").eq("id", sourceId).maybeSingle();
  if (!src || src.status !== "processing") return;

  const type = src.type as string;
  const isDoc = type === "image" || type === "pdf";
  const detail = (src.detail_level ?? "standard") as string;
  const outputLanguage = outLang || (src.language as string | null) || "same";
  const storagePath = (src.storage_path as string | null) || `${src.user_id}/${sourceId}`;

  const [{ data: notes }, { data: trs }] = await Promise.all([
    supabase.from("study_notes").select("id").eq("source_id", sourceId).limit(1),
    supabase
      .from("transcripts")
      .select("full_text")
      .eq("source_id", sourceId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (notes && notes.length > 0) {
    await supabase
      .from("sources")
      .update({ status: "completed", progress_step: "done" })
      .eq("id", sourceId);
    return;
  }

  const content = trs?.[0]?.full_text || (src.raw_text as string | null) || "";

  // ---- Step 1: transcript / extracted text ----
  if (!content) {
    if (!(await claimStep(supabase, sourceId, "transcript_pending", "transcript_running"))) return;
    try {
      let text: string;
      if (type === "youtube" && src.original_url) {
        text = await callGemini(key, {
          models: MULTIMODAL_CHAIN,
          temperature: 0.2,
          parts: [
            { fileData: { fileUri: src.original_url } },
            { text: "Transcribe this video verbatim. Prefix each paragraph with [mm:ss]. Plain text, original language." },
          ],
        });
      } else {
        const { data: file, error } = await supabase.storage.from(UPLOAD_BUCKET).download(storagePath);
        if (error || !file) {
          throw new GeminiError("needs_reupload", "Réimporte le fichier pour relancer l'analyse.");
        }
        const b64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
        const mime = file.type || "application/octet-stream";
        text = await callGemini(key, {
          models: MULTIMODAL_CHAIN,
          temperature: 0.2,
          parts: [
            { inlineData: { mimeType: mime, data: b64 } },
            {
              text: isDoc
                ? "Extract ALL text from this document / photo of notes, in reading order. Keep headings, lists and tables as plain markdown. Transcribe formulas as written. Output the extracted content only."
                : "Transcribe this lecture recording verbatim. Prefix each paragraph with [mm:ss]. Plain text, original spoken language.",
            },
          ],
        });
      }
      await supabase.from("transcripts").delete().eq("source_id", sourceId);
      await supabase
        .from("transcripts")
        .insert({ user_id: src.user_id, source_id: sourceId, full_text: text, language: outputLanguage });
      await supabase.from("sources").update({ progress_step: "notes_pending" }).eq("id", sourceId);
      if (type !== "youtube") await supabase.storage.from(UPLOAD_BUCKET).remove([storagePath]);
      // The Worker's next poll kicks this function again for the notes step —
      // one step per invocation keeps each well inside the Edge Function budget.
    } catch (e) {
      await fail(supabase, sourceId, e);
    }
    return;
  }

  // ---- Step 2: study notes ----
  if (!(await claimStep(supabase, sourceId, "notes_pending", "notes_running"))) return;
  try {
    const raw = await callGemini(key, {
      models: TEXT_CHAIN,
      system: STUDY_SYSTEM,
      schema: noteSchema,
      timeoutMs: 110_000,
      totalBudgetMs: 150_000,
      parts: [
        {
          text: `Create a complete study sheet from the course content below.
${detailLine(detail)}
${langLine(outputLanguage)}
Only use information present in the content.

--- COURSE CONTENT ---
${content.slice(0, 200_000)}`,
        },
      ],
    });
    // deno-lint-ignore no-explicit-any
    const generated = parseJson<any>(raw);
    await supabase.from("study_notes").delete().eq("source_id", sourceId);
    await supabase.from("study_notes").insert({
      user_id: src.user_id,
      space_id: src.space_id,
      source_id: sourceId,
      title: generated.title,
      detail_level: detail,
      language: outputLanguage,
      content: generated,
    });
    await supabase
      .from("sources")
      .update({
        status: "completed",
        progress_step: "done",
        title: generated.title || src.title,
      })
      .eq("id", sourceId);

    // usage accounting
    await supabase.from("usage_events").insert({ user_id: src.user_id, kind: "analysis", amount: 1 });
    if (type === "youtube")
      await supabase.from("usage_events").insert({ user_id: src.user_id, kind: "video", amount: 1 });
    if (type === "audio" || type === "recording") {
      const mins = Math.max(1, Math.ceil(((src.duration_seconds as number | null) ?? 60) / 60));
      await supabase
        .from("usage_events")
        .insert({ user_id: src.user_id, kind: "audio_minutes", amount: mins });
    }
    await supabase
      .from("study_spaces")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", src.space_id);
  } catch (e) {
    await fail(supabase, sourceId, e);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  let payload: { sourceId?: string; outputLanguage?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400 });
  }
  const sourceId = payload.sourceId;
  if (!sourceId) {
    return new Response(JSON.stringify({ error: "missing sourceId" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // The Gemini key comes from the Worker's header. Stash it so the pg_cron
  // backstop (which has no key) can reuse it.
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

  const work = processStep(supabase, sourceId, payload.outputLanguage ?? "same", key).catch((e) =>
    console.error("[process-source] uncaught:", e),
  );
  // @ts-ignore EdgeRuntime is provided by the Supabase runtime
  EdgeRuntime.waitUntil(work);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
});
