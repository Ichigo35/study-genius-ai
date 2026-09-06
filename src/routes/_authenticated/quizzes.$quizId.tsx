import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Languages, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";
import { PageHeader } from "@/components/PageHeader";
import { translateQuiz } from "@/lib/ai.functions";
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

export const Route = createFileRoute("/_authenticated/quizzes/$quizId")({
  head: () => ({
    meta: [
      { title: "Quiz — StudyLoop" },
      {
        name: "description",
        content: "Teste tes connaissances avec un quiz généré à partir de ton cours.",
      },
      { property: "og:title", content: "Quiz — StudyLoop" },
      { property: "og:description", content: "QCM et vrai/faux avec explications détaillées." },
    ],
  }),
  component: QuizPage,
});

interface Question {
  id: string;
  position: number;
  type: string;
  question: string;
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
}

async function fetchQuiz(quizId: string) {
  const [quiz, questions] = await Promise.all([
    supabase.from("quizzes").select("*").eq("id", quizId).maybeSingle(),
    supabase
      .from("quiz_questions")
      .select("*")
      .eq("quiz_id", quizId)
      .order("position", { ascending: true }),
  ]);
  return { quiz: quiz.data, questions: (questions.data ?? []) as Question[] };
}

interface QuizTranslationRow {
  status: "pending" | "ready" | "failed";
  error_message: string | null;
  questions:
    | {
        id: string;
        position: number;
        type: string;
        question: string;
        options: string[];
        correctAnswer: string;
        explanation: string;
      }[]
    | null;
}

async function fetchQuizTranslation(quizId: string, language: string) {
  const { data } = await supabase
    .from("quiz_translations")
    .select("status, error_message, questions")
    .eq("quiz_id", quizId)
    .eq("language", language)
    .maybeSingle();
  return (data as QuizTranslationRow | null) ?? null;
}

function QuizPage() {
  const { quizId } = Route.useParams();
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{ correct: boolean }[]>([]);
  const [viewLang, setViewLang] = useState<string>("original");

  const runTranslate = useServerFn(translateQuiz);

  const query = useQuery({ queryKey: ["quiz", quizId], queryFn: () => fetchQuiz(quizId) });
  const baseQuestions = query.data?.questions ?? [];

  const translated = viewLang !== "original";
  const translationQuery = useQuery({
    queryKey: ["quiz-translation", quizId, viewLang],
    queryFn: () => fetchQuizTranslation(quizId, viewLang),
    enabled: translated,
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 2000 : false),
  });

  const translateMutation = useMutation({
    mutationFn: async (language: string) => runTranslate({ data: { quizId, language } }),
    onSuccess: () => translationQuery.refetch(),
  });

  function resetProgress() {
    setIndex(0);
    setSelected(null);
    setAnswers([]);
  }

  const selectLang = (next: string) => {
    setViewLang(next);
    resetProgress();
    if (next !== "original") translateMutation.mutate(next);
  };

  const translationStatus = translated ? translationQuery.data?.status : undefined;
  const quizReady = translated && translationStatus === "ready";
  const quizFailed = translated && translationStatus === "failed";
  const quizPending = translated && !quizReady && !quizFailed;

  const questions: Question[] =
    quizReady && translationQuery.data?.questions
      ? translationQuery.data.questions.map((q) => ({
          id: q.id,
          position: q.position,
          type: q.type,
          question: q.question,
          options: q.options,
          correct_answer: q.correctAnswer,
          explanation: q.explanation,
        }))
      : baseQuestions;

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
        {query.isLoading && (
          <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
        )}

        {!query.isLoading && baseQuestions.length > 0 && (
          <div className="flex items-center gap-2">
            <Languages className="size-4 shrink-0 text-muted-foreground" />
            <Select value={viewLang} onValueChange={selectLang}>
              <SelectTrigger className="h-10 rounded-xl" aria-label={t("quiz.language")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIEW_LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.flag} {l.code === "original" ? t("quiz.original") : languageLabel(l.code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {quizPending && (
          <div className="card-soft flex items-center gap-2 p-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("quiz.translating")}
          </div>
        )}
        {quizFailed && (
          <p className="card-soft p-3 text-sm text-destructive">
            {translationQuery.data?.error_message ?? t("quiz.translateFailed")}
          </p>
        )}

        {!query.isLoading && !question && !quizPending && (
          <div className="card-soft p-8 text-center">
            <p className="text-lg font-semibold">
              {t("quiz.score", { a: score, b: questions.length })}
            </p>
          </div>
        )}

        {question && !quizPending && (
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
              {answered
                ? index + 1 === questions.length
                  ? t("quiz.finish")
                  : t("quiz.next")
                : t("quiz.submit")}
            </Button>
          </>
        )}
      </main>
    </>
  );
}
