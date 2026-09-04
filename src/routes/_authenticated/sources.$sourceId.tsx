import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Languages, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";
import { useSettings } from "@/hooks/useSettings";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { NoteView, type NoteContent } from "@/components/NoteView";
import { AnalysisProgress } from "@/components/SourceComposer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { advanceAnalysis, retrySource, translateContent } from "@/lib/ai.functions";
import { driveAnalysis } from "@/lib/analysisDrive";
import { deleteSource, reclaimStaleSources } from "@/lib/sources";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sources/$sourceId")({
  head: () => ({
    meta: [
      { title: "Fiche de synthèse — StudyLoop" },
      {
        name: "description",
        content: "Résumé, points clés, concepts et transcription de ta source de cours.",
      },
      { property: "og:title", content: "Fiche de synthèse — StudyLoop" },
      { property: "og:description", content: "Tout ton cours résumé et structuré par l'IA." },
    ],
  }),
  component: SourcePage,
});

// Languages a note / transcript can be re-rendered into on demand. "original"
// keeps whatever language the analysis produced.
const VIEW_LANGS = [
  { code: "original", label: "Original" },
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "th", label: "ไทย" },
  { code: "zh", label: "中文" },
  { code: "ko", label: "한국어" },
  { code: "ja", label: "日本語" },
] as const;

type ViewLang = (typeof VIEW_LANGS)[number]["code"];

interface TranslationRow {
  kind: "note" | "transcript";
  status: "pending" | "ready" | "failed";
  content: unknown;
  text: string | null;
  error_message: string | null;
}

