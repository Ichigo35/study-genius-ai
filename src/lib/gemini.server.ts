/**
 * geminiService — accès serveur uniquement à l'API Gemini.
 * La clé n'est jamais exposée au client.
 */

// Model *fallback chains* (comma-separated env override). callGemini walks the
// chain: if a model is rate-limited / out of daily free-tier quota / overloaded
// / unavailable / too slow, it moves the request to the next model immediately.
// Each *distinct* model version has its own separate free-tier quota, so a
// longer chain multiplies free-tier headroom. gemini-2.5-flash (exact) is NOT
// usable — it 404s "no longer available to new users" — but the ones below are.
// NOTE: the free tier is small; the real fix for sustained use is enabling
// billing on the key (aistudio.google.com/apikey → Set up billing).
// Model availability (checked live 2026-09-04 via `wrangler tail`): the 2.0/2.5
// families now 404 "no longer available" — Google points to gemini-3.5-flash-lite.
// The `-latest` aliases stay valid. Keep only 3.x + aliases here.
//
// Text/notes: quality first (the bigger "thinking" models write the best notes
// and the payload is small, so a slow call is acceptable).
const DEFAULT_TEXT_CHAIN = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
].join(",");
// Transcription / OCR: SPEED first. Thinking is disabled and the payload is big
// (audio/PDF); a thinking model here takes minutes and times out. Lite models
// transcribe in seconds.
const DEFAULT_MULTIMODAL_CHAIN = [
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
].join(",");
const MODELS = {
  text: parseChain(process.env["GEMINI_MODEL_TEXT"], DEFAULT_TEXT_CHAIN),
  multimodal: parseChain(process.env["GEMINI_MODEL_MULTIMODAL"], DEFAULT_MULTIMODAL_CHAIN),
} as const;

function parseChain(env: string | undefined, fallback: string): string[] {
  const chain = (env ?? fallback)
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return chain.length ? chain : fallback.split(",");
}

// Cloudflare Workers egress from a Cloudflare IP whose geo-location Google
// sometimes rejects → `FAILED_PRECONDITION: User location is not supported`.
// Routing through a Cloudflare AI Gateway ("google-ai-studio" provider) makes
// the upstream call originate from a supported region and fixes that.
//   GEMINI_API_BASE = https://gateway.ai.cloudflare.com/v1/<acct>/<gateway>/google-ai-studio/v1beta
// Falls back to calling Google directly.
const DIRECT_BASE = "https://generativelanguage.googleapis.com/v1beta";
const BASE = (process.env["GEMINI_API_BASE"]?.trim().replace(/\/+$/, "") || DIRECT_BASE) as string;

export class GeminiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Part =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType?: string; fileUri: string } };

