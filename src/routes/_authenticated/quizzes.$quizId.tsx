import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/quizzes/$quizId")({
  head: () => ({
    meta: [
      { title: "Quiz — StudyLoop" },
      { name: "description", content: "Teste tes connaissances avec un quiz généré à partir de ton cours." },
      { property: "og:title", content: "Quiz — StudyLoop" },
      { property: "og:description", content: "QCM et vrai/faux avec explications détaillées." },
    ],
  }),
  component: QuizPage,
});

async function fetchQuiz(quizId: string) {
  const [quiz, questions] = await Promise.all([
    supabase.from("quizzes").select("*").eq("id", quizId).maybeSingle(),
    supabase.from("quiz_questions").select("*").eq("quiz_id", quizId).order("position", { ascending: true }),
  ]);
  return { quiz: quiz.data, questions: questions.data ?? [] };
}

function QuizPage() {
  const { quizId } = Route.useParams();
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{ correct: boolean }[]>([]);

  const query = useQuery({ queryKey: ["quiz", quizId], queryFn: () => fetchQuiz(quizId) });
  const questions = query.data?.questions ?? [];
  const question = questions[index];
  const options = (question?.options as string[] | null) ?? [t("quiz.true"), t("quiz.false")];
  const answered = answers.length > index;
  const score = answers.filter((a) => a.correct).length;

  function validate() {
    if (selected === null || !question) return;
    setAnswers((a) => [...a, { correct: selected === question.correct_answer }]);
  }

  function next() {
    setSelected(null);
    setIndex((i) => i + 1);
  }

  return (
    <>
      <PageHeader title={query.data?.quiz?.title ?? t("quiz.title")} />
      <main className="space-y-4 px-5">
        {query.isLoading && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}

        {!query.isLoading && !question && (
          <div className="card-soft p-8 text-center">
            <p className="text-lg font-semibold">{t("quiz.score", { a: score, b: questions.length })}</p>
          </div>
        )}

        {question && (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {index + 1} / {questions.length}
            </p>
            <h2 className="text-lg font-semibold leading-snug">{question.question}</h2>
            <div className="space-y-2">
              {options.map((option) => {
                const isCorrect = option === question.correct_answer;
                const state = answered
                  ? isCorrect
                    ? "correct"
                    : option === selected
                      ? "wrong"
                      : "idle"
                  : option === selected
                    ? "selected"
                    : "idle";
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={answered}
                    onClick={() => setSelected(option)}
                    className={cn(
                      "press flex w-full items-center gap-2 rounded-xl border px-4 py-3 text-left text-[0.95rem]",
                      state === "idle" && "border-border bg-card",
                      state === "selected" && "border-primary bg-secondary",
                      state === "correct" && "border-success bg-success/10",
                      state === "wrong" && "border-destructive bg-destructive/10",
                    )}
                  >
                    <span className="flex-1">{option}</span>
                    {state === "correct" && <Check className="size-4 text-success" />}
                    {state === "wrong" && <X className="size-4 text-destructive" />}
                  </button>
                );
              })}
            </div>

            {answered && question.explanation && (
              <p className="card-soft p-4 text-sm text-muted-foreground">{question.explanation}</p>
            )}

            <Button
              className="h-12 w-full rounded-xl"
              disabled={selected === null}
              onClick={answered ? next : validate}
            >
              {answered ? (index + 1 === questions.length ? t("quiz.finish") : t("quiz.next")) : t("quiz.submit")}
            </Button>
          </>
        )}
      </main>
    </>
  );
}
