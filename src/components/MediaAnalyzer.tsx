import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { analyzeMedia, analyzeText } from "@/lib/ai.functions";
import { fileToBase64, MAX_UPLOAD_BYTES } from "@/lib/spaces";
import { AnalysisProgress, SpaceAndDetailPicker, useComposerState } from "@/components/SourceComposer";
import { Button } from "@/components/ui/button";

type Kind = "audio" | "recording" | "image" | "pdf";

export function useMediaAnalyzer() {
  const { t } = useI18n();
  const state = useComposerState();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runMedia = useServerFn(analyzeMedia);
  const runText = useServerFn(analyzeText);
  const [step, setStep] = useState(-1);

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
    setStep(0);
    const ticker = setInterval(() => setStep((s) => (s < 4 ? s + 1 : s)), 9000);
    try {
      const isPlainText = payload.mimeType.startsWith("text/");
      const result = isPlainText
        ? await runText({
            data: {
              spaceId: state.spaceId,
              title: payload.fileName,
              text: await (payload.file as Blob).text(),
              detailLevel: state.detailLevel,
              outputLanguage: state.outputLanguage,
            },
          })
        : await runMedia({
            data: {
              spaceId: state.spaceId,
              title: payload.fileName,
              kind: payload.kind,
              mimeType: payload.mimeType,
              base64: await fileToBase64(payload.file),
              durationSeconds: payload.durationSeconds,
              detailLevel: state.detailLevel,
              outputLanguage: state.outputLanguage,
            },
          });

      if (!result.ok) {
        toast.error(result.error?.message ?? t("error.generic"));
        setStep(-1);
        return;
      }
      queryClient.invalidateQueries();
      navigate({ to: "/sources/$sourceId", params: { sourceId: result.sourceId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error.generic"));
      setStep(-1);
    } finally {
      clearInterval(ticker);
    }
  }

  return { state, step, analyze };
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
  if (analyzer.step >= 0) {
    return (
      <main className="px-5">
        <AnalysisProgress step={analyzer.step} />
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
