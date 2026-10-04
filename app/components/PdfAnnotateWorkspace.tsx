"use client";

import { Download, FilePen, PenLine, Plus, Trash2, WandSparkles, X } from "lucide-react";
import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { rgb } from "pdf-lib";
import { getPdfPageCount, renderPageToDataUrl } from "../lib/pdfjs";
import { useLanguage } from "./LanguageProvider";

export type AnnotateMode = "sign" | "edit";
type AnnotateDetails = { title: string; hiTitle: string; description: string; hiDescription: string; icon: typeof PenLine };

type BaseItem = { id: string; pageIndex: number; xPct: number; yPct: number; wPct: number; hPct: number };
type ImageItem = BaseItem & { type: "image"; file: File; url: string; aspect: number };
type TextItem = BaseItem & { type: "text"; text: string; fontSize: number; fontFamily: string; color: string };
type CoverItem = BaseItem & { type: "cover"; color: string };
type AnnotateItem = ImageItem | TextItem | CoverItem;
type DragState = {
  kind: "move" | "resize";
  item: AnnotateItem;
  clientX: number;
  clientY: number;
  stage: { width: number; height: number };
} | null;

const FONT_OPTIONS = [
  ["Helvetica", "Helvetica"],
  ["Helvetica-Bold", "Helvetica Bold"],
  ["TimesRoman", "Times Roman"],
  ["Courier", "Courier"],
] as const;

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function hexToRgbColor(hex: string) {
  const clean = hex.replace("#", "");
  const value = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
  const channel = (slice: string) => Math.min(1, Math.max(0, (parseInt(slice, 16) || 0) / 255));
  return rgb(channel(value.slice(0, 2)), channel(value.slice(2, 4)), channel(value.slice(4, 6)));
}

