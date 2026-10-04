"use client";

import { createContext, ReactNode, useContext, useEffect } from "react";
import { Language, useLanguagePreference } from "../lib/preferences";

type LanguageContextValue = { language: Language; setLanguage: (language: Language) => void };

const LanguageContext = createContext<LanguageContextValue>({ language: "en", setLanguage: () => undefined });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useLanguagePreference();

  useEffect(() => {
    // Lets end-to-end tests wait for real interactivity instead of guessing.
    document.documentElement.dataset.hydrated = "true";
    document.documentElement.lang = language === "hi" ? "hi" : "en";
  }, [language]);

  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() { return useContext(LanguageContext); }
