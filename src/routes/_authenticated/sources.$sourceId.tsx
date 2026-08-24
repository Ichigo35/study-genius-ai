import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";
import { PageHeader } from "@/components/PageHeader";
import { NoteView, type NoteContent } from "@/components/NoteView";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sources/$sourceId")({
  head: () => ({
    meta: [
      { title: "Fiche de synthèse — StudyLoop" },
      { name: "description", content: "Résumé, points clés, concepts et transcription de ta source de cours." },
      { property: "og:title", content: "Fiche de synthèse — StudyLoop" },
      { property: "og:description", content: "Tout ton cours résumé et structuré par l'IA." },
    ],
  }),
  component: SourcePage,
});

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
    supabase.from("transcripts").select("content").eq("source_id", sourceId).maybeSingle(),
  ]);
  return {
    source: source.data,
    note: note.data,
    transcript: transcript.data?.content ?? "",
  };
}

function SourcePage() {
  const { sourceId } = Route.useParams();
  const { t } = useI18n();
  const [tab, setTab] = useState<"note" | "transcript">("note");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["source", sourceId],
    queryFn: () => fetchSource(sourceId),
    refetchInterval: (q) => (q.state.data?.source?.status === "processing" ? 4000 : false),
  });

  const data = query.data;
  const note = data?.note?.content as NoteContent | undefined;
  const lines = data?.transcript
    ? data.transcript.split(/\n+/).filter((l) => l.toLowerCase().includes(search.toLowerCase()))
    : [];

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
        {query.isLoading && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}

        {data?.source?.status === "processing" && (
          <div className="card-soft flex items-center gap-2 p-4 text-sm">
            <Loader2 className="size-4 animate-spin text-primary" />
            {t("status.processing")}
          </div>
        )}

        {data?.source?.status === "failed" && (
          <div className="card-soft flex items-start gap-2 border-destructive/30 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 text-destructive" />
            <span>{data.source.error_message ?? t("error.generic")}</span>
          </div>
        )}

        {data?.transcript && (
          <div className="flex gap-2">
            {(["note", "transcript"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "press rounded-full px-4 py-1.5 text-sm font-medium",
                  tab === key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
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
            data?.source?.status === "completed" && (
              <p className="text-sm text-muted-foreground">{t("source.empty")}</p>
            )
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
              {lines.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