function apiKey() {
  // Tolerate secrets pasted with surrounding quotes or stray whitespace/newlines —
  // those turn a valid AIza… key into a 400/401 from Google.
  const raw = process.env["GEMINI_API_KEY"];
  const key = raw
    ?.trim()
    .replace(/^["']|["']$/g, "")
    .trim();
  if (!key) throw new GeminiError("no_key", "GEMINI_API_KEY manquante côté serveur", 500);
  return key;
}

interface CallOpts {
  /** Explicit model chain; defaults to MODELS.text. */
  models?: string[];
  parts: Part[];
  system?: string;
  schema?: unknown;
  temperature?: number;
  /** Same-model retries on transient errors. Default 1 (0 for big uploads). */
  retries?: number;
  /** Per-attempt hard timeout (ms). Default 70s. */
  timeoutMs?: number;
  /** Overall budget for walking the whole chain (ms). Default 150s. */
  totalBudgetMs?: number;
  /** Disable model "thinking" (huge speed-up for transcription / OCR). */
  noThinking?: boolean;
}

// Flipped true the first time a model 400s while we send `thinkingConfig`.
// Persists for the life of the isolate so we stop wasting a big upload on it.
let THINKING_CONFIG_UNSUPPORTED = false;

// Errors that mean "this model won't work right now, try the next one".
const FALLBACK_CODES = new Set([
  "quota_free_tier",
  "rate_limit",
  "upstream",
  "network",
  "timeout",
  "model_unavailable",
]);

/**
 * Run the request against a chain of models, falling back on the next model
 * whenever the current one is rate-limited / out of quota / overloaded /
 * unavailable. Only throws once every model in the chain has failed.
 */
async function callGemini(opts: CallOpts): Promise<string> {
  const chain = opts.models?.length ? opts.models : MODELS.text;
  const deadline = Date.now() + (opts.totalBudgetMs ?? 150_000);
  let lastError: GeminiError = new GeminiError("unknown", "Erreur inconnue du service AI.", 500);

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i]!;
    // Don't hand a model a doomed few-second slot — bail if too little is left.
    if (deadline - Date.now() < 18_000) {
      console.error(`[gemini] chain budget exhausted before "${model}"`);
      throw lastError;
    }
    try {
      return await callModelOnce(model, opts, deadline);
    } catch (e) {
      const err = e instanceof GeminiError ? e : new GeminiError("unknown", String(e), 500);
      // Keep the most actionable error to surface if the whole chain fails.
      if (err.code === "quota_free_tier" || lastError.code !== "quota_free_tier") lastError = err;
      if (!FALLBACK_CODES.has(err.code) || i === chain.length - 1) throw lastError;
      console.error(
        `[gemini] "${model}" failed (${err.code}: ${err.message}) → next model "${chain[i + 1]}"`,
      );
    }
  }
  throw lastError;
}

