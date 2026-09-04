import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { PageHeader } from "@/components/PageHeader";
import {
  AnalysisProgress,
  SpaceAndDetailPicker,
  useComposerState,
} from "@/components/SourceComposer";
import { startText } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/add/text")({
  head: () => ({
    meta: [
      { title: "Coller du texte — StudyLoop" },
      {
        name: "description",
        content: "Colle tes notes ou un chapitre de cours et obtiens une fiche de synthèse.",
      },
      { property: "og:title", content: "Coller du texte — StudyLoop" },
      {
        property: "og:description",
        content: "Ton texte devient une fiche structurée en quelques secondes.",
      },
    ],
  }),
  component: TextPage,
});

function TextPage() {
  const { t } = useI18n();
  const state = useComposerState();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runStart = useServerFn(startText);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [stage, setStage] = useState<string | null>(null);

  async function analyze() {
    if (!state.spaceId) {
      toast.error(t("home.noSpaces"));
      return;
    }
    setStage("notes_pending");
    try {
      const start = await runStart({
        data: {
          spaceId: state.spaceId,
          title: title.trim() || text.slice(0, 40),
          text,
          detailLevel: state.detailLevel,
          outputLanguage: state.outputLanguage,
        },
      });
      if (!start.ok) {
        toast.error(start.error?.message ?? t("error.generic"));
        setStage(null);
        return;
      }
      queryClient.invalidateQueries();
      navigate({ to: "/sources/$sourceId", params: { sourceId: start.sourceId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error.generic"));
      setStage(null);
    }
  }

  return (
    <>
      <PageHeader title={t("text.title")} />
      <main className="space-y-5 px-5">
        {stage !== null ? (
          <AnalysisProgress stage={stage} />
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">{t("text.docTitle")}</Label>
              <Input
                id="doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-12 rounded-xl"
              />
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("text.placeholder")}
              className="min-h-52 rounded-2xl"
            />
            <SpaceAndDetailPicker state={state} />
            <Button
              className="h-12 w-full rounded-xl text-base"
              disabled={text.trim().length < 30}
              onClick={analyze}
            >
              {t("text.analyze")}
            </Button>
          </>
        )}
      </main>
    </>
  );
}
