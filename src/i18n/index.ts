import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import ptBR from "./locales/pt-BR.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "pt-BR", label: "Português (Brasil)" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const LANGUAGE_STORAGE_KEY = "storymode_language";

/**
 * Normalize any locale string to one of our supported codes.
 * Any Portuguese variant (pt, pt-BR, pt-PT, pt-AO, pt-MZ, …) → pt-BR.
 * Everything else → en.
 */
function normalizeLanguage(raw: string | null | undefined): LanguageCode {
  if (!raw) return "en";
  const lower = raw.toLowerCase();
  if (lower === "pt" || lower.startsWith("pt-") || lower.startsWith("pt_")) return "pt-BR";
  if (lower === "en" || lower.startsWith("en-") || lower.startsWith("en_")) return "en";
  return "en";
}

// Custom detector: respects an explicit user choice in localStorage,
// otherwise falls back to the browser's navigator languages.
const customDetector = {
  name: "storymodeDetector",
  lookup(): string {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved) return normalizeLanguage(saved);
    } catch {
      /* noop */
    }
    const candidates: string[] = [];
    if (typeof navigator !== "undefined") {
      if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
      if (navigator.language) candidates.push(navigator.language);
    }
    for (const c of candidates) {
      const norm = normalizeLanguage(c);
      if (norm === "pt-BR") return "pt-BR";
    }
    return "en";
  },
  cacheUserLanguage(lng: string) {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizeLanguage(lng));
    } catch {
      /* noop */
    }
  },
};

const detector = new LanguageDetector();
detector.addDetector(customDetector);

i18n
  .use(detector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      "pt-BR": { translation: ptBR },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "pt-BR"],
    nonExplicitSupportedLngs: false,
    interpolation: { escapeValue: false },
    detection: {
      order: ["storymodeDetector"],
      caches: ["storymodeDetector"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    },
    returnNull: false,
  });

export function setLanguage(code: LanguageCode) {
  i18n.changeLanguage(code);
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    /* noop */
  }
}

export default i18n;