async function callModelOnce(
  model: string,
  opts: CallOpts,
  deadline = Date.now() + 150_000,
): Promise<string> {
  const key = apiKey();
  const url = `${BASE}/models/${model}:generateContent`;
  const timeoutMs = opts.timeoutMs ?? 70_000;

  // Some models reject `thinkingConfig`; if that happens we drop it, remember
  // it for the whole isolate, and retry the same model once.
  let includeThinking = !!opts.noThinking && !THINKING_CONFIG_UNSUPPORTED;
  const buildPayload = () => {
    const generationConfig: Record<string, unknown> = {
      temperature: opts.temperature ?? 0.4,
      ...(opts.schema ? { responseMimeType: "application/json", responseSchema: opts.schema } : {}),
      ...(includeThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    };
    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: opts.parts }],
      generationConfig,
    };
    if (opts.system) body["systemInstruction"] = { parts: [{ text: opts.system }] };
    return JSON.stringify(body);
  };

  const maxAttempts = (opts.retries ?? 1) + 1;
  let lastError: GeminiError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (Date.now() > deadline) {
      throw lastError ?? new GeminiError("timeout", "Délai dépassé pour le service AI.", 504);
    }
    const payload = buildPayload();
    const controller = new AbortController();
    const budgetLeft = Math.max(1_000, deadline - Date.now());
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, budgetLeft));
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Works for every API key format (AIza… and the newer AQ.… keys).
          // `Authorization: Bearer` is only for OAuth2 access tokens, not API keys.
          "x-goog-api-key": key,
        },
        body: payload,
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const aborted = controller.signal.aborted || (e instanceof Error && e.name === "AbortError");
      if (aborted) {
        // Model is too slow — don't retry it, let the chain try the next one.
        throw new GeminiError(
          "timeout",
          `Le modèle Gemini "${model}" n'a pas répondu à temps.`,
          504,
        );
      }
      lastError = new GeminiError("network", "Service AI temporairement indisponible.", 503);
      await sleep(800 * (attempt + 1));
      continue;
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) {
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      };
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text.trim()) throw new GeminiError("empty", "Réponse AI vide ou invalide.", 502);
      return text;
    }

    const raw = await res.text();
    if (res.status === 429) {
      console.error(`[gemini] 429 (model=${model}): ${raw.slice(0, 500)}`);
      // Free-tier daily cap (e.g. 20 req/day on gemini-3.6-flash) — retrying is
      // pointless, tell the user to enable billing on the key.
      const dailyCap =
        /PerDay|free[_ ]?tier|RESOURCE_EXHAUSTED.*day|RequestsPerDay|quota metric.*day|exceeded your current quota/i.test(
          raw,
        );
      if (dailyCap) {
        throw new GeminiError(
          "quota_free_tier",
          "Quota gratuit de l'API Gemini épuisé pour aujourd'hui. Active la facturation sur la clé (aistudio.google.com/apikey → Set up billing).",
          429,
        );
      }
      const retryMs = parseRetryDelay(raw);
      if (retryMs !== null && retryMs <= 12_000 && attempt < maxAttempts - 1) {
        lastError = new GeminiError(
          "rate_limit",
          "Limite de l'API Gemini atteinte. Réessaie plus tard.",
          429,
        );
        await sleep(retryMs + 250);
        continue;
      }
      throw new GeminiError(
        "rate_limit",
        "Limite de l'API Gemini atteinte. Réessaie dans une minute.",
        429,
      );
    }
    if (res.status >= 500) {
      console.error(`[gemini] ${res.status} (model=${model}): ${raw.slice(0, 300)}`);
      lastError = new GeminiError(
        "upstream",
        "Le service AI Gemini est surchargé. Réessaie dans un instant.",
        503,
      );
      await sleep(1500 * (attempt + 1));
      continue;
    }
    // Google geo-blocks the Cloudflare egress IP. Every model fails identically,
    // so stop immediately and tell the user how to fix it (AI Gateway).
    if (/User location is not supported|FAILED_PRECONDITION/i.test(raw)) {
      console.error(`[gemini] geo-blocked (model=${model}): ${raw.slice(0, 300)}`);
      throw new GeminiError(
        "geo_blocked",
        "L'API Gemini refuse la localisation du serveur (passe par un Cloudflare AI Gateway — voir GEMINI_API_BASE).",
        403,
      );
    }
    // Any other 400 while we're sending `thinkingConfig`: Google often just says
    // "Request contains an invalid argument" with no detail, so assume it's the
    // thinking config, drop it, and retry the same model once.
    if (res.status === 400 && includeThinking) {
      console.error(
        `[gemini] "${model}" 400 with thinkingConfig (${raw.slice(0, 200)}) → retry without it`,
      );
      includeThinking = false;
      THINKING_CONFIG_UNSUPPORTED = true;
      attempt--; // this doesn't count as a real attempt
      continue;
    }
    if (res.status === 400 && /too large|exceeds|token/i.test(raw)) {
      throw new GeminiError("too_long", "Le contenu est trop volumineux pour être analysé.", 400);
    }
    // Model retired / not available for this key (e.g. gemini-2.5-flash
    // "no longer available to new users") — let the chain try the next model.
    if (res.status === 404) {
      console.error(`[gemini] 404 model "${model}": ${raw.slice(0, 300)}`);
      throw new GeminiError("model_unavailable", `Modèle Gemini "${model}" indisponible.`, 404);
    }
    // Google returns 400 API_KEY_INVALID for a malformed key, 403 for a disabled
    // API / key restriction. Log the upstream reason (never contains the key) so
    // `wrangler tail` can pinpoint it, then surface a clear message.
    const isKeyInvalid =
      res.status === 400 && /api[_ ]?key[_ ]?(not valid|invalid)|API_KEY_INVALID/i.test(raw);
    if (res.status === 401 || res.status === 403 || isKeyInvalid) {
      console.error(`[gemini] auth failure ${res.status} (model=${model}): ${raw.slice(0, 500)}`);
      const disabled = /SERVICE_DISABLED|has not been used|is disabled/i.test(raw);
      throw new GeminiError(
        "auth",
        disabled
          ? "L'API Gemini n'est pas activée pour ce projet Google Cloud."
          : "Clé Gemini invalide ou non autorisée.",
        401,
      );
    }
    console.error(`[gemini] api error ${res.status} (model=${model}): ${raw.slice(0, 500)}`);
    // A leftover 400 is usually model-specific (unsupported arg / schema quirk)
    // — let the chain try the next model rather than hard-failing the analysis.
    if (res.status === 400) {
      throw new GeminiError("model_unavailable", `Requête refusée par "${model}".`, 400);
    }
    throw new GeminiError(
      "api_error",
      `Erreur Gemini (${res.status}): ${raw.slice(0, 300)}`,
      res.status,
    );
  }

  throw lastError ?? new GeminiError("unknown", "Erreur inconnue du service AI.", 500);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Pull the `retryDelay` (e.g. "23s" / "1.5s") out of a Gemini 429 body. */
