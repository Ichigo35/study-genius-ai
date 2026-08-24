import { createFileRoute, Link } from "@tanstack/react-router";
import { Mic, Headphones, Youtube, FileText, PenLine, Camera } from "lucide-react";
import { useI18n } from "@/i18n";
import { PageHeader } from "@/components/PageHeader";
import { NewSpaceDialog } from "./spaces.index";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/add/")({
  head: () => ({
    meta: [
      { title: "Ajouter une source — StudyLoop" },
      { name: "description", content: "Ajoute un enregistrement, un audio, une vidéo YouTube, un document ou du texte." },
      { property: "og:title", content: "Ajouter une source — StudyLoop" },
      { property: "og:description", content: "Toutes tes sources de cours au même endroit." },
    ],
  }),
  component: AddPage,
});

const ACTIONS = [
  { to: "/add/record", icon: Mic, key: "action.record", tone: "bg-primary/10 text-primary" },
  { to: "/add/audio", icon: Headphones, key: "action.audio", tone: "bg-chart-4/10 text-chart-4" },
  { to: "/add/youtube", icon: Youtube, key: "action.youtube", tone: "bg-destructive/10 text-destructive" },
  { to: "/add/document", icon: FileText, key: "action.document", tone: "bg-success/10 text-success" },
  { to: "/add/text", icon: PenLine, key: "action.text", tone: "bg-accent/20 text-accent-foreground" },
  { to: "/add/scan", icon: Camera, key: "action.scan", tone: "bg-secondary text-secondary-foreground" },
] as const;

function AddPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t("nav.add")} back={false} action={<NewSpaceDialog />} />
      <main className="px-5">
        <div className="grid grid-cols-2 gap-3">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <Link key={a.to} to={a.to} className="press card-soft flex flex-col gap-3 p-4">
                <span className={cn("flex size-10 items-center justify-center rounded-xl", a.tone)}>
                  <Icon className="size-5" />
                </span>
                <span className="text-sm font-semibold leading-snug">{t(a.key)}</span>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
