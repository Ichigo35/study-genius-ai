import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";
import { startMedia, startText } from "@/lib/ai.functions";
import { sleep } from "@/lib/analysisDrive";
import { MAX_UPLOAD_BYTES } from "@/lib/spaces";
import {
  AnalysisProgress,
  SpaceAndDetailPicker,
  useComposerState,
} from "@/components/SourceComposer";
import { Button } from "@/components/ui/button";

type Kind = "audio" | "recording" | "image" | "pdf";

const UPLOAD_BUCKET = "study-uploads";

async function uploadWithRetry(path: string, file: Blob, contentType: string) {
  let lastErr: unknown;
  for (let i = 0; i < 4; i++) {
    const { error } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .upload(path, file, { contentType, upsert: true });
    if (!error) return;
    lastErr = error;
    await sleep(1500 * (i + 1));
  }
  throw lastErr;
}

export function useMediaAnalyzer() {
  const { t } = useI18n();
  const state = useComposerState();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runStartMedia = useServerFn(startMedia);
  const runStartText = useServerFn(startText);
  // null = idle, otherwise a coarse progress key.
  const [stage, setStage] = useState<string | null>(null);

  async function analyze(payload: {
    file: Blob;
    fileName: string;
    kind: Kind;
    mimeType: string;
    durationSeconds?: number;
  }) {
    if (!state.spaceId) {
      toast.error(t("home.noSpaces"));
      return;
    }
    if (payload.file.size > MAX_UPLOAD_BYTES) {
      toast.error(t("error.tooLarge"));
      return;
    }

    const isPlainText = payload.mimeType.startsWith("text/");
    setStage(isPlainText ? "notes_pending" : "transcript_pending");

    try {
      const start = isPlainText
        ? await runStartText({
            data: {
              spaceId: state.spaceId,
              title: payload.fileName,
              text: await (payload.file as Blob).text(),
              detailLevel: state.detailLevel,
              outputLanguage: state.outputLanguage,
            },
          })
        : await runStartMedia({
            data: {
              spaceId: state.spaceId,
              title: payload.fileName,
              kind: payload.kind,
              mimeType: payload.mimeType,
              durationSeconds: payload.durationSeconds,
              detailLevel: state.detailLevel,
              outputLanguage: state.outputLanguage,
            },
          });

      if (!start.ok) {
        toast.error(start.error?.message ?? t("error.generic"));
        setStage(null);
        return;
      }

      const sourceId = start.sourceId;

      if (!isPlainText) {
        // Upload once to Storage; the server pulls it from there for
        // transcription. Keeps this screen off the hook for the slow part.
        const { data: sess } = await supabase.auth.getSession();
        const userId = sess.session?.user?.id;
        if (!userId) throw new Error(t("error.generic"));
        await uploadWithRetry(
          `${userId}/${sourceId}`,
          payload.file,
          payload.mimeType || "application/octet-stream",
        );
      }

      // The source page shows real progress, polls `sources.status`, and its
      // driver kicks off the (background) transcription + notes steps.
      queryClient.invalidateQueries();
      navigate({ to: "/sources/$sourceId", params: { sourceId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error.generic"));
      setStage(null);
    }
  }

  return { state, stage, analyze };
}

export function AnalyzerShell({
  analyzer,
  children,
  onSubmit,
  disabled,
  submitLabel,
}: {
  analyzer: ReturnType<typeof useMediaAnalyzer>;
  children: React.ReactNode;
  onSubmit: () => void;
  disabled: boolean;
  submitLabel: string;
}) {
  if (analyzer.stage !== null) {
    return (
      <main className="px-5">
        <AnalysisProgress stage={analyzer.stage} />
      </main>
    );
  }
  return (
    <main className="space-y-5 px-5">
      {children}
      <SpaceAndDetailPicker state={analyzer.state} />
      <Button className="h-12 w-full rounded-xl text-base" disabled={disabled} onClick={onSubmit}>
        {submitLabel}
      </Button>
    </main>
  );
}
