"use client";

import Link from "next/link";
import { CircleHelp, FileText, Image as ImageIcon, Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { useTheme } from "../lib/preferences";
import { useLanguage } from "./LanguageProvider";

export const SOURCE_URL = "https://github.com/arunyagoojar/easy-apply";

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="m9 14 2 2 4-4" />
      </svg>
    </span>
  );
}

export function AppHeader({ section, guard }: { section?: "image" | "pdf"; guard?: boolean }) {
  const { language, setLanguage, t } = useLanguage();
  const [theme, setTheme] = useTheme();

  // While a workspace holds files, confirm before an in-app link throws them away.
  useEffect(() => {
    if (!guard) return;
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      if (!window.confirm(t("common.leaveWarning"))) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [guard, t]);

  return (
    <header className="header">
      <Link className="brand" href="/" aria-label={`EasyApply, ${t("nav.home")}`}>
        <BrandMark />
        <span>EasyApply</span>
      </Link>
      <nav className="nav" aria-label="Tools">
        <Link className="nav-link" href="/tools/image" aria-current={section === "image" ? "page" : undefined}>
          <ImageIcon size={17} /><span>{t("nav.image")}</span>
        </Link>
        <Link className="nav-link" href="/tools/pdf" aria-current={section === "pdf" ? "page" : undefined}>
          <FileText size={17} /><span>{t("nav.pdf")}</span>
        </Link>
      </nav>
      <div className="header-actions">
        <button className="lang-button" lang={language === "en" ? "hi" : "en"} onClick={() => setLanguage(language === "en" ? "hi" : "en")} aria-label={t("lang.label")}>
          {t("lang.button")}
        </button>
        <button className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? t("theme.toLight") : t("theme.toDark")} title={theme === "dark" ? t("theme.toLight") : t("theme.toDark")}>
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <Link className="icon-btn" href="/privacy-faq" aria-label={t("nav.help")} title={t("nav.help")}>
          <CircleHelp size={18} />
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useLanguage();
  return (
    <footer className="footer">
      <span>© EasyApply · {t("footer.note")}</span>
      <Link href="/privacy-faq">{t("footer.help")}</Link>
      <a href={SOURCE_URL} target="_blank" rel="noreferrer">{t("footer.source")}</a>
    </footer>
  );
}
