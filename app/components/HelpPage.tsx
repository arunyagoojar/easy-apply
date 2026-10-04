"use client";

import { ChevronDown, Cpu, EyeOff, Trash2 } from "lucide-react";
import type { MessageKey } from "../lib/messages";
import { AppHeader, SiteFooter, SOURCE_URL } from "./AppHeader";
import { useT } from "./LanguageProvider";

const QUESTIONS: Array<[MessageKey, MessageKey]> = [
  ["help.q1", "help.a1"],
  ["help.q2", "help.a2"],
  ["help.q3", "help.a3"],
  ["help.q4", "help.a4"],
  ["help.q5", "help.a5"],
  ["help.q6", "help.a6"],
  ["help.q7", "help.a7"],
  ["help.q8", "help.a8"],
];

export function HelpPage() {
  const t = useT();
  const promises = [
    { icon: Cpu, title: t("help.local.title"), body: t("help.local.body") },
    { icon: EyeOff, title: t("help.noUpload.title"), body: t("help.noUpload.body") },
    { icon: Trash2, title: t("help.gone.title"), body: t("help.gone.body") },
  ];
  return (
    <div className="app">
      <AppHeader />
      <main className="doc">
        <h1>{t("help.title")}</h1>
        <p className="lead">{t("help.lead")}</p>
        <div className="promise-grid">
          {promises.map(({ icon: Icon, title, body }) => (
            <div key={title} className="promise">
              <Icon size={20} />
              <b>{title}</b>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <h2>{t("help.ai.title")}</h2>
        <p>{t("help.ai.body")}</p>
        <h2>{t("help.faq")}</h2>
        <div className="faq">
          {QUESTIONS.map(([question, answer]) => (
            <details key={question}>
              <summary>{t(question)}<ChevronDown size={17} /></summary>
              <p>{t(answer)}</p>
            </details>
          ))}
        </div>
        <p style={{ marginTop: 28 }}>{t("help.source")} <a className="link-btn" href={SOURCE_URL} target="_blank" rel="noreferrer">{t("help.sourceLink")}</a></p>
      </main>
      <SiteFooter />
    </div>
  );
}
