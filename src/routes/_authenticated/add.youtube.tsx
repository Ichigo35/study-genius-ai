import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Info, Loader2, Youtube } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { PageHeader } from "@/components/PageHeader";
import { AnalysisProgress, SpaceAndDetailPicker, useComposerState } from "@/components/SourceComposer";
import { analyzeYouTube } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/add/youtube")({
  head: () => ({
    meta: [
      { title: "YouTube → fiche de synthèse — StudyLoop" },
      { name: "description", content: "Colle un lien YouTube et obtiens transcription, résumé, flashcards et quiz." },
      { property: "og:title", content: "YouTube → fiche de synthèse" },
      { property: "og:description", content: "Transforme n'importe quelle vidéo de cours en fiche de révision." },
    ],
  }),
  component: YoutubePage,
});

function YoutubePage() {
  const { t } = useI18n();
  const state = useComposerState();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const run = useServerFn(analyzeYouTube);
  const [url, setUrl] = useState("");
  const [step, setStep] = useState(-1);

  async function analyze() {
    if (!state.spaceId) {
      toast.error(t("home.noSpaces"));
      return;
    }
    setStep(1);
    const ticker = setInterval(() => setStep((s) => (s < 4 ? s + 1 : s)), 9000);
    try {
      const result = await run({
        data: {
          spaceId: state.spaceId,
          url,
          detailLevel: state.detailLevel,
          outputLanguage: state.outputLanguage,
        },
      });
      if (!result.ok) {
        toast.error(result.error?.message ?? t("error.video"));
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

  return (
    <>
      <PageHeader title={t("youtube.title")} />
      <main className="space-y-5 px-5">
        {step >= 0 ? (
          <AnalysisProgress step={step} />
        ) : (
          <>
            <div className="card-soft space-y-3 p-4">
              <div className="flex items-center gap-2 text-destructive">
                <Youtube className="size-5" />
                <span className="text-sm font-semibold">{t("action.youtube")}</span>
              </div>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                inputMode="url"
                placeholder={t("youtube.placeholder")}
                className="h-12 rounded-xl"
              />
              <p className="flex gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" />
                {t("youtube.notice")}
              </p>
            </div>

            <SpaceAndDetailPicker state={state} />

            <Button
              className="h-12 w-full rounded-xl text-base"
              disabled={url.trim().length < 8}
              onClick={analyze}
            >
              {t("youtube.analyze")}
            </Button>
            {state.spaces.isLoading && <Loader2 className="mx-auto size-4 animate-spin" />}
          </>
        )}
      </main>
    </>
  );
}
