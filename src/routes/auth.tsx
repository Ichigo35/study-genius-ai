import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { useI18n, LOCALES, LOCALE_LABELS, LOCALE_FLAGS, type Locale } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connexion — StudyLoop" },
      { name: "description", content: "Connecte-toi à StudyLoop pour retrouver tes cours et tes révisions." },
      { property: "og:title", content: "Connexion — StudyLoop" },
      { property: "og:description", content: "Accède à ton assistant d'étude IA." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, locale, setLocale } = useI18n();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/home", replace: true });
  }, [loading, session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/home` },
        });
        if (error) throw error;
        toast.success(t("auth.signup"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error(t("error.generic"));
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/home", replace: true });
  }

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <section className="gradient-hero safe-top px-6 pb-10 pt-10 text-primary-foreground">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
          <Sparkles className="size-3.5" /> {t("tagline")}
        </span>
        <h1 className="mt-4 text-3xl font-bold">StudyLoop</h1>
        <p className="mt-2 max-w-xs text-sm opacity-90">{t("auth.subtitle")}</p>
      </section>

      <div className="mx-auto -mt-6 w-full max-w-md flex-1 rounded-t-[2rem] bg-background px-6 pt-6">
        <p className="text-xs font-medium text-muted-foreground">{t("auth.chooseLanguage")}</p>
        <div className="mt-2 flex gap-2">
          {LOCALES.map((l: Locale) => (
            <button
              key={l}
              type="button"
              onClick={() => setLocale(l)}
              className={cn(
                "press flex-1 rounded-xl border px-2 py-2 text-xs font-medium",
                locale === l ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground",
              )}
            >
              <span className="mr-1">{LOCALE_FLAGS[l]}</span>
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>

        <h2 className="mt-7 text-xl font-semibold">{t("auth.title")}</h2>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-xl"
            />
          </div>
          <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl text-base">
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {mode === "signup" ? t("auth.signup") : t("auth.signin")}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" onClick={google} className="h-12 w-full rounded-xl text-base">
          {t("auth.google")}
        </Button>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-6 w-full pb-10 text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {mode === "signin" ? t("auth.toggleToSignup") : t("auth.toggleToSignin")}
        </button>
      </div>
    </main>
  );
}