function parseRetryDelay(raw: string): number | null {
  const m = raw.match(/"retryDelay"\s*:\s*"?(\d+(?:\.\d+)?)s"?/i);
  return m ? Math.ceil(parseFloat(m[1]!) * 1000) : null;
}

function parseJson<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        /* fallthrough */
      }
    }
    throw new GeminiError("invalid_json", "La réponse de l'IA n'a pas pu être lue.", 502);
  }
}

export type DetailLevel = "quick" | "standard" | "detailed" | "exam";

export interface StudyNoteContent {
  title: string;
  summary: string;
  keyPoints: string[];
  concepts: { term: string; definition: string }[];
  mustKnow: string[];
  facts: string[];
  examples: string[];
  examTopics: string[];
  simpleExplanation: string;
  potentialQuestions: string[];
  outline: string[];
}

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

const LANG_NAMES: Record<string, string> = {
  fr: "français",
  en: "English",
  lo: "ພາສາລາວ (Lao)",
  th: "ภาษาไทย (Thai)",
  same: "the same language as the source content",
};

function languageInstruction(outputLanguage: string) {
  return `Write the entire output in ${LANG_NAMES[outputLanguage] ?? LANG_NAMES["same"]}.`;
}

function detailInstruction(level: DetailLevel) {
  switch (level) {
    case "quick":
      return "Be concise: short summary, only the most essential elements.";
    case "detailed":
      return "Be thorough and detailed, cover every part of the content.";
    case "exam":
      return "Exam preparation mode: prioritise essential concepts, definitions, dates, formulas, mechanisms, relations between concepts, likely exam questions, traps and common mistakes.";
    default:
      return "Balanced level of detail, clear and structured for a student.";
  }
}

const STUDY_SYSTEM =
  "You are an expert academic assistant that turns course material into high quality study notes for students. Never invent facts that are not supported by the source material. Always answer with valid JSON matching the requested schema.";

// Transcription / OCR is a separate, client-driven pipeline step and must fit
// inside ONE mobile HTTP request: thinking OFF, one shot per model, ~85s per
// attempt, ~130s for the whole chain. Structuring happens later in
// `generateStudyNotes`, so these calls only need raw text back.
const MULTIMODAL_OPTS = {
  models: MODELS.multimodal as string[],
  retries: 0,
  noThinking: true,
  timeoutMs: 95_000,
  totalBudgetMs: 150_000,
  temperature: 0.2,
} satisfies Partial<CallOpts>;

