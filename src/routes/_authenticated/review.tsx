import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/review")({
  head: () => ({
    meta: [
      { title: "Réviser — StudyLoop" },
      { name: "description", content: "Révise tes flashcards avec la répétition espacée." },
      { property: "og:title", content: "Réviser — StudyLoop" },
      { property: "og:description", content: "Des cartes au bon moment pour mémoriser durablement." },
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

type Grade = "hard" | "medium" | "easy";

function schedule(card: { interval_days: number; ease_factor: number; repetitions: number }, grade: Grade) {
  const quality = grade === "easy" ? 5 : grade === "medium" ? 4 : 2;
  let ease = Math.max(1.3, card.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  let repetitions = quality < 3 ? 0 : card.repetitions + 1;
  let interval = quality < 3 ? 1 : repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.round(card.interval_days * ease);
  const due = new Date();
  due.setDate(due.getDate() + interval);
  return { ease_factor: Number(ease.toFixed(2)), repetitions, interval_days: interval, due_at: due.toISOString() };
}

function ReviewPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const cards = useQuery({ queryKey: ["due-cards"], queryFn: fetchDueCards });
  const list = cards.data ?? [];
  const card = list[index];

  async function grade(g: Grade) {
    if (!card) return;
    const next = schedule(card, g);
    await supabase.from("flashcards").update({ ...next, difficulty: g }).eq("id", card.id);
    setFlipped(false);
    setIndex((i) => i + 1);
    if (index + 1 >= list.length) queryClient.invalidateQueries({ queryKey: ["due-cards"] });
  }

  return (
    <main className="safe-top px-5 pt-4">
      <h1 className="text-2xl font-bold">{t("review.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("review.due", { n: Math.max(list.length - index, 0) })}</p>

      {cards.isLoading && <Loader2 className="mx-auto mt-10 size-5 animate-spin text-muted-foreground" />}

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
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className={cn(
              "card-soft flex min-h-56 w-full items-center justify-center p-6 text-center text-lg font-medium",
              flipped && "bg-secondary",
            )}
          >
            {flipped ? card.back : card.front}
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
