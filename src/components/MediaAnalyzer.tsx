import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { advanceAnalysis, startMedia, startText } from "@/lib/ai.functions";
import { driveAnalysis } from "@/lib/analysisDrive";
import { fileToBase64, MAX_UPLOAD_BYTES } from "@/lib/spaces";
import {
  AnalysisProgress,
  SpaceAndDetailPicker,
  useComposerState,
} from "@/components/SourceComposer";
import { Button } from "@/components/ui/button";

type Kind = "audio" | "recording" | "image" | "pdf";

export function useMediaAnalyzer() {
  const { t } = useI18n();
  const state = useComposerState();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runStartMedia = useServerFn(startMedia);
  const runStartText = useServerFn(startText);
  const runAdvance = useServerFn(advanceAnalysis);
  // null = idle, otherwise the current server `progress_step`.
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
      const fileParts = isPlainText
        ? undefined
        : { base64: await fileToBase64(payload.file), mimeType: payload.mimeType };

      const outcome = await driveAnalysis({
        advance: runAdvance,
        sourceId,
        outputLanguage: state.outputLanguage,
        getFileParts: fileParts ? () => fileParts : undefined,
        onStep: (step) => setStage(step),
      });

      if (outcome.status === "failed") {
        toast.error(outcome.error?.message ?? t("error.generic"));
      }
      // Whatever the outcome, the source page shows the result / a retry button
      // and keeps driving an unfinished run.
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