export const geminiService = {
  async summarizeContent(text: string, outputLanguage: string) {
    return callGemini({
      parts: [
        {
          text: `Summarize the following course content.\n${languageInstruction(outputLanguage)}\n\n${text}`,
        },
      ],
      system: STUDY_SYSTEM,
    });
  },

  async generateStudyNotes(input: {
    content: string;
    detailLevel: DetailLevel;
    outputLanguage: string;
  }): Promise<StudyNoteContent> {
    const raw = await callGemini({
      system: STUDY_SYSTEM,
      schema: noteSchema,
      timeoutMs: 110_000,
      totalBudgetMs: 150_000,
      parts: [
        {
          text: `Create a complete study sheet from the course content below.
${detailInstruction(input.detailLevel)}
${languageInstruction(input.outputLanguage)}
Only use information present in the content.

--- COURSE CONTENT ---
${input.content.slice(0, 200_000)}`,
        },
      ],
    });
    return parseJson<StudyNoteContent>(raw);
  },

  /** Transcription only — note generation is a separate pipeline step. */
  async transcribeVideo(input: { url: string }): Promise<string> {
    return callGemini({
      ...MULTIMODAL_OPTS,
      parts: [
        { fileData: { fileUri: input.url } },
        {
          text: "Transcribe this video verbatim. Prefix each paragraph with its timestamp [mm:ss]. Plain text only, original spoken language.",
        },
      ],
    });
  },

  async transcribeAudio(input: { base64: string; mimeType: string }): Promise<string> {
    return callGemini({
      ...MULTIMODAL_OPTS,
      parts: [
        { inlineData: { mimeType: input.mimeType, data: input.base64 } },
        {
          text: "Transcribe this lecture recording verbatim. Prefix each paragraph with its timestamp [mm:ss]. Plain text only, original spoken language.",
        },
      ],
    });
  },

  async analyzeImage(input: { base64: string; mimeType: string; outputLanguage: string }) {
    return callGemini({
      ...MULTIMODAL_OPTS,
      parts: [
        { inlineData: { mimeType: input.mimeType, data: input.base64 } },
        {
          text: "Extract ALL text from this document / photo of notes, in reading order. Keep headings, lists and tables as plain markdown. Transcribe formulas as written. Output the extracted content only, no commentary.",
        },
      ],
    });
  },

  async generateFlashcards(input: {
    content: string;
    count: number;
    outputLanguage: string;
  }): Promise<{ front: string; back: string }[]> {
    const raw = await callGemini({
      system: STUDY_SYSTEM,
      schema: {
        type: "object",
        properties: {
          cards: {
            type: "array",
            items: {
              type: "object",
              properties: { front: { type: "string" }, back: { type: "string" } },
              required: ["front", "back"],
            },
          },
        },
        required: ["cards"],
      },
      parts: [
        {
          text: `Create ${input.count} flashcards from the course content below. Front = a precise question, back = a clear, short answer. ${languageInstruction(input.outputLanguage)}\n\n${input.content}`,
        },
      ],
    });
    return parseJson<{ cards: { front: string; back: string }[] }>(raw).cards;
  },

  async generateQuiz(input: { content: string; count: number; outputLanguage: string }): Promise<
    {
      type: "mcq" | "truefalse" | "short";
      question: string;
      options: string[];
      correctAnswer: string;
      explanation: string;
    }[]
  > {
    const raw = await callGemini({
      system: STUDY_SYSTEM,
      schema: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["mcq", "truefalse", "short"] },
                question: { type: "string" },
                options: { type: "array", items: { type: "string" } },
                correctAnswer: { type: "string" },
                explanation: { type: "string" },
              },
              required: ["type", "question", "options", "correctAnswer", "explanation"],
            },
          },
        },
        required: ["questions"],
      },
      parts: [
        {
          text: `Create a quiz of exactly ${input.count} questions from the course content below.
Mix multiple-choice (4 options, correctAnswer must be exactly one of the options), true/false (options: ["true","false"]) and short answer (options: []).
Add a short explanation for every answer. ${languageInstruction(input.outputLanguage)}

${input.content}`,
        },
      ],
    });
    return parseJson<{ questions: never[] }>(raw).questions;
  },

  async answerQuestion(input: {
    context: string;
    history: { role: string; content: string }[];
    question: string;
    outputLanguage: string;
  }): Promise<string> {
    const history = input.history
      .slice(-8)
      .map((m) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.content}`)
      .join("\n");
    return callGemini({
      system: `You are a personal study tutor. Answer using ONLY the student's course material given as context.
If the answer is not in the material, start your answer with "⚠️" and say clearly that the information does not seem to be in their course, then you may give a short general explanation while stating it comes from outside knowledge.
Be pedagogical, structured and concise. ${languageInstruction(input.outputLanguage)}`,
      parts: [
        {
          text: `--- COURSE MATERIAL ---
${input.context.slice(0, 300000)}

--- CONVERSATION ---
${history}

Student question: ${input.question}`,
        },
      ],
    });
  },
};
