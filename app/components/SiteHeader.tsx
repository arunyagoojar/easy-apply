"use client";

import Link from "next/link";
import { Check, ChevronDown, FileImage, FileSignature, Files, Image as ImageIcon, Languages, Menu, Moon, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLanguage } from "./LanguageProvider";

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <Check size={14} strokeWidth={3} />
    </span>
  );
}

export function SiteHeader({ onPrivacyFaq }: { onPrivacyFaq?: () => void }) {
  const [dark, setDark] = useState(true);
  const [open, setOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const { language, setLanguage } = useLanguage();

  useEffect(() => {
    const saved = localStorage.getItem("easyapply-theme");
    const next = saved !== "light";
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("easyapply-theme", next ? "dark" : "light");
  };

  const links = [
    { href: "/tools/passport-photo", label: language === "hi" ? "पासपोर्ट फोटो" : "Passport photo", icon: FileImage },
    { href: "/tools/signature", label: language === "hi" ? "हस्ताक्षर" : "Signature", icon: FileSignature },
    { href: "/tools/pdf", label: language === "hi" ? "PDF टूलकिट" : "PDF toolkit", icon: Files },
    { href: "/tools/image", label: language === "hi" ? "इमेज टूलकिट" : "Image toolkit", icon: ImageIcon },
  ];

  return (
    <header className="nav-wrap">
      <nav className="nav container" aria-label="Main navigation">
        <Link className="brand" href="/" aria-label="EasyApply home">
          <BrandMark />
          <span>EasyApply</span>
        </Link>
        <div className="nav-links route-links">
          {links.map(({ href, label }) => <Link key={href} href={href}>{label}</Link>)}
          {onPrivacyFaq && <button className="nav-text-button" onClick={onPrivacyFaq}>{language === "hi" ? "गोपनीयता और FAQ" : "Privacy & FAQ"}</button>}
        </div>
        <div className="nav-actions">
          <div className="language-menu-wrap">
            <button className="icon-button" onClick={() => setLanguageOpen((value) => !value)} aria-label="Choose language" aria-expanded={languageOpen}><Languages size={18} /></button>
            {languageOpen && <div className="language-menu"><button className={language === "en" ? "active" : ""} onClick={() => { setLanguage("en"); setLanguageOpen(false); }}><span>EN</span><div><b>English</b><small>English</small></div>{language === "en" && <Check size={15} />}</button><button className={language === "hi" ? "active" : ""} onClick={() => { setLanguage("hi"); setLanguageOpen(false); }}><span>हि</span><div><b>हिन्दी</b><small>Hindi</small></div>{language === "hi" && <Check size={15} />}</button></div>}
          </div>
          <button className="icon-button" onClick={toggleTheme} aria-label={`Switch to ${dark ? "light" : "dark"} mode`}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Link className="nav-cta" href="/tools/passport-photo">{language === "hi" ? "शुरू करें" : "Start preparing"}</Link>
          <button className="icon-button menu-button" onClick={() => setOpen((value) => !value)} aria-label="Toggle menu">
            {open ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </nav>
      {open && (
        <div className="mobile-menu route-mobile-menu">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}>{Icon && <Icon size={16} />}{label}</Link>
          ))}
          {onPrivacyFaq && <button className="mobile-info-button" onClick={() => { setOpen(false); onPrivacyFaq(); }}>{language === "hi" ? "गोपनीयता और FAQ" : "Privacy & FAQ"}</button>}
        </div>
      )}
    </header>
  );
}
