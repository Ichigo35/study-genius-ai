/**
 * Client-side driver for the stepped analysis pipeline (see
 * `pipeline.server.ts`). Calls `advanceAnalysis` in a loop — each call does one
 * Gemini step server-side — until the source is `completed` / `failed`, or the
 * iteration budget runs out (the source page keeps driving after that).
 */

type AdvanceArgs = {
  data: {
    sourceId: string;
    outputLanguage: string;
    base64?: string | undefined;
    mimeType?: string | undefined;
  };
};

type AdvanceResponse =
  | {
      ok: true;
      status: "processing" | "completed" | "failed";
      step: string;
      error?: { code: string; message: string } | undefined;
    }
  | { ok: false; error?: { code: string; message: string } | undefined };

type AdvanceFn = (args: AdvanceArgs) => Promise<AdvanceResponse>;

export type DriveOutcome = {
  status: "processing" | "completed" | "failed";
  step: string;
  error?: { code: string; message: string } | undefined;
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Maps a server `progress_step` to an index in the 5-item progress step list. */
const STAGE_INDEX: Record<string, number> = {
  "": 0,
  transcript_pending: 1,
  transcript_running: 1,
  notes_pending: 3,
  notes_running: 3,
  done: 5,
};

export function stageToIndex(stage: string) {
  return STAGE_INDEX[stage] ?? 0;
}

export async function driveAnalysis(opts: {
  advance: AdvanceFn;
  sourceId: string;
  outputLanguage: string;
  /** Supplies the upload for the transcription step (media sources only). */
  getFileParts?: (() => { base64: string; mimeType: string } | undefined) | undefined;
  onStep?: ((step: string, status: "processing" | "completed" | "failed") => void) | undefined;
  maxIterations?: number | undefined;
}): Promise<DriveOutcome> {
  const max = opts.maxIterations ?? 20;
  let step = "";

  for (let i = 0; i < max; i++) {
    const parts = opts.getFileParts?.();
    const sendFile = parts && (step === "" || step.startsWith("transcript"));

    let r: AdvanceResponse;
    try {
      r = await opts.advance({
        data: {
          sourceId: opts.sourceId,
          outputLanguage: opts.outputLanguage,
          ...(sendFile ? { base64: parts!.base64, mimeType: parts!.mimeType } : {}),
        },
      });
    } catch {
      // Transient network / edge hiccup — the server step keeps its claim, so
      // just wait and ask again.
      await sleep(2500);
      continue;
    }

    if (!r.ok) {
      return { status: "failed", step: step || "failed", ...(r.error ? { error: r.error } : {}) };
    }

    step = r.step;
    opts.onStep?.(r.step, r.status);
    if (r.status === "completed" || r.status === "failed") {
      return { status: r.status, step: r.step, ...(r.error ? { error: r.error } : {}) };
    }
    // `*_running` means another driver holds the claim — back off harder.
    await sleep(step.endsWith("_running") ? 3000 : 500);
  }

  return { status: "processing", step: step || "notes_pending" };
}
