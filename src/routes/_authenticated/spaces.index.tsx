import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { createSpace, fetchSpaceCounts, fetchSpaces } from "@/lib/spaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/spaces/")({
  head: () => ({
    meta: [
      { title: "Mes cours — StudyLoop" },
      { name: "description", content: "Tous tes espaces de cours et leurs sources analysées." },
      { property: "og:title", content: "Mes cours — StudyLoop" },
      { property: "og:description", content: "Organise tes matières et retrouve tes fiches." },
    ],
  }),
  component: SpacesPage,
});

const EMOJIS = ["📘", "🧪", "⚖️", "📈", "🏛️", "🧠", "🌍", "💻", "🩺", "🎨"];

export function NewSpaceDialog({ onCreated }: { onCreated?: (id: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("📘");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => createSpace({ name, description, emoji }),
    onSuccess: (space) => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      setOpen(false);
      setName("");
      setDescription("");
      onCreated?.(space.id);
    },
    onError: () => toast.error(t("error.generic")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-full">
          <Plus className="mr-1 size-4" />
          {t("space.new")}
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>{t("space.new")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`press size-9 rounded-xl text-lg ${emoji === e ? "bg-primary/15 ring-2 ring-primary" : "bg-secondary"}`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="space-name">{t("space.name")}</Label>
            <Input
              id="space-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("space.namePlaceholder")}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="space-desc">
              {t("space.description")} <span className="text-muted-foreground">({t("common.optional")})</span>
            </Label>
            <Textarea
              id="space-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            className="w-full rounded-xl"
            disabled={!name.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SpacesPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const spaces = useQuery({ queryKey: ["spaces"], queryFn: fetchSpaces });
  const counts = useQuery({
    queryKey: ["space-counts", spaces.data?.map((s) => s.id)],
    queryFn: () => fetchSpaceCounts((spaces.data ?? []).map((s) => s.id)),
    enabled: !!spaces.data,
  });

  return (
    <main className="safe-top px-5 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("nav.spaces")}</h1>
        <NewSpaceDialog onCreated={(id) => navigate({ to: "/spaces/$spaceId", params: { spaceId: id } })} />
      </div>

      <div className="mt-5 space-y-3">
        {spaces.isLoading && <div className="h-20 animate-pulse rounded-2xl bg-muted" />}
        {spaces.data?.length === 0 && (
          <div className="card-soft p-6 text-center text-sm text-muted-foreground">{t("home.noSpaces")}</div>
        )}
        {spaces.data?.map((space) => (
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
                {t("space.documents", { n: counts.data?.[space.id] ?? 0 })} ·{" "}
                {new Date(space.last_activity_at).toLocaleDateString()}
              </span>
            </span>
            <ChevronRight className="size-5 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </main>
  );
}
