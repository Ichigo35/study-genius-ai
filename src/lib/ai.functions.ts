import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const detail = z.enum(["quick", "standard", "detailed", "exam"]);
const lang = z.string().min(2).max(8);

export const getUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getUsageSnapshot } = await import("./study.server");
    return getUsageSnapshot(context.supabase, context.userId);
  });

export const analyzeYouTube = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ spaceId: z.string().uuid(), url: z.string().min(5), detailLevel: detail, outputLanguage: lang })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { runYouTubeAnalysis } = await import("./pipeline.server");
    return runYouTubeAnalysis(context.supabase, context.userId, data);
  });

export const analyzeText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        spaceId: z.string().uuid(),
        title: z.string().min(1).max(200),
        text: z.string().min(30),
        detailLevel: detail,
        outputLanguage: lang,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { runTextAnalysis } = await import("./pipeline.server");
    return runTextAnalysis(context.supabase, context.userId, data);
  });

export const analyzeMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        spaceId: z.string().uuid(),
        title: z.string().min(1).max(200),
        kind: z.enum(["audio", "recording", "image", "pdf"]),
        mimeType: z.string().min(3),
        base64: z.string().min(100),
        durationSeconds: z.number().int().min(0).max(36000).optional(),
        detailLevel: detail,
        outputLanguage: lang,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { runMediaAnalysis } = await import("./pipeline.server");
    return runMediaAnalysis(context.supabase, context.userId, data);
  });

export const askSpace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ spaceId: z.string().uuid(), question: z.string().min(1).max(2000), outputLanguage: lang }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { runChat } = await import("./pipeline.server");
    return runChat(context.supabase, context.userId, data);
  });

export const createFlashcards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ spaceId: z.string().uuid(), count: z.number().int().min(5).max(40), outputLanguage: lang }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { runFlashcards } = await import("./pipeline.server");
    return runFlashcards(context.supabase, context.userId, data);
  });

export const createQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ spaceId: z.string().uuid(), count: z.number().int().min(5).max(20), outputLanguage: lang }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { runQuiz } = await import("./pipeline.server");
    return runQuiz(context.supabase, context.userId, data);
  });
