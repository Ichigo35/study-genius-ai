import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Languages, Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";
import { translateFlashcards } from "@/lib/ai.functions";
import { VIEW_LANGUAGES, languageLabel } from "@/lib/languages";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/review")({
  head: () => ({
    meta: [
      { title: "Réviser — StudyLoop" },
      { name: "description", content: "Révise tes flashcards avec la répétition espacée." },
      { property: "og:title", content: "Réviser — StudyLoop" },
      {
        property: "og:description",
        content: "Des cartes au bon moment pour mémoriser durablement.",
      },
    ],
  }),
  component: ReviewPage,
});

async function fetchDueCards() {
  const { data } = await supabase
    .from("flashcards")
    .select("*")
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(30);
  return data ?? [];
}

interface TranslationRow {
  flashcard_id: string;
  status: "pending" | "ready" | "failed";
  front: string | null;
  back: string | null;
  error_message: string | null;
}

async function fetchCardTranslations(flashcardIds: string[], language: string) {
  if (flashcardIds.length === 0) return [];
  const { data } = await supabase
    .from("flashcard_translations")
    .select("flashcard_id, status, front, back, error_message")
    .in("flashcard_id", flashcardIds)
    .eq("language", language);
  return (data ?? []) as TranslationRow[];
}

type Grade = "hard" | "medium" | "easy";

function schedule(
  card: { interval_days: number; ease_factor: number; repetitions: number },
  grade: Grade,
) {
  const quality = grade === "easy" ? 5 : grade === "medium" ? 4 : 2;
  const ease = Math.max(
    1.3,
    card.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );
  const repetitions = quality < 3 ? 0 : card.repetitions + 1;
  const interval =
    quality < 3
      ? 1
      : repetitions === 1
        ? 1
        : repetitions === 2
          ? 3
          : Math.round(card.interval_days * ease);
  const due = new Date();
  due.setDate(due.getDate() + interval);
  return {
    ease_factor: Number(ease.toFixed(2)),
    repetitions,
    interval_days: interval,
    due_at: due.toISOString(),
  };
}

function ReviewPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [viewLang, setViewLang] = useState<string>("original");

  const runTranslate = useServerFn(translateFlashcards);

  const cards = useQuery({ queryKey: ["due-cards"], queryFn: fetchDueCards });
  const list = cards.data ?? [];
  const card = list[index];
  const ids = list.map((c) => c.id as string);

  const translated = viewLang !== "original";
  const translationQuery = useQuery({
    queryKey: ["flashcard-translations", ids.join(","), viewLang],
    queryFn: () => fetchCardTranslations(ids, viewLang),
    enabled: translated && ids.length > 0,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((r) => r.status === "pending") ? 3000 : false,
  });

  const translateMutation = useMutation({
    mutationFn: async (language: string) => runTranslate({ data: { flashcardIds: ids, language } }),
    onSuccess: () => translationQuery.refetch(),
  });

  const selectLang = (next: string) => {
    setViewLang(next);
    if (next !== "original" && ids.length > 0) translateMutation.mutate(next);
  };

  const trRow = translated
    ? translationQuery.data?.find((r) => r.flashcard_id === card?.id)
    : undefined;
  const cardReady = translated && trRow?.status === "ready";
  const cardFailed = translated && trRow?.status === "failed";
  const cardPending = translated && !cardReady && !cardFailed;
  const front = cardReady && trRow?.front ? trRow.front : card?.front;
  const back = cardReady && trRow?.back ? trRow.back : card?.back;

  async function grade(g: Grade) {
    if (!card) return;
    const next = schedule(card, g);
    await supabase
      .from("flashcards")
      .update({ ...next, difficulty: g })
      .eq("id", card.id);
    setFlipped(false);
    setIndex((i) => i + 1);
    if (index + 1 >= list.length) queryClient.invalidateQueries({ queryKey: ["due-cards"] });
  }

  return (
    <main className="safe-top px-5 pt-4">
      <h1 className="text-2xl font-bold">{t("review.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("review.due", { n: Math.max(list.length - index, 0) })}
      </p>

      {cards.isLoading && (
        <Loader2 className="mx-auto mt-10 size-5 animate-spin text-muted-foreground" />
      )}

      {!cards.isLoading && list.length > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <Languages className="size-4 shrink-0 text-muted-foreground" />
          <Select value={viewLang} onValueChange={selectLang}>
            <SelectTrigger className="h-10 rounded-xl" aria-label={t("review.language")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIEW_LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.flag} {l.code === "original" ? t("review.original") : languageLabel(l.code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!cards.isLoading && !card && (
        <div className="card-soft mt-6 p-8 text-center">
          <p className="font-semibold">{index > 0 ? t("flash.done") : t("review.nothing")}</p>
          {index > 0 && (
            <Button
              variant="secondary"
              className="mt-4 rounded-xl"
              onClick={() => {
                setIndex(0);
                queryClient.invalidateQueries({ queryKey: ["due-cards"] });
              }}
            >
              <RotateCcw className="mr-2 size-4" />
              {t("common.retry")}
            </Button>
          )}
        </div>
      )}

      {card && (
        <div className="mt-6 space-y-4">
          {cardPending && (
            <div className="card-soft flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("review.translating")}
            </div>
          )}
          {cardFailed && (
            <p className="card-soft p-3 text-sm text-destructive">
              {trRow?.error_message ?? t("review.translateFailed")}
            </p>
          )}
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className={cn(
              "card-soft flex min-h-56 w-full items-center justify-center p-6 text-center text-lg font-medium",
              flipped && "bg-secondary",
            )}
          >
            {flipped ? back : front}
          </button>
          {!flipped ? (
            <Button className="h-12 w-full rounded-xl" onClick={() => setFlipped(true)}>
              {t("flash.flip")}
            </Button>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" className="h-12 rounded-xl" onClick={() => grade("hard")}>
                {t("flash.hard")}
              </Button>
              <Button variant="outline" className="h-12 rounded-xl" onClick={() => grade("medium")}>
                {t("flash.medium")}
              </Button>
              <Button className="h-12 rounded-xl" onClick={() => grade("easy")}>
                {t("flash.easy")}
              </Button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
