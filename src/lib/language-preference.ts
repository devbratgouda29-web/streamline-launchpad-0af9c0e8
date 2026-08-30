import { useEffect, useState } from "react";
import type { ReadableLanguage } from "@/lib/notes-store";

/**
 * App-wide preferred note language (Hinglish / English).
 *
 * Persisted to localStorage so the Home top bar and every Note Pack screen
 * stay in sync; content is identical across variants — only the mnemonics
 * language changes.
 */
const KEY = "ftlb.language";

let current: ReadableLanguage = "hinglish";
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const stored = window.localStorage.getItem(KEY);
  if (stored === "hinglish" || stored === "english") current = stored;
}

export function getLanguage(): ReadableLanguage {
  hydrate();
  return current;
}

export function setLanguage(lang: ReadableLanguage) {
  hydrate();
  if (current === lang) return;
  current = lang;
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, lang);
  listeners.forEach((l) => l());
}

export function subscribeLanguage(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** React binding. Returns the SSR-safe default until mounted. */
export function useLanguagePreference(): [ReadableLanguage, (l: ReadableLanguage) => void] {
  const [lang, setLang] = useState<ReadableLanguage>("hinglish");

  useEffect(() => {
    setLang(getLanguage());
    return subscribeLanguage(() => setLang(getLanguage()));
  }, []);

  return [lang, setLanguage];
}

export const LANGUAGE_DISCLAIMER =
  "Content, flowcharts, and theory are 100% identical. The only difference is the language used for memory mnemonics.";