async function fetchSource(sourceId: string) {
  const [source, note, transcript] = await Promise.all([
    supabase.from("sources").select("*").eq("id", sourceId).maybeSingle(),
    supabase
      .from("study_notes")
      .select("*")
      .eq("source_id", sourceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("transcripts").select("full_text").eq("source_id", sourceId).maybeSingle(),
  ]);
  const [reclaimed] = source.data ? await reclaimStaleSources([source.data]) : [null];
  return {
    source: reclaimed,
    note: note.data,
    transcript: transcript.data?.full_text ?? "",
  };
}

async function fetchTranslations(sourceId: string, language: string) {
  const { data } = await supabase
    .from("content_translations")
    .select("kind, status, content, text, error_message")
    .eq("source_id", sourceId)
    .eq("language", language);
  return (data ?? []) as TranslationRow[];
}

function SourcePage() {
  const { sourceId } = Route.useParams();
  const { t } = useI18n();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"note" | "transcript">("note");
  const [search, setSearch] = useState("");
  const [viewLang, setViewLang] = useState<ViewLang>("original");

  const runRetry = useServerFn(retrySource);
  const runAdvance = useServerFn(advanceAnalysis);
  const runTranslate = useServerFn(translateContent);
  const outputLanguage = settings?.ai_output_language ?? "same";

  const query = useQuery({
    queryKey: ["source", sourceId],
    queryFn: () => fetchSource(sourceId),
    refetchInterval: (q) => (q.state.data?.source?.status === "processing" ? 4000 : false),
  });

  // Resume an interrupted / retried analysis: keep calling `advanceAnalysis`
  // until the source is done. A media source whose upload we no longer hold
  // comes back as `failed` with `needs_reupload`.
  const driving = useRef(false);
  const sourceStatus = query.data?.source?.status;
  useEffect(() => {
    if (sourceStatus !== "processing" || driving.current) return;
    driving.current = true;
    driveAnalysis({
      advance: runAdvance,
      sourceId,
      outputLanguage,
      onStep: () => queryClient.invalidateQueries({ queryKey: ["source", sourceId] }),
    }).finally(() => {
      driving.current = false;
      queryClient.invalidateQueries();
    });
  }, [sourceStatus, sourceId, outputLanguage, runAdvance, queryClient]);

  const retryMutation = useMutation({
    mutationFn: async () => runRetry({ data: { sourceId, outputLanguage } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries();
      if (!result.ok) {
        if (result.error?.code === "needs_reupload") {
          toast.error(t("source.needsReupload"));
          navigate({ to: "/add" });
          return;
        }
        toast.error(result.error?.message ?? t("error.generic"));
      }
    },
    onError: () => toast.error(t("error.generic")),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const spaceId = query.data?.source?.space_id as string | undefined;
      await deleteSource(sourceId);
      return spaceId;
    },
    onSuccess: (spaceId) => {
      queryClient.invalidateQueries();
      toast.success(t("source.deleted"));
      if (spaceId) navigate({ to: "/spaces/$spaceId", params: { spaceId } });
      else navigate({ to: "/spaces" });
    },
    onError: () => toast.error(t("error.generic")),
  });

  const translated = viewLang !== "original";

  const translationQuery = useQuery({
    queryKey: ["translations", sourceId, viewLang],
    queryFn: () => fetchTranslations(sourceId, viewLang),
    enabled: translated,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((r) => r.status === "pending") ? 3000 : false,
  });

  const translateMutation = useMutation({
    mutationFn: async (language: string) => runTranslate({ data: { sourceId, language } }),
    onSuccess: (result) => {
      translationQuery.refetch();
      if (!result.ok) toast.error(result.error?.message ?? t("error.generic"));
    },
    onError: () => toast.error(t("error.generic")),
  });

  const selectLang = (next: ViewLang) => {
    setViewLang(next);
    if (next !== "original") translateMutation.mutate(next);
  };

  const data = query.data;
  const status = data?.source?.status;
  const baseNote = data?.note?.content as NoteContent | undefined;
  const baseTranscript = data?.transcript ?? "";

  const trRows = translationQuery.data ?? [];
  const noteRow = trRows.find((r) => r.kind === "note");
  const transcriptRow = trRows.find((r) => r.kind === "transcript");

  const note =
    translated && noteRow?.status === "ready"
      ? (noteRow.content as unknown as NoteContent)
      : translated
        ? undefined
        : baseNote;
  const transcript =
    translated && transcriptRow?.status === "ready"
      ? (transcriptRow.text ?? "")
      : translated
        ? ""
        : baseTranscript;

  const translating =
    translated &&
    (translateMutation.isPending ||
      translationQuery.isLoading ||
      trRows.length === 0 ||
      trRows.some((r) => r.status === "pending"));
  const translationFailed = translated && !translating && trRows.some((r) => r.status === "failed");

  const lines = transcript
    ? transcript.split(/\n+/).filter((l: string) => l.toLowerCase().includes(search.toLowerCase()))
    : [];

  const showTabs = !!baseTranscript;
  const canTranslate = status === "completed" && (!!baseNote || !!baseTranscript);

  return (
    <>
      <PageHeader
        title={data?.source?.title ?? t("common.loading")}
        action={
          data?.source?.space_id ? (
            <Link
              to="/spaces/$spaceId"
              params={{ spaceId: data.source.space_id }}
              className="text-sm text-primary"
            >
              {t("source.openSpace")}
            </Link>
          ) : null
        }
      />
      <main className="space-y-4 px-5">
        {query.isLoading && (
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
        )}

        {status === "processing" && <AnalysisProgress stage={data?.source?.progress_step ?? ""} />}

        {status === "failed" && (
          <div className="card-soft space-y-3 border-destructive/30 p-4 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>{data?.source?.error_message ?? t("error.generic")}</span>
            </div>
            <Button
              className="h-10 w-full rounded-xl"
              disabled={retryMutation.isPending}
              onClick={() => retryMutation.mutate()}
            >
              {retryMutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              {retryMutation.isPending ? t("source.retrying") : t("source.retry")}
            </Button>
          </div>
        )}

        {canTranslate && (
          <div className="flex items-center gap-2">
            <Languages className="size-4 shrink-0 text-muted-foreground" />
            <Select value={viewLang} onValueChange={(v) => selectLang(v as ViewLang)}>
              <SelectTrigger className="h-10 rounded-xl" aria-label={t("source.viewLanguage")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIEW_LANGS.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.code === "original" ? t("source.original") : l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {canTranslate && translating && (
          <div className="card-soft flex items-center gap-2 p-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("source.translating")}
          </div>
        )}

        {canTranslate && translationFailed && (
          <div className="card-soft space-y-3 border-destructive/30 p-4 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>
                {trRows.find((r) => r.status === "failed")?.error_message ??
                  t("source.translateFailed")}
              </span>
            </div>
            <Button
              className="h-10 w-full rounded-xl"
              disabled={translateMutation.isPending}
              onClick={() => translateMutation.mutate(viewLang)}
            >
              <RefreshCw className="mr-2 size-4" />
              {t("common.retry")}
            </Button>
          </div>
        )}

        {showTabs && (
          <div className="flex gap-2">
            {(["note", "transcript"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "press rounded-full px-4 py-1.5 text-sm font-medium",
                  tab === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground",
                )}
              >
                {t(`source.tab.${key}` as const)}
              </button>
            ))}
          </div>
        )}

        {tab === "note" &&
          (note ? (
            <NoteView note={note} />
          ) : (
            !query.isLoading &&
            status === "completed" &&
            !translating && <p className="text-sm text-muted-foreground">{t("source.empty")}</p>
          ))}

        {tab === "transcript" && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("note.searchTranscript")}
                className="h-11 rounded-xl pl-9"
              />
            </div>
            <div className="card-soft space-y-2 p-4 text-[0.95rem] leading-relaxed">
              {lines.map((line: string, i: number) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        )}

        {data?.source && (
          <div className="pt-2">
            <ConfirmDelete
              title={t("source.deleteConfirm")}
              pending={deleteMutation.isPending}
              onConfirm={() => deleteMutation.mutate()}
              trigger={
                <Button
                  variant="ghost"
                  className="h-10 w-full rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="mr-2 size-4" />
                  {t("source.delete")}
                </Button>
              }
            />
          </div>
        )}
      </main>
    </>
  );
}
