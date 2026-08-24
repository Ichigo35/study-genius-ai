import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n";
import { LOCALES, LOCALE_FLAGS, LOCALE_LABELS } from "@/i18n/translations";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { getUsage } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profil & réglages — StudyLoop" },
      { name: "description", content: "Langue de l'interface, langue des réponses IA, niveau d'étude et quotas." },
      { property: "og:title", content: "Profil & réglages — StudyLoop" },
      { property: "og:description", content: "Personnalise ton assistant d'étude." },
    ],
  }),
  component: ProfilePage,
});

const LEVELS = ["middle", "high", "university", "master", "pro"] as const;
const DETAILS = ["quick", "standard", "detailed", "exam"] as const;

function ProfilePage() {
  const { t, locale, setLocale } = useI18n();
  const { user } = useAuth();
  const { settings, update } = useSettings();
  const navigate = useNavigate();
  const usageFn = useServerFn(getUsage);
  const usage = useQuery({ queryKey: ["usage"], queryFn: () => usageFn({}) });

  return (
    <main className="safe-top space-y-5 px-5 pt-4">
      <div>
        <h1 className="text-2xl font-bold">{t("profile.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
      </div>

      <section className="card-soft space-y-4 p-4">
        <div className="space-y-1.5">
          <Label>{t("profile.uiLanguage")}</Label>
          <Select
            value={locale}
            onValueChange={(v) => {
              setLocale(v as typeof locale);
              update.mutate({ ui_language: v });
            }}
          >
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((l) => (
                <SelectItem key={l} value={l}>
                  {LOCALE_FLAGS[l]} {LOCALE_LABELS[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t("profile.aiLanguage")}</Label>
          <Select
            value={settings?.ai_output_language ?? "same"}
            onValueChange={(v) => update.mutate({ ai_output_language: v })}
          >
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="same">{t("profile.aiLanguage.same")}</SelectItem>
              {LOCALES.map((l) => (
                <SelectItem key={l} value={l}>
                  {LOCALE_FLAGS[l]} {LOCALE_LABELS[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t("profile.level")}</Label>
          <Select value={settings?.study_level ?? "university"} onValueChange={(v) => update.mutate({ study_level: v })}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {t(`level.${l}` as const)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t("profile.detail")}</Label>
          <Select value={settings?.detail_level ?? "standard"} onValueChange={(v) => update.mutate({ detail_level: v })}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DETAILS.map((d) => (
                <SelectItem key={d} value={d}>
                  {t(`detail.${d}` as const)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="card-soft space-y-4 p-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="notif">{t("profile.notifications")}</Label>
          <Switch
            id="notif"
            checked={settings?.notifications_enabled ?? true}
            onCheckedChange={(v) => update.mutate({ notifications_enabled: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="del-audio">{t("profile.deleteAudio")}</Label>
          <Switch
            id="del-audio"
            checked={settings?.delete_audio_after_transcription ?? true}
            onCheckedChange={(v) => update.mutate({ delete_audio_after_transcription: v })}
          />
        </div>
      </section>

      {usage.data && (
        <section className="card-soft space-y-1 p-4 text-sm">
          <p className="font-semibold">{t("profile.usage")}</p>
          <p className="text-muted-foreground">{t("home.quota", { n: usage.data.remaining.analysis })}</p>
        </section>
      )}

      <Button
        variant="outline"
        className="h-12 w-full rounded-xl"
        onClick={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth" });
        }}
      >
        <LogOut className="mr-2 size-4" />
        {t("auth.signout")}
      </Button>
    </main>
  );
}
