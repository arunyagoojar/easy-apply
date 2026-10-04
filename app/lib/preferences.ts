"use client";

import { useCallback, useSyncExternalStore } from "react";

const THEME_EVENT = "easyapply-theme-change";
const LANGUAGE_EVENT = "easyapply-language-change";

type Theme = "dark" | "light";
export type Language = "en" | "hi";

function readStored(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStored(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Keep working when browser storage is unavailable. */ }
}

function subscribeTo(event: string, callback: () => void) {
  window.addEventListener(event, callback);
  return () => window.removeEventListener(event, callback);
}

function getThemeSnapshot(): Theme {
  return readStored("easyapply-theme") === "light" ? "light" : "dark";
}

export function useDarkTheme(): [boolean, (dark: boolean) => void] {
  const theme = useSyncExternalStore(
    (callback) => subscribeTo(THEME_EVENT, callback),
    getThemeSnapshot,
    () => "dark" as Theme,
  );
  const setDark = useCallback((dark: boolean) => {
    writeStored("easyapply-theme", dark ? "dark" : "light");
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);
  return [theme === "dark", setDark];
}

function getLanguageSnapshot(): Language {
  return readStored("easyapply-language") === "hi" ? "hi" : "en";
}

export function useLanguagePreference(): [Language, (language: Language) => void] {
  const language = useSyncExternalStore(
    (callback) => subscribeTo(LANGUAGE_EVENT, callback),
    getLanguageSnapshot,
    () => "en" as Language,
  );
  const setLanguage = useCallback((next: Language) => {
    writeStored("easyapply-language", next);
    document.documentElement.lang = next === "hi" ? "hi" : "en";
    window.dispatchEvent(new Event(LANGUAGE_EVENT));
  }, []);
  return [language, setLanguage];
}
