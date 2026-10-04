"use client";

import Link from "next/link";
import { AppHeader } from "./AppHeader";
import { useT } from "./LanguageProvider";

export function NotFound() {
  const t = useT();
  return (
    <div className="app">
      <AppHeader />
      <main className="doc" style={{ textAlign: "center", paddingTop: 80 }}>
        <h1>{t("notFound.title")}</h1>
        <p className="lead">{t("notFound.body")}</p>
        <Link className="btn btn-primary" href="/">{t("notFound.cta")}</Link>
      </main>
    </div>
  );
}
