import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Brain, ChevronRight, HelpCircle, Loader2, Plus, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";
import { useSettings } from "@/hooks/useSettings";
import { PageHeader } from "@/components/PageHeader";
import { askSpace, createFlashcards, createQuiz } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/spaces/$spaceId")({
  head: () => ({
    meta: [
      { title: "Mon cours — StudyLoop" },
      { name: "description", content: "Sources, fiches de synthèse et assistant IA pour ce cours." },
      { property: "og:title", content: "Mon cours — StudyLoop" },
      { property: "og:description", content: "Révise avec tes fiches, flashcards et quiz générés par l'IA." },
    ],
  }),
  component: SpacePage,
});

async function fetchSpaceData(spaceId: string) {
  const [space, sources, notes, messages] = await Promise.all([
    supabase.from("study_spaces").select("*").eq("id", spaceId).maybeSingle(),
    supabase.from("sources").select("*").eq("space_id", spaceId).order("created_at", { ascending: false }),
    supabase
      .from("study_notes")
      .select("id, title, source_id, created_at")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("chat_messages")
      .select("id, role, content")
      .eq("space_id", spaceId)
      .order("created_at", { ascending: true }),
  ]);
  return {
    space: space.data,
    sources: sources.data ?? [],
    notes: notes.data ?? [],
    messages: messages.data ?? [],
  };
}

function SpacePage() {
  const { spaceId } = Route.useParams();
  const { t } = useI18n();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"sources" | "notes" | "chat">("sources");
  const [question, setQuestion] = useState("");

  const ask = useServerFn(askSpace);
  const genCards = useServerFn(createFlashcards);
  const genQuiz = useServerFn(createQuiz);
  const outputLanguage = settings?.ai_output_language ?? "same";

  const query = useQuery({
    queryKey: ["space", spaceId],
    queryFn: () => fetchSpaceData(spaceId),
    refetchInterval: (q) =>
      q.state.data?.sources.some((s: { status: string }) => s.status === "processing") ? 4000 : false,
  });

  const askMutation = useMutation({
    mutationFn: async (q: string) => ask({ data: { spaceId, question: q, outputLanguage } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["space", spaceId] });
    },
    onError: () => toast.error(t("error.generic")),
  });

  const cardsMutation = useMutation({
    mutationFn: async () => genCards({ data: { spaceId, count: 15, outputLanguage } }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      navigate({ to: "/review" });
    },
    onError: () => toast.error(t("error.generic")),
  });

  const quizMutation = useMutation({
    mutationFn: async () => genQuiz({ data: { spaceId, count: 10, outputLanguage } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries();
      navigate({ to: "/quizzes/$quizId", params: { quizId: result.quizId } });
    },
    onError: () => toast.error(t("error.generic")),
  });

  const data = query.data;

  return (
    <>
      <PageHeader title={data?.space ? `${data.space.emoji} ${data.space.name}` : t("common.loading")} />
      <main className="space-y-4 px-5">
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            className="h-12 rounded-xl"
            disabled={cardsMutation.isPending}
            onClick={() => cardsMutation.mutate()}
          >
            {cardsMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Brain className="mr-2 size-4" />}
            {t("space.flashcards")}
          </Button>
          <Button
            variant="secondary"
            className="h-12 rounded-xl"
            disabled={quizMutation.isPending}
            onClick={() => quizMutation.mutate()}
          >
            {quizMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <HelpCircle className="mr-2 size-4" />}
            {t("space.quiz")}
          </Button>
        </div>

        <div className="flex gap-2">
          {(["sources", "notes", "chat"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "press rounded-full px-4 py-1.5 text-sm font-medium",
                tab === key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
              )}
            >
              {key === "sources" ? t("space.sources") : key === "notes" ? t("space.notes") : t("space.ask")}
            </button>
          ))}
        </div>

        {tab === "sources" && (
          <div className="space-y-3">
            <Link to="/add" className="press card-soft flex items-center gap-2 border-dashed p-4 text-sm font-medium">
              <Plus className="size-4" /> {t("space.addSource")}
            </Link>
            {data?.sources.map((source) => (
              <Link
                key={source.id}
                to="/sources/$sourceId"
                params={{ sourceId: source.id }}
                className="press card-soft flex items-center gap-3 p-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{source.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`status.${source.status}` as "status.completed")}
                  </span>
                </span>
                {source.status === "processing" ? (
                  <Loader2 className="size-4 animate-spin text-primary" />
                ) : (
                  <ChevronRight className="size-5 text-muted-foreground" />
                )}
              </Link>
            ))}
          </div>
        )}

        {tab === "notes" && (
          <div className="space-y-3">
            {data?.notes.length === 0 && <p className="text-sm text-muted-foreground">{t("common.empty")}</p>}
            {data?.notes.map((note) => (
              <Link
                key={note.id}
                to="/sources/$sourceId"
                params={{ sourceId: note.source_id ?? "" }}
                className="press card-soft flex items-center gap-3 p-4"
              >
                <Sparkles className="size-4 text-primary" />
                <span className="min-w-0 flex-1 truncate font-medium">{note.title}</span>
                <ChevronRight className="size-5 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}

        {tab === "chat" && (
          <div className="space-y-3 pb-4">
            {data?.messages.length === 0 && <p className="text-sm text-muted-foreground">{t("chat.empty")}</p>}
            {data?.messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-[0.95rem] leading-relaxed",
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-card shadow-sm",
                )}
              >
                {m.content}
              </div>
            ))}
            {askMutation.isPending && <Loader2 className="size-4 animate-spin text-primary" />}
            <div className="sticky bottom-24 flex gap-2">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={t("chat.placeholder")}
                className="h-12 rounded-xl"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && question.trim()) {
                    askMutation.mutate(question);
                    setQuestion("");
                  }
                }}
              />
              <Button
                size="icon"
                className="size-12 shrink-0 rounded-xl"
                disabled={!question.trim() || askMutation.isPending}
                onClick={() => {
                  askMutation.mutate(question);
                  setQuestion("");
                }}
              >
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