export function PdfAnnotateWorkspace({ mode, details }: { mode: AnnotateMode; details: AnnotateDetails }) {
  const { language } = useLanguage();
  const hi = language === "hi";
  const isSign = mode === "sign";
  const HeadingIcon = details.icon;

  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [pagePreview, setPagePreview] = useState("");
  const [pagePoints, setPagePoints] = useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [signature, setSignature] = useState<{ file: File; url: string; aspect: number } | null>(null);
  const [items, setItems] = useState<AnnotateItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [prepared, setPrepared] = useState<{ blob: Blob; url: string; name: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stageScale, setStageScale] = useState(0);
  const bufferRef = useRef<ArrayBuffer | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const pageItems = items.filter((item) => item.pageIndex === currentPage);
  const selectedItem = items.find((item) => item.id === selectedId && item.pageIndex === currentPage) ?? null;

  const loadPdf = useCallback(async (nextFile: File) => {
    bufferRef.current = null;
    setPagePreview("");
    setPagePoints(null);
    setItems([]);
    setSelectedId(null);
    setCurrentPage(0);
    setPrepared((current) => { if (current) URL.revokeObjectURL(current.url); return null; });
    setMessage("");
    setRendering(true);
    setFile(nextFile);
    try {
      const buffer = await nextFile.arrayBuffer();
      const [rendered, count] = await Promise.all([renderPageToDataUrl(buffer, 0, 980), getPdfPageCount(buffer)]);
      bufferRef.current = buffer;
      setPagePreview(rendered.dataUrl);
      setPagePoints({ width: rendered.width, height: rendered.height });
      setPageCount(count);
    } catch (error) {
      setFile(null);
      setMessage(error instanceof Error ? error.message : "This PDF could not be opened.");
    } finally { setRendering(false); }
  }, []);

  useEffect(() => {
    if (!file || !bufferRef.current || currentPage === 0) return;
    let cancelled = false;
    setRendering(true);
    setPagePreview("");
    (async () => {
      try {
        const rendered = await renderPageToDataUrl(bufferRef.current!, currentPage, 980);
        if (cancelled) return;
        setPagePreview(rendered.dataUrl);
        setPagePoints({ width: rendered.width, height: rendered.height });
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "This page could not be rendered.");
      } finally { if (!cancelled) setRendering(false); }
    })();
    return () => { cancelled = true; };
  }, [currentPage, file]);

  useEffect(() => () => {
    if (prepared) URL.revokeObjectURL(prepared.url);
  }, [prepared]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !pagePoints) return;
    // ResizeObserver fires once on observe(), so the first measurement lands
    // asynchronously without cascading renders.
    const observer = new ResizeObserver(() => {
      setStageScale(wrap.getBoundingClientRect().width / pagePoints.width);
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [pagePreview, pagePoints]);

  const acceptPdf = (incoming: File | undefined) => {
    if (!incoming) return;
    if (incoming.type !== "application/pdf" && !incoming.name.toLowerCase().endsWith(".pdf")) {
      setMessage(hi ? "कृपया PDF फ़ाइल चुनें।" : "Please choose a PDF file.");
      return;
    }
    loadPdf(incoming);
  };

  const acceptSignature = async (incoming: File | undefined) => {
    if (!incoming) return;
    const url = URL.createObjectURL(incoming);
    const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("This image format is not supported by your browser."));
        image.src = url;
      });
    } catch (error) {
      URL.revokeObjectURL(url);
      setMessage(error instanceof Error ? error.message : "The signature image could not be opened.");
      return;
    }
    setSignature((current) => { if (current) URL.revokeObjectURL(current.url); return { file: incoming, url, aspect: image.naturalWidth / Math.max(1, image.naturalHeight) }; });
    setMessage("");
  };

  const stageSize = () => {
    const wrap = wrapRef.current;
    if (!wrap) return null;
    const rect = wrap.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  };

  const imageHeightPct = (wPct: number, aspect: number) => {
    const stage = stageSize();
    if (!stage) return (wPct / Math.max(.05, aspect));
    const widthPx = (wPct / 100) * stage.width;
    return (widthPx / Math.max(.05, aspect)) / stage.height * 100;
  };

  const addItem = (type: "image" | "text" | "cover") => {
    if (!file) return;
    const id = uid();
    if (type === "image") {
      if (!signature) return;
      const wPct = 30;
      const item: ImageItem = { id, type: "image", pageIndex: currentPage, xPct: 35, yPct: 42, wPct, hPct: imageHeightPct(wPct, signature.aspect), file: signature.file, url: signature.url, aspect: signature.aspect };
      setItems((current) => [...current, item]);
    } else if (type === "text") {
      const item: TextItem = { id, type: "text", pageIndex: currentPage, xPct: 22, yPct: 46, wPct: 56, hPct: 6, text: hi ? "नया टेक्स्ट" : "New text", fontSize: 16, fontFamily: "Helvetica", color: "#111111" };
      setItems((current) => [...current, item]);
    } else {
      const item: CoverItem = { id, type: "cover", pageIndex: currentPage, xPct: 20, yPct: 40, wPct: 60, hPct: 7, color: "#ffffff" };
      setItems((current) => [...current, item]);
    }
    setSelectedId(id);
    setMessage("");
  };

  const updateItem = (id: string, patch: Partial<AnnotateItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } as AnnotateItem : item)));
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));

  };

  const clearPage = () => {
    setItems((current) => current.filter((item) => item.pageIndex !== currentPage));
    setSelectedId(null);
  };

  const beginItemDrag = (event: ReactPointerEvent<HTMLDivElement>, item: AnnotateItem, kind: "move" | "resize") => {
    const stage = stageSize();
    if (!stage) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { kind, item, clientX: event.clientX, clientY: event.clientY, stage };
    setSelectedId(item.id);
    setDragging(true);
  };

  const moveItem = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = dragRef.current;
    if (!interaction) return;
    event.preventDefault();
    const dxPct = ((event.clientX - interaction.clientX) / interaction.stage.width) * 100;
    const dyPct = ((event.clientY - interaction.clientY) / interaction.stage.height) * 100;
    const start = interaction.item;
    if (interaction.kind === "move") {
      const nextX = Math.max(0, Math.min(100 - start.wPct, start.xPct + dxPct));
      const nextY = Math.max(0, Math.min(100 - start.hPct, start.yPct + dyPct));
      updateItem(start.id, { xPct: nextX, yPct: nextY });
      return;
    }
    const nextW = Math.max(2, Math.min(100 - start.xPct, start.wPct + dxPct));
    if (start.type === "image") {
      updateItem(start.id, { wPct: nextW, hPct: imageHeightPct(nextW, start.aspect) });
    } else if (start.type === "text") {
      const scale = nextW / start.wPct;
      updateItem(start.id, { wPct: nextW, fontSize: Math.min(96, Math.max(6, Math.round(start.fontSize * scale))) });
    } else {
      const nextH = Math.max(1, Math.min(100 - start.yPct, start.hPct + dyPct));
      updateItem(start.id, { wPct: nextW, hPct: nextH });
    }
  };

  const endItemDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setDragging(false);
  };

  const prepare = async () => {
    if (!file) { setMessage(hi ? "पहले PDF जोड़ें।" : "Add a PDF first."); return; }
    if (!items.length) { setMessage(hi ? "कम से कम एक आइटम जोड़ें।" : isSign ? "Place your signature on a page first." : "Add text or a cover box first."); return; }
    setProcessing(true); setMessage("");
    try {
      const { PDFDocument } = await import("pdf-lib");
      const document = await PDFDocument.load(await file.arrayBuffer());
      const fonts = new Map<string, Awaited<ReturnType<typeof document.embedFont>>>();
      const embedFont = async (name: string) => {
        let font = fonts.get(name);
        if (!font) { font = await document.embedFont(name as Parameters<typeof document.embedFont>[0]); fonts.set(name, font); }
        return font;
      };
      const images = new Map<string, Awaited<ReturnType<typeof document.embedPng>>>();
      const embedImage = async (item: ImageItem) => {
        let image = images.get(item.id);
        if (!image) {
          const bytes = await item.file.arrayBuffer();
          const head = new Uint8Array(bytes.slice(0, 8));
          image = head[0] === 0x89 && head[1] === 0x50 ? await document.embedPng(bytes) : await document.embedJpg(bytes);
          images.set(item.id, image);
        }
        return image;
      };
      for (const item of items) {
        const page = document.getPage(Math.min(item.pageIndex, document.getPageCount() - 1));
        const { width, height } = page.getSize();
        const x = (item.xPct / 100) * width;
        const w = (item.wPct / 100) * width;
        if (item.type === "cover") {
          const h = (item.hPct / 100) * height;
          page.drawRectangle({ x, y: height - (item.yPct / 100) * height - h, width: w, height: h, color: hexToRgbColor(item.color) });
        } else if (item.type === "image") {
          const h = (item.hPct / 100) * height;
          const image = await embedImage(item);
          page.drawImage(image, { x, y: height - (item.yPct / 100) * height - h, width: w, height: h });
        } else {
          const font = await embedFont(item.fontFamily);
          const lineHeight = item.fontSize * 1.25;
          const baseline = height - (item.yPct / 100) * height - item.fontSize;
          page.drawText(item.text, { x, y: baseline, size: item.fontSize, font, color: hexToRgbColor(item.color), lineHeight });
        }
      }
      const bytes = await document.save();
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      setPrepared((current) => { if (current) URL.revokeObjectURL(current.url); return { blob, url: URL.createObjectURL(blob), name: isSign ? "easyapply-signed.pdf" : "easyapply-edited.pdf" }; });
      setMessage(hi ? "फ़ाइल तैयार है।" : "Your file is ready.");
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      setMessage(/encoding|winansi|glyph/i.test(raw)
        ? hi ? "मानक PDF फ़ॉन्ट केवल लैटिन अक्षर सपोर्ट करते हैं — इस टेक्स्ट में ऐसे अक्षर हैं जिन्हें वे एन्कोड नहीं कर सकते।" : "Standard PDF fonts support Latin characters only — this text contains characters they cannot encode."
        : raw);
    } finally { setProcessing(false); }
  };

  const download = () => {
    if (!prepared) return;
    const anchor = document.createElement("a");
    anchor.href = prepared.url;
    anchor.download = prepared.name;
    anchor.click();
  };



  return (
    <div className="full-tool-workspace annotate-workspace">
      <section className="tool-canvas-column">
        <div className="panel-heading">
          <div>
            <span className="tool-icon small"><HeadingIcon size={18} /></span>
            <span>
              <h1>{hi ? details.hiTitle : details.title}</h1>
              <small>{hi ? details.hiDescription : details.description}</small>
            </span>
          </div>
          <span className="local-badge">🔒 {hi ? "कभी अपलोड नहीं" : "Never uploaded"}</span>
        </div>

        <input ref={pdfInputRef} type="file" accept=".pdf" hidden onChange={(event) => { acceptPdf(event.target.files?.[0]); event.target.value = ""; }} />
        <input ref={imageInputRef} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => { acceptSignature(event.target.files?.[0]); event.target.value = ""; }} />

        {!file ? (
          <div className={`large-drop-zone ${rendering ? "rendering" : ""}`} onClick={() => pdfInputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") pdfInputRef.current?.click(); }}>
            <span className="large-upload-icon"><Plus size={30} /></span>
            <h2>{hi ? "PDF यहाँ छोड़ें या चुनें" : "Drop a PDF here or choose one"}</h2>
            <p>{hi ? "दस्तावेज़ इसी डिवाइस पर खुलेगा।" : "Your document opens on this device only."}</p>
            <button className="button button-primary" onClick={(event) => { event.stopPropagation(); pdfInputRef.current?.click(); }}><Plus size={17} /> {hi ? "PDF चुनें" : "Select a PDF"}</button>
            <small>PDF</small>
          </div>
        ) : (
          <div className="annotate-stage-wrap">
            <div className={`annotate-stage ${dragging ? "dragging" : ""}`} ref={stageRef} onPointerMove={moveItem} onPointerUp={endItemDrag} onPointerCancel={endItemDrag}>
              {pagePreview ? (
                <div className="annotate-canvas-wrap" ref={wrapRef}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- rendered locally by pdf.js into a data URL */}
                  <img src={pagePreview} alt={hi ? `पेज ${currentPage + 1}` : `Page ${currentPage + 1}`} draggable={false} />
                  {pageItems.map((item) => {
                    const selected = item.id === selectedId;
                    const common = {
                      "data-item-id": item.id,
                      onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => beginItemDrag(event, item, (event.target as HTMLElement).dataset.resize ? "resize" : "move"),
                      style: { left: `${item.xPct}%`, top: `${item.yPct}%`, width: `${item.wPct}%` },
                    };
                    if (item.type === "cover") {
                      return (
                        <div key={item.id} className={`annotate-item annotate-cover ${selected ? "selected" : ""}`} {...common}>
                          <span className="annotate-swatch" style={{ backgroundColor: item.color }} />
                          <span className="annotate-resize" data-resize />
                        </div>
                      );
                    }
                    if (item.type === "image") {
                      return (
                        <div key={item.id} className={`annotate-item annotate-image ${selected ? "selected" : ""}`} {...common} style={{ ...common.style, height: `${item.hPct}%` }}>
                          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                          <img src={item.url} alt="" draggable={false} />
                          <span className="annotate-resize" data-resize />
                        </div>
                      );
                    }
                    return (
                      <div key={item.id} className={`annotate-item annotate-text ${selected ? "selected" : ""}`} {...common}>
                        <span className="annotate-text-body" style={{ fontSize: Math.max(6, item.fontSize * (stageScale || 0.75) * 1.15), fontFamily: `${item.fontFamily.includes("Bold") ? "700 " : ""}${item.fontFamily.includes("Times") ? "'Times New Roman', serif" : item.fontFamily.includes("Courier") ? "ui-monospace, monospace" : "var(--font-geist-sans), sans-serif"}`, color: item.color, lineHeight: 1.25 }}>
                          {item.text || " "}
                        </span>
                        <span className="annotate-resize" data-resize />
                      </div>
                    );
                  })}
                </div>
              ) : <div className="annotate-rendering"><span className="button-loader" /> {hi ? "पेज बन रहा है…" : "Rendering page…"}</div>}
            </div>

            <div className="annotate-pagebar">
              <button className="icon-button" onClick={() => setCurrentPage((value) => Math.max(0, value - 1))} disabled={currentPage === 0 || rendering} aria-label={hi ? "पिछला पेज" : "Previous page"}><ChevronLeft size={17} /></button>
              <span>{hi ? `पेज ${currentPage + 1} / ${pageCount || 1}` : `Page ${currentPage + 1} of ${pageCount || 1}`}</span>
              <button className="icon-button" onClick={() => setCurrentPage((value) => Math.min(pageCount - 1, value + 1))} disabled={currentPage >= pageCount - 1 || rendering} aria-label={hi ? "अगला पेज" : "Next page"}><ChevronRight size={17} /></button>
              {items.length > 0 && <button className="annotate-clear" onClick={clearPage}><Trash2 size={14} /> {hi ? "इस पेज के आइटम हटाएँ" : "Clear this page"}</button>}
            </div>

            <div className="selected-files">
              <div>
                <span className="file-kind">{isSign ? <PenLine size={18} /> : <FilePen size={18} />}</span>
                <p><b>{file.name}</b><small>{pageCount ? (hi ? `${pageCount} पेज` : `${pageCount} pages`) : "…"}</small></p>
                <button onClick={() => { setFile(null); setPageCount(0); setItems([]); setPagePreview(""); bufferRef.current = null; }} aria-label={hi ? "PDF हटाएँ" : "Remove PDF"}><X size={15} /></button>
              </div>
              <button className="add-another" onClick={() => pdfInputRef.current?.click()}><Plus size={16} /> {hi ? "दूसरी PDF" : "Replace PDF"}</button>
            </div>
          </div>
        )}

        <div className="privacy-inline"><span>🔒</span><div><b>{hi ? "आपकी फ़ाइलें इसी डिवाइस पर रहती हैं।" : "Your files never leave this device."}</b><p>{hi ? "साइनिंग और एडिटिंग ब्राउज़र में ही होती है।" : "Signing and editing happen entirely inside this browser."}</p></div></div>
      </section>

      <aside className="tool-controls-column">
        {isSign && (
          <div className="control-section">
            <label htmlFor="signature-image">{hi ? "हस्ताक्षर इमेज" : "Signature image"}</label>
            <div className="signature-row">
              {signature ? (
                <span className="signature-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                  <img src={signature.url} alt="" />
                </span>
              ) : null}
              <button className="button button-secondary" id="signature-image" onClick={() => imageInputRef.current?.click()}><Plus size={15} /> {signature ? (hi ? "बदलें" : "Replace") : hi ? "चुनें" : "Choose image"}</button>
            </div>
            <p className="control-help">{hi ? "PNG (पारदर्शी) सबसे अच्छा दिखता है।" : "A transparent PNG looks best on the page."}</p>
          </div>
        )}

        <div className="control-section">
          <label>{hi ? "पेज पर जोड़ें" : "Add to the page"}</label>
          <div className="annotate-actions">
            {isSign ? (
              <button className="button button-secondary" onClick={() => addItem("image")} disabled={!file || !signature || rendering || !pagePreview}><PenLine size={15} /> {hi ? "हस्ताक्षर रखें" : "Place signature"}</button>
            ) : (
              <>
                <button className="button button-secondary" onClick={() => addItem("text")} disabled={!file || rendering || !pagePreview}><FilePen size={15} /> {hi ? "टेक्स्ट जोड़ें" : "Add text"}</button>
                <button className="button button-secondary" onClick={() => addItem("cover")} disabled={!file || rendering || !pagePreview}><Plus size={15} /> {hi ? "कवर बॉक्स" : "Add cover box"}</button>
              </>
            )}
          </div>
          <p className="control-help">{hi ? "आइटम को खींचकर रखें, कोने से आकार बदलें। टेक्स्ट बदलने के लिए आइटम चुनें।" : "Drag items to position them and pull the corner to resize. Select an item to edit its text, size and colour."}</p>
        </div>

        {selectedItem && (
          <div className="control-section annotate-selected">
            <label>{hi ? "चयनित आइटम" : "Selected item"}</label>
            {selectedItem.type === "text" && (
              <>
                <textarea
                  className="annotate-textarea"
                  value={(selectedItem as TextItem).text}
                  onChange={(event) => updateItem(selectedItem.id, { text: event.target.value } as Partial<TextItem>)}
                  rows={2}
                  aria-label={hi ? "टेक्स्ट" : "Text"}
                />
                <div className="annotate-row">
                  <label className="annotate-inline-label">
                    <span>{hi ? "आकार" : "Size"}</span>
                    <input type="number" min={6} max={96} value={(selectedItem as TextItem).fontSize} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) updateItem(selectedItem.id, { fontSize: Math.min(96, Math.max(6, Math.round(next))) } as Partial<TextItem>); }} />
                    <small>pt</small>
                  </label>
                  <select className="annotate-font" value={(selectedItem as TextItem).fontFamily} onChange={(event) => updateItem(selectedItem.id, { fontFamily: event.target.value } as Partial<TextItem>) } aria-label={hi ? "फ़ॉन्ट" : "Font"}>
                    {FONT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div className="annotate-row">
                  <input type="color" value={(selectedItem as TextItem).color} onChange={(event) => updateItem(selectedItem.id, { color: event.target.value } as Partial<TextItem>)} aria-label={hi ? "रंग" : "Colour"} />
                  {["#111111", "#ffffff", "#d0342c", "#1067cc"].map((color) => <button key={color} className="annotate-swatch-button" style={{ backgroundColor: color }} onClick={() => updateItem(selectedItem.id, { color } as Partial<TextItem>)} aria-label={color} />)}
                </div>
              </>
            )}
            {selectedItem.type === "cover" && (
              <div className="annotate-row">
                <input type="color" value={(selectedItem as CoverItem).color} onChange={(event) => updateItem(selectedItem.id, { color: event.target.value } as Partial<CoverItem>)} aria-label={hi ? "कवर रंग" : "Cover colour"} />
                <span className="annotate-hint">{hi ? "कवर का रंग" : "Cover colour"}</span>
              </div>
            )}
            <button className="annotate-delete" onClick={() => removeItem(selectedItem.id)}><Trash2 size={14} /> {hi ? "आइटम हटाएँ" : "Delete item"}</button>
          </div>
        )}

        <div className="requirement-summary">
          <div className="requirement-summary-title"><span><CheckCircle2 size={19} /> {hi ? "सारांश" : "Summary"}</span><small>{prepared ? (hi ? "तैयार" : "Prepared") : hi ? "डाउनलोड से पहले" : "Before download"}</small></div>
          <div><span>{hi ? "PDF" : "Document"}</span><b>{file ? file.name : "—"}</b></div>
          <div><span>{hi ? "पेज" : "Page"}</span><b>{pageCount ? `${currentPage + 1} / ${pageCount}` : "—"}</b></div>
          <div><span>{hi ? isSign ? "हस्ताक्षर प्लेसमेंट" : "एडिट" : isSign ? "Signatures placed" : "Edits"}</span><b>{items.length}</b></div>
          <div><span>{hi ? "आउटपुट फ़ाइल आकार" : "Output file size"}</span><b>{prepared ? `${(prepared.blob.size / 1024).toFixed(1)} KB` : hi ? "तैयारी के बाद" : "After preparing"}</b></div>
        </div>

        <button className="button button-primary primary-process" onClick={prepare} disabled={!file || processing}>{processing ? <><span className="button-loader" /> {hi ? "तैयार हो रहा है…" : "Preparing…"}</> : <><WandSparkles size={18} /> {hi ? "PDF तैयार करें" : isSign ? "Prepare signed PDF" : "Prepare edited PDF"}</>}</button>
        {prepared && <button className="button button-success primary-process" onClick={download}><Download size={18} /> {hi ? "तैयार फ़ाइल डाउनलोड करें" : "Download prepared file"}</button>}
        {message && <p className={prepared ? "tool-message success" : "tool-message"}>{prepared ? <CheckCircle2 size={16} /> : <Info size={16} />}{message}</p>}
      </aside>
    </div>
  );
}
