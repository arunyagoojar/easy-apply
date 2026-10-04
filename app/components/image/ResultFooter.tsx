"use client";

import { CircleAlert, CircleCheck, Download, Ellipsis, Info, Printer } from "lucide-react";
import { useState } from "react";
import type { Produced } from "../../lib/image/produce";
import type { ImageSettings } from "../../lib/image/settings";
import { formatBytes, fromPixels, formatLength } from "../../lib/units";
import { useT } from "../LanguageProvider";
import { Dialog, Menu, Spinner } from "../ui";

export type OutputView = { result?: Produced; url?: string; error?: string } | null;

type Check = { tone: "ok" | "warn" | "info"; text: string };

function formatName(format: Produced["format"]) {
  return format === "jpeg" ? "JPG" : format.toUpperCase();
}

export function ResultFooter({ output, busy, settings, itemCount, exporting, onDownload, onDownloadAll, onSheet, showSheets, disabled }: {
  output: OutputView;
  busy: boolean;
  settings: ImageSettings;
  itemCount: number;
  exporting: { done: number; total: number } | null;
  onDownload: () => void;
  onDownloadAll: () => void;
  onSheet: (paper: "4x6" | "a4") => void;
  showSheets: boolean;
  disabled: boolean;
}) {
  const t = useT();
  const [preview, setPreview] = useState(false);
  const result = output?.result;

  const checks: Check[] = [];
  if (result) {
    const physical = settings.unit !== "px" && settings.sizeMode === "exact"
      ? ` · ${t("image.result.physical", { w: formatLength(fromPixels(result.width, settings.unit, settings.dpi), settings.unit).replace(` ${settings.unit}`, ""), h: formatLength(fromPixels(result.height, settings.unit, settings.dpi), settings.unit) })}`
      : "";
    checks.push({ tone: settings.sizeMode === "exact" && !result.scaledDown ? "ok" : "info", text: `${result.width} × ${result.height} px${physical}` });
    const max = settings.maxKb ? settings.maxKb * 1024 : null;
    const min = settings.minKb ? settings.minKb * 1024 : null;
    const sizeText = formatBytes(result.size);
    if (max && result.size > max) checks.push({ tone: "warn", text: `${sizeText} · ${t("image.result.overMax", { max: formatBytes(max) })}` });
    else if (min && result.size < min) checks.push({ tone: "warn", text: `${sizeText} · ${t("image.result.underMin", { min: formatBytes(min) })}` });
    else if (max || min) checks.push({ tone: "ok", text: `${sizeText} · ${max ? t("image.result.maxOk", { max: formatBytes(max) }) : t("image.result.minOk", { min: formatBytes(min) })}` });
    else checks.push({ tone: "info", text: sizeText });
    checks.push({ tone: "ok", text: `${formatName(result.format)}${result.format !== "webp" ? ` · ${t("image.result.dpi", { dpi: settings.dpi })}` : ""}` });
  }

  const notes: string[] = [];
  if (result?.overMax && settings.maxKb) notes.push(t("image.result.cantReach", { max: formatBytes(settings.maxKb * 1024), format: formatName(result.format) }));
  if (result?.padded) notes.push(t("image.result.padded"));
  if (result?.scaledDown) notes.push(t("image.result.scaledDown", { w: result.width, h: result.height }));
  if (result?.webpFallback) notes.push(t("image.result.webpFallback"));

  const sheetItems = [
    { label: t("image.sheet4x6"), icon: <Printer size={16} />, onSelect: () => onSheet("4x6") },
    { label: t("image.sheetA4"), icon: <Printer size={16} />, onSelect: () => onSheet("a4") },
  ];

  return (
    <div className="side-footer">
      <div className="result" aria-live="polite">
        <button type="button" className="result-thumb checker" onClick={() => result && setPreview(true)} disabled={!result} aria-label={t("image.result.preview")} title={t("image.result.preview")}>
          {output?.url && result?.format !== "pdf" ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL of the generated file
            <img src={output.url} alt="" />
          ) : result?.format === "pdf" ? <b style={{ fontSize: 13, color: "var(--danger)" }}>PDF</b> : null}
          {busy ? <Spinner /> : null}
        </button>
        <div className="checks">
          <b style={{ fontSize: 13 }}>{busy ? t("image.result.updating") : t("image.result.title")}</b>
          {output?.error ? <span className="check warn"><CircleAlert size={15} /><span>{output.error}</span></span> : null}
          {checks.map((check) => (
            <span key={check.text} className={`check ${check.tone}`}>
              {check.tone === "ok" ? <CircleCheck size={15} /> : check.tone === "warn" ? <CircleAlert size={15} /> : <Info size={15} />}
              <span>{check.text}</span>
            </span>
          ))}
        </div>
      </div>
      {notes.map((note) => <p key={note} className={`note ${result?.overMax ? "note-warning" : ""}`} style={{ margin: 0 }}><Info size={15} />{note}</p>)}

      {exporting ? (
        <div className="field">
          <span className="hint">{t("image.preparing", { done: exporting.done, total: exporting.total })}</span>
          <div className="progress"><span style={{ width: `${(exporting.done / Math.max(1, exporting.total)) * 100}%` }} /></div>
        </div>
      ) : null}

      <div className="row">
        {itemCount > 1 ? (
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={onDownloadAll} disabled={disabled || !!exporting}>
            <Download size={18} />{settings.format === "pdf" && settings.combinePdf ? t("image.downloadPdf") : t("image.downloadAll", { count: itemCount })}
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={onDownload} disabled={disabled || !result || busy || !!exporting}>
            <Download size={18} />{t("image.download")}
          </button>
        )}
        {itemCount > 1 || showSheets ? (
          <Menu
            label={t("image.downloadMore")}
            icon={<Ellipsis size={18} />}
            buttonClassName="btn btn-lg"
            items={[
              ...(itemCount > 1 ? [{ label: t("image.downloadEach"), icon: <Download size={16} />, onSelect: onDownload, disabled: !result || busy }] : []),
              ...(showSheets ? sheetItems.map((item) => ({ ...item, disabled: !result || busy })) : []),
            ]}
          />
        ) : null}
      </div>

      <Dialog open={preview && !!result} onClose={() => setPreview(false)} title={t("image.preview.title")} wide>
        {result && output?.url ? (
          <>
            <p className="hint" style={{ marginBottom: 10 }}>{t("image.preview.actual", { w: result.width, h: result.height, size: formatBytes(result.size) })}</p>
            <div className="preview-frame checker">
              {result.format === "pdf"
                ? <iframe title="PDF" src={output.url} style={{ width: "100%", height: "60vh", border: 0 }} />
                : (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL
                  <img src={output.url} alt="" style={{ width: result.width, maxWidth: "none" }} />
                )}
            </div>
          </>
        ) : null}
      </Dialog>
    </div>
  );
}
