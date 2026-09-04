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

export const startYouTube = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        spaceId: z.string().uuid(),
        url: z.string().min(5),
        detailLevel: detail,
        outputLanguage: lang,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { startYouTubeAnalysis } = await import("./pipeline.server");
    return startYouTubeAnalysis(context.supabase, context.userId, data);
  });

export const startText = createServerFn({ method: "POST" })
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
    const { startTextAnalysis } = await import("./pipeline.server");
    return startTextAnalysis(context.supabase, context.userId, data);
  });

export const startMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        spaceId: z.string().uuid(),
        title: z.string().min(1).max(200),
        kind: z.enum(["audio", "recording", "image", "pdf"]),
        mimeType: z.string().min(3),
        durationSeconds: z.number().int().min(0).max(36000).optional(),
        detailLevel: detail,
        outputLanguage: lang,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { startMediaAnalysis } = await import("./pipeline.server");
    return startMediaAnalysis(context.supabase, context.userId, data);
  });

export const advanceAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sourceId: z.string().uuid(),
        outputLanguage: lang,
        base64: z.string().min(100).optional(),
        mimeType: z.string().min(3).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { advanceAnalysis: advance } = await import("./pipeline.server");
    return advance(context.supabase, context.userId, data);
  });

export const retrySource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sourceId: z.string().uuid(), outputLanguage: lang }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { retryAnalysis } = await import("./pipeline.server");
    return retryAnalysis(context.supabase, context.userId, data);
  });

export const askSpace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        spaceId: z.string().uuid(),
        question: z.string().min(1).max(2000),
        outputLanguage: lang,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { runChat } = await import("./pipeline.server");
    return runChat(context.supabase, context.userId, data);
  });

export const createFlashcards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        spaceId: z.string().uuid(),
        count: z.number().int().min(5).max(40),
        outputLanguage: lang,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { runFlashcards } = await import("./pipeline.server");
    return runFlashcards(context.supabase, context.userId, data);
  });

export const createQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        spaceId: z.string().uuid(),
        count: z.number().int().min(5).max(20),
        outputLanguage: lang,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { runQuiz } = await import("./pipeline.server");
    return runQuiz(context.supabase, context.userId, data);
  });
