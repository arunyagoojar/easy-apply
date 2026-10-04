"use client";

import { useCallback, useSyncExternalStore } from "react";
import { LANGUAGE_KEY, THEME_KEY } from "./boot-script";

const THEME_EVENT = "easyapply-theme-change";
const LANGUAGE_EVENT = "easyapply-language-change";

export type Theme = "dark" | "light";
export type Language = "en" | "hi";

export function readStored(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writeStored(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Storage can be blocked; preferences then last for this visit only. */ }
}

function subscribeTo(event: string, callback: () => void) {
  window.addEventListener(event, callback);
  return () => window.removeEventListener(event, callback);
}

// The inline script in app/layout.tsx applies the theme before first paint,
// so the DOM attribute is the source of truth.
function getThemeSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore((callback) => subscribeTo(THEME_EVENT, callback), getThemeSnapshot, () => "light" as Theme);
  const setTheme = useCallback((next: Theme) => {
    writeStored(THEME_KEY, next);
    document.documentElement.dataset.theme = next;
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);
  return [theme, setTheme];
}

function getLanguageSnapshot(): Language {
  return readStored(LANGUAGE_KEY) === "hi" ? "hi" : "en";
}

export function useLanguagePreference(): [Language, (language: Language) => void] {
  const language = useSyncExternalStore((callback) => subscribeTo(LANGUAGE_EVENT, callback), getLanguageSnapshot, () => "en" as Language);
  const setLanguage = useCallback((next: Language) => {
    writeStored(LANGUAGE_KEY, next);
    document.documentElement.lang = next;
    window.dispatchEvent(new Event(LANGUAGE_EVENT));
  }, []);
  return [language, setLanguage];
}

