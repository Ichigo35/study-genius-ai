/**
 * geminiService — accès serveur uniquement à l'API Gemini.
 * La clé n'est jamais exposée au client.
 */

// gemini-2.5-flash is no longer available to new API keys; 3.6-flash is the
// current recommended migration target (handles text + PDF/image/audio).
const MODELS = {
  text: process.env["GEMINI_MODEL_TEXT"] ?? "gemini-3.6-flash",
  multimodal: process.env["GEMINI_MODEL_MULTIMODAL"] ?? "gemini-3.6-flash",
} as const;

const BASE = "https://generativelanguage.googleapis.com/v1beta";

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
  const key = raw?.trim().replace(/^["']|["']$/g, "").trim();
  if (!key) throw new GeminiError("no_key", "GEMINI_API_KEY manquante côté serveur", 500);
  return key;
}

async function callGemini(opts: {
  model?: string;
  parts: Part[];
  system?: string;
  schema?: unknown;
  temperature?: number;
  retries?: number;
}): Promise<string> {
  const key = apiKey();
  const model = opts.model ?? MODELS.text;
  const url = `${BASE}/models/${model}:generateContent`;

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: opts.parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      ...(opts.schema
        ? { responseMimeType: "application/json", responseSchema: opts.schema }
        : {}),
    },
  };
  if (opts.system) body["systemInstruction"] = { parts: [{ text: opts.system }] };

  const maxAttempts = (opts.retries ?? 2) + 1;
  let lastError: GeminiError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
        body: JSON.stringify(body),
      });
    } catch {
      lastError = new GeminiError("network", "Service AI temporairement indisponible.", 503);
      await sleep(800 * (attempt + 1));
      continue;
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
      const dailyCap = /PerDay|free_tier|RESOURCE_EXHAUSTED.*day|GenerateRequestsPerDay/i.test(raw);
      if (dailyCap) {
        throw new GeminiError(
          "quota_free_tier",
          "Quota gratuit de l'API Gemini épuisé pour aujourd'hui. Active la facturation sur la clé (aistudio.google.com/apikey → Set up billing).",
          429,
        );
      }
      const retryMs = parseRetryDelay(raw);
      if (retryMs !== null && retryMs <= 12_000 && attempt < maxAttempts - 1) {
        lastError = new GeminiError("rate_limit", "Limite de l'API Gemini atteinte. Réessaie plus tard.", 429);
        await sleep(retryMs + 250);
        continue;
      }
      throw new GeminiError("rate_limit", "Limite de l'API Gemini atteinte. Réessaie dans une minute.", 429);
    }
    if (res.status >= 500) {
      console.error(`[gemini] ${res.status} (model=${model}): ${raw.slice(0, 300)}`);
      lastError = new GeminiError("upstream", "Le service AI Gemini est surchargé. Réessaie dans un instant.", 503);
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (res.status === 400 && /too large|exceeds|token/i.test(raw)) {
      throw new GeminiError("too_long", "Le contenu est trop volumineux pour être analysé.", 400);
    }
    // Google returns 400 API_KEY_INVALID for a malformed key, 403 for a disabled
    // API / key restriction. Log the upstream reason (never contains the key) so
    // `wrangler tail` can pinpoint it, then surface a clear message.
    const isKeyInvalid = res.status === 400 && /api[_ ]?key[_ ]?(not valid|invalid)|API_KEY_INVALID/i.test(raw);
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
    throw new GeminiError("api_error", `Erreur Gemini (${res.status}): ${raw.slice(0, 300)}`, res.status);
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

export const geminiService = {
  async summarizeContent(text: string, outputLanguage: string) {
    return callGemini({
      parts: [{ text: `Summarize the following course content.\n${languageInstruction(outputLanguage)}\n\n${text}` }],
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
      parts: [
        {
          text: `Create a complete study sheet from the course content below.
${detailInstruction(input.detailLevel)}
${languageInstruction(input.outputLanguage)}
Only use information present in the content.

--- COURSE CONTENT ---
${input.content}`,
        },
      ],
    });
    return parseJson<StudyNoteContent>(raw);
  },

  async analyzeVideo(input: {
    url: string;
    detailLevel: DetailLevel;
    outputLanguage: string;
  }): Promise<{ transcript: string; notes: StudyNoteContent }> {
    const transcript = await callGemini({
      model: MODELS.multimodal,
      parts: [
        { fileData: { fileUri: input.url } },
        {
          text: "Transcribe this video as accurately as possible. Prefix each paragraph with its timestamp in the format [mm:ss]. Output plain text only, in the original spoken language.",
        },
      ],
      temperature: 0.2,
    });
    const notes = await this.generateStudyNotes({
      content: transcript,
      detailLevel: input.detailLevel,
      outputLanguage: input.outputLanguage,
    });
    return { transcript, notes };
  },

  async transcribeAudio(input: { base64: string; mimeType: string }): Promise<string> {
    return callGemini({
      model: MODELS.multimodal,
      temperature: 0.2,
      parts: [
        { inlineData: { mimeType: input.mimeType, data: input.base64 } },
        {
          text: "Transcribe this audio recording of a lecture as accurately as possible. Prefix each paragraph with its timestamp in the format [mm:ss]. Output plain text only, in the original spoken language.",
        },
      ],
    });
  },

  async analyzeImage(input: { base64: string; mimeType: string; outputLanguage: string }) {
    return callGemini({
      model: MODELS.multimodal,
      parts: [
        { inlineData: { mimeType: input.mimeType, data: input.base64 } },
        {
          text: `Read this document or picture of student notes / whiteboard / slides. Extract all text, tables, diagrams, formulas and turn it into clean structured markdown notes. ${languageInstruction(input.outputLanguage)}`,
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

  async generateQuiz(input: {
    content: string;
    count: number;
    outputLanguage: string;
  }): Promise<
    { type: "mcq" | "truefalse" | "short"; question: string; options: string[]; correctAnswer: string; explanation: string }[]
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
