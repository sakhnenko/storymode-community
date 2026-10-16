import { useEffect } from "react";
import i18n from "@/i18n";
import { LANGUAGE_STORAGE_KEY } from "@/i18n";
import { useProfile } from "@/hooks/useProfile";

/**
 * Applies the user's preferred_language from their profile.
 * The profile is the source of truth: any in-app language change also writes to
 * the profile, so a stale value in this browser's storage must not win.
 */
export function useLanguageSync() {
  const { profile } = useProfile();

  useEffect(() => {
    const lang = profile?.preferred_language;
    if (!lang) return;
    if (i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      /* noop */
    }
  }, [profile?.preferred_language]);
}