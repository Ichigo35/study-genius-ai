import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { dictionaries, LOCALES, type Locale, type TranslationKey } from "./translations";

const STORAGE_KEY = "studyloop.locale";

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  ready: boolean;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("fr");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (stored && (LOCALES as readonly string[]).includes(stored)) {
      setLocaleState(stored as Locale);
    } else if (typeof navigator !== "undefined") {
      const nav = navigator.language.slice(0, 2);
      if ((LOCALES as readonly string[]).includes(nav)) setLocaleState(nav as Locale);
    }
    setReady(true);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      let value: string = dictionaries[locale][key] ?? dictionaries.fr[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) value = value.replaceAll(`{${k}}`, String(v));
      }
      return value;
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t, ready }), [locale, setLocale, t, ready]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

export { LOCALES, LOCALE_LABELS, LOCALE_FLAGS } from "./translations";
export type { Locale, TranslationKey } from "./translations";
