"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";

export type Language = "en" | "hi";
type LanguageContextValue = { language: Language; setLanguage: (language: Language) => void };

const LanguageContext = createContext<LanguageContextValue>({ language: "en", setLanguage: () => undefined });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const saved = localStorage.getItem("easyapply-language");
    if (saved === "hi") setLanguageState("hi");
  }, []);

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    localStorage.setItem("easyapply-language", next);
    document.documentElement.lang = next === "hi" ? "hi" : "en";
  };

  useEffect(() => { document.documentElement.lang = language === "hi" ? "hi" : "en"; }, [language]);

  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() { return useContext(LanguageContext); }
