/**
 * Google Sign-In cross web / Android natif.
 *
 * Web : redirection OAuth standard gérée par Supabase.
 * Android (WebView Capacitor) : Google bloque l'auth dans les WebView
 * embarquées, donc on ouvre le flux dans l'onglet système (Custom Tabs via
 * @capacitor/browser) puis on récupère le retour via un deep link custom
 * scheme (`com.studygenius.ai://auth-callback`), intercepté par
 * @capacitor/app. Nécessite flowType "pkce" sur le client Supabase.
 */
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";

export const NATIVE_AUTH_REDIRECT = "com.studygenius.ai://auth-callback";

export async function signInWithGoogle(): Promise<{ error?: Error }> {
  if (Capacitor.isNativePlatform()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: NATIVE_AUTH_REDIRECT, skipBrowserRedirect: true },
    });
    if (error) return { error };
    if (!data?.url) return { error: new Error("URL d'authentification manquante.") };
    await Browser.open({ url: data.url, presentationStyle: "popover" });
    return {};
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth` },
  });
  return error ? { error } : {};
}

/**
 * À monter une seule fois côté racine de l'app. Capture le retour du deep
 * link natif, échange le code PKCE contre une session Supabase, referme
 * l'onglet système.
 */
export function initNativeGoogleAuthListener(onError?: (error: Error) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  const handle = App.addListener("appUrlOpen", async (event: URLOpenListenerEvent) => {
    if (!event.url.startsWith(NATIVE_AUTH_REDIRECT)) return;
    void Browser.close().catch(() => {});

    let url: URL;
    try {
      url = new URL(event.url);
    } catch {
      return;
    }

    const errorDescription = url.searchParams.get("error_description") ?? url.searchParams.get("error");
    if (errorDescription) {
      onError?.(new Error(errorDescription));
      return;
    }

    const code = url.searchParams.get("code");
    if (!code) return;

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) onError?.(error);
  });

  return () => {
    void handle.then((h) => h.remove());
  };
}
