import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mic, Headphones, Youtube, FileText, PenLine, Camera, ChevronRight } from "lucide-react";
import { useI18n } from "@/i18n";
import { fetchSpaces, fetchSpaceCounts } from "@/lib/spaces";
import { getUsage } from "@/lib/ai.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Accueil — StudyLoop" },
      { name: "description", content: "Enregistre un cours, importe un audio ou analyse une vidéo YouTube." },
      { property: "og:title", content: "Accueil — StudyLoop" },
      { property: "og:description", content: "Ton espace d'étude personnel propulsé par l'IA." },
    ],
  }),
  component: HomePage,
});

const ACTIONS = [
  { to: "/add/record", icon: Mic, key: "action.record", tone: "bg-primary/10 text-primary" },
  { to: "/add/audio", icon: Headphones, key: "action.audio", tone: "bg-chart-4/10 text-chart-4" },
  { to: "/add/youtube", icon: Youtube, key: "action.youtube", tone: "bg-destructive/10 text-destructive" },
  { to: "/add/document", icon: FileText, key: "action.document", tone: "bg-success/10 text-success" },
  { to: "/add/text", icon: PenLine, key: "action.text", tone: "bg-accent/20 text-accent-foreground" },
  { to: "/add/scan", icon: Camera, key: "action.scan", tone: "bg-secondary text-secondary-foreground" },
] as const;

function HomePage() {
  const { t } = useI18n();
  const usageFn = useServerFn(getUsage);

  const spaces = useQuery({ queryKey: ["spaces"], queryFn: fetchSpaces });
  const counts = useQuery({
    queryKey: ["space-counts", spaces.data?.map((s) => s.id)],
    queryFn: () => fetchSpaceCounts((spaces.data ?? []).map((s) => s.id)),
    enabled: !!spaces.data,
  });
  const usage = useQuery({ queryKey: ["usage"], queryFn: () => usageFn({}) });

  return (
    <main className="safe-top px-5 pt-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">StudyLoop</p>
      <h1 className="mt-1 text-2xl font-bold leading-tight">{t("home.greeting")}</h1>
      {usage.data && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("home.quota", { n: usage.data.remaining.analysis })}
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.to}
              to={a.to}
              className="press card-soft flex flex-col gap-3 p-4 active:shadow-none"
            >
              <span className={cn("flex size-10 items-center justify-center rounded-xl", a.tone)}>
                <Icon className="size-5" />
              </span>
              <span className="text-sm font-semibold leading-snug">{t(a.key)}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("home.recent")}</h2>
        <Link to="/spaces" className="text-sm text-primary">
          {t("nav.spaces")}
        </Link>
      </div>

      <div className="mt-3 space-y-3">
        {spaces.isLoading && <div className="h-20 animate-pulse rounded-2xl bg-muted" />}
        {spaces.data?.length === 0 && (
          <div className="card-soft p-6 text-center text-sm text-muted-foreground">{t("home.noSpaces")}</div>
        )}
        {spaces.data?.slice(0, 5).map((space) => (
          <Link
            key={space.id}
            to="/spaces/$spaceId"
            params={{ spaceId: space.id }}
            className="press card-soft flex items-center gap-3 p-4"
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-xl">
              {space.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{space.name}</span>
              <span className="block text-xs text-muted-foreground">
                {t("space.documents", { n: counts.data?.[space.id] ?? 0 })}
              </span>
            </span>
            <ChevronRight className="size-5 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </main>
  );
}
