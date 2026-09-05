// Languages the AI can render content into (study notes, transcript
// translations, flashcards, quizzes). Kept separate from the UI locales in
// `src/i18n` — the app UI ships in 4 languages, but generated content can be
// produced in more.

export interface ContentLanguage {
  code: string;
  flag: string;
  label: string;
}

export const CONTENT_LANGUAGES: ContentLanguage[] = [
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "th", flag: "🇹🇭", label: "ไทย" },
  { code: "lo", flag: "🇱🇦", label: "ລາວ" },
  { code: "zh", flag: "🇨🇳", label: "中文" },
  { code: "ko", flag: "🇰🇷", label: "한국어" },
  { code: "ja", flag: "🇯🇵", label: "日本語" },
];

// "original" keeps whatever language the content was generated/stored in.
export const VIEW_LANGUAGES = [
  { code: "original", flag: "🌐" },
  ...CONTENT_LANGUAGES.map((l) => ({ code: l.code, flag: l.flag })),
];

export function languageFlag(code: string): string {
  return CONTENT_LANGUAGES.find((l) => l.code === code)?.flag ?? "🌐";
}

export function languageLabel(code: string): string {
  return CONTENT_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
