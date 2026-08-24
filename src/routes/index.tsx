import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "StudyLoop — Tes cours transformés en fiches de révision" },
      {
        name: "description",
        content:
          "StudyLoop transforme audios, vidéos YouTube, textes et documents en fiches de synthèse, flashcards et quiz.",
      },
      { property: "og:title", content: "StudyLoop — Assistant d'étude IA" },
      {
        property: "og:description",
        content: "Enregistre, importe, révise : ton assistant personnel de révision.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    navigate({ to: session ? "/home" : "/auth", replace: true });
  }, [loading, session, navigate]);

  return (
    <main className="gradient-hero flex min-h-dvh flex-col items-center justify-center gap-4 text-primary-foreground">
      <h1 className="text-3xl font-bold">StudyLoop</h1>
      <Loader2 className="size-6 animate-spin opacity-80" />
    </main>
  );
}
