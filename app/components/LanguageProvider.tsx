"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo } from "react";
import { en, hi, type MessageKey } from "../lib/messages";
import { Language, useLanguagePreference } from "../lib/preferences";

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;
type LanguageContextValue = { language: Language; setLanguage: (language: Language) => void; t: Translate };

export function translate(language: Language, key: MessageKey, vars?: Record<string, string | number>) {
  const template: string = (language === "hi" ? hi[key] : en[key]) ?? en[key] ?? key;
  return vars ? template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : template;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  setLanguage: () => undefined,
  t: (key, vars) => translate("en", key, vars),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useLanguagePreference();

  useEffect(() => {
    document.documentElement.lang = language;
    // Lets end-to-end tests wait for real interactivity instead of guessing.
    document.documentElement.dataset.hydrated = "true";
  }, [language]);

  const t = useCallback<Translate>((key, vars) => translate(language, key, vars), [language]);
  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useT() {
  return useContext(LanguageContext).t;
}
