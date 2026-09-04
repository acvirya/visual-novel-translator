/**
 * Universal Language Registry & ISO 639-1 Code Definitions
 */

export interface LanguageOption {
  code: string;
  name: string;
  nativeName?: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "en", name: "English", nativeName: "English" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia" },
  { code: "zh", name: "Chinese", nativeName: "中文" },
  { code: "zh-cn", name: "Simplified Chinese", nativeName: "简体中文" },
  { code: "zh-tw", name: "Traditional Chinese", nativeName: "繁體中文" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "ru", name: "Russian", nativeName: "Русский" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "th", name: "Thai", nativeName: "ไทย" },
  { code: "pt", name: "Portuguese", nativeName: "Português" },
  { code: "pt-pt", name: "Portuguese (Portugal)", nativeName: "Português (Portugal)" },
  { code: "it", name: "Italian", nativeName: "Italiano" },
  { code: "pl", name: "Polish", nativeName: "Polski" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe" },
  { code: "ar", name: "Arabic", nativeName: "العربية" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu" },
  { code: "tl", name: "Tagalog", nativeName: "Tagalog" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська" },
  { code: "cs", name: "Czech", nativeName: "Čeština" },
  { code: "hu", name: "Hungarian", nativeName: "Magyar" },
  { code: "sv", name: "Swedish", nativeName: "Svenska" },
  { code: "fi", name: "Finnish", nativeName: "Suomi" },
  { code: "da", name: "Danish", nativeName: "Dansk" },
  { code: "no", name: "Norwegian", nativeName: "Norsk" },
  { code: "el", name: "Greek", nativeName: "Ελληνικά" },
  { code: "ro", name: "Romanian", nativeName: "Română" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "he", name: "Hebrew", nativeName: "עברית" },
  { code: "jv", name: "Javanese", nativeName: "Basa Jawa" },
  { code: "su", name: "Sundanese", nativeName: "Basa Sunda" },
  { code: "la", name: "Latin", nativeName: "Latina" },
  { code: "eo", name: "Esperanto", nativeName: "Esperanto" },
  { code: "auto", name: "Original Language", nativeName: "Auto Detect" },
];

export const SUPPORTED_LANGUAGES_MAP: Record<string, string> = SUPPORTED_LANGUAGES.reduce(
  (acc, lang) => {
    acc[lang.code.toLowerCase()] = lang.name;
    return acc;
  },
  {} as Record<string, string>
);

export function getLanguageName(code: string): string {
  const clean = (code || "").toLowerCase().trim();
  if (!clean) return "English";
  if (SUPPORTED_LANGUAGES_MAP[clean]) return SUPPORTED_LANGUAGES_MAP[clean];
  const found = SUPPORTED_LANGUAGES.find(
    (l) => l.code.toLowerCase() === clean || l.code.toLowerCase().startsWith(clean)
  );
  return found ? found.name : code.toUpperCase();
}

export function getLanguageDisplayName(code: string): string {
  return getLanguageName(code);
}
