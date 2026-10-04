"use client";

import {
  Bold,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Minus,
  Plus,
  RectangleHorizontal,
  Signature,
  Trash2,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { clamp, rawBoxToView, viewBoxToRaw, viewDeltaToRaw, viewSize, type Quarter, type Rect } from "../../lib/geometry";
import { errorMessage, uid } from "../../lib/files";
import { decodeImage } from "../../lib/image/decode";
import { bytesToBlob, canvasBytes } from "../../lib/image/encode";
import { context2d, createCanvas, releaseCanvas } from "../../lib/image/render";
import { FONTS, LINE_HEIGHT, pageBox, totalRotation, type Annotation, type Asset, type FontId, type ImagePageSize, type PageItem, type SourceDoc, type TextAnnotation } from "../../lib/pdf/model";
import { renderPageView } from "../../lib/pdf/pageRender";
import type { PdfProxy } from "../../lib/pdf/pdfjs";
import { useT } from "../LanguageProvider";
import { Spinner, useFilePicker, useToast } from "../ui";
import { SignatureDialog } from "./SignatureDialog";

type Tool = "signature" | "text" | "date" | "check" | "cross" | "whiteout" | "image";

const TEXT_COLORS = ["#111111", "#1b3aa0", "#c0262d"];
const RECT_COLORS = ["#ffffff", "#000000"];

let measureContext: CanvasRenderingContext2D | null = null;

/** Size of a text block in points (same fonts as the saved PDF). */
function measureText(text: string, size: number, font: FontId, bold: boolean) {
  measureContext ??= context2d(createCanvas(1, 1));
  measureContext.font = `${bold ? "700 " : ""}${size}px ${FONTS[font].css}`;
  const lines = text.split("\n");
  const width = Math.max(size * 0.5, ...lines.map((line) => measureContext!.measureText(line || " ").width));
  return { width: width + size * 0.2, height: lines.length * LINE_HEIGHT * size };
}

function today() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
}

export function PageEditor({ pages, sources, getProxy, imagePageSize, startIndex, intent, signatures, onSignature, onAnnotations, onClose }: {
  pages: PageItem[];
  sources: Record<string, SourceDoc>;
  getProxy: (sourceId: string) => PdfProxy | undefined;
  imagePageSize: ImagePageSize;
  startIndex: number;
  intent?: "sign" | "edit";
  signatures: Asset[];
  onSignature: (asset: Asset) => void;
  onAnnotations: (pageId: string, annotations: Annotation[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [index, setIndex] = useState(Math.min(startIndex, pages.length - 1));
  const page = pages[index];
  const source = sources[page.sourceId];
  const rotation = totalRotation(page);
  const box = pageBox(page, source, imagePageSize);
  const view = viewSize(box.width, box.height, rotation);

  // From the "Sign PDF" entry point an existing signature is ready to place.
  const initialSignature = intent === "sign" && signatures.length ? signatures[signatures.length - 1] : null;
  const [tool, setTool] = useState<Tool | null>(intent === "edit" ? "text" : initialSignature ? "signature" : null);
  const [pending, setPending] = useState<Asset | null>(initialSignature);
  const [signatureOpen, setSignatureOpen] = useState(intent === "sign" && !signatures.length);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rendered, setRendered] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [history, setHistory] = useState<Record<string, Annotation[][]>>({});
  const interaction = useRef<null | { kind: "move" | "resize"; id: string; startX: number; startY: number; start: Annotation; startView: Rect; moved: boolean } | { kind: "draw"; startX: number; startY: number }>(null);

  const scale = fit * zoom;
  const annotations = page.annotations;
  const selected = annotations.find((item) => item.id === selectedId) ?? null;

  // Fit the page to the available width.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const measure = () => setFit(clamp((scroller.clientWidth - 32) / view.width, 0.25, 1.6));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [view.width]);

  // Render the page bitmap.
  const renderKey = `${page.id}:${rotation}:${scale.toFixed(3)}:${imagePageSize}`;
  useEffect(() => {
    let cancelled = false;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    renderPageView(page, source, getProxy(source.id), imagePageSize, scale * ratio, rotation).then((canvas) => {
      const target = canvasRef.current;
      if (cancelled || !target) { releaseCanvas(canvas); return; }
      target.width = canvas.width;
      target.height = canvas.height;
      context2d(target).drawImage(canvas, 0, 0);
      releaseCanvas(canvas);
      setRendered(renderKey);
    }, (error) => { if (!cancelled) toast(t("common.error", { error: errorMessage(error) }), "error"); });
    return () => { cancelled = true; };
    // renderKey captures every input that changes the bitmap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderKey]);

  // Put the caret in a text box as soon as it becomes editable.
  useEffect(() => {
    if (!editingId) return;
    const frame = requestAnimationFrame(() => {
      const field = pageRef.current?.querySelector<HTMLTextAreaElement>(`textarea[data-id="${editingId}"]`);
      if (field && document.activeElement !== field) {
        field.focus();
        field.setSelectionRange(field.value.length, field.value.length);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [editingId]);

  /* ---------------------------------------------------------- editing */

  const remember = useCallback((snapshot: Annotation[]) => {
    setHistory((current) => ({ ...current, [page.id]: [...(current[page.id] ?? []), snapshot].slice(-60) }));
  }, [page.id]);

  const forgetLast = useCallback(() => {
    setHistory((current) => ({ ...current, [page.id]: (current[page.id] ?? []).slice(0, -1) }));
  }, [page.id]);

  const commit = useCallback((next: Annotation[]) => {
    remember(page.annotations);
    onAnnotations(page.id, next);
  }, [onAnnotations, page.id, page.annotations, remember]);

  const pageHistory = useMemo(() => history[page.id] ?? [], [history, page.id]);
  const undo = useCallback(() => {
    const previous = pageHistory[pageHistory.length - 1];
    if (!previous) return;
    forgetLast();
    onAnnotations(page.id, previous);
    setSelectedId(null);
    setEditingId(null);
  }, [forgetLast, onAnnotations, page.id, pageHistory]);

  const toNormalized = (raw: Rect) => ({ x: raw.x / box.width, y: raw.y / box.height, w: raw.w / box.width, h: raw.h / box.height });
  const viewOf = (annotation: Annotation): Rect => rawBoxToView({ x: annotation.x * box.width, y: annotation.y * box.height, w: annotation.w * box.width, h: annotation.h * box.height }, box.width, box.height, rotation);
  const fromView = (rect: Rect) => {
    const fitted = { w: Math.min(rect.w, view.width), h: Math.min(rect.h, view.height) };
    const clamped = { x: clamp(rect.x, 0, view.width - fitted.w), y: clamp(rect.y, 0, view.height - fitted.h), ...fitted };
    return toNormalized(viewBoxToRaw(clamped, box.width, box.height, rotation));
  };
  const uprightRotation = ((360 - rotation) % 360) as Quarter;

  const textBox = (annotation: TextAnnotation, at?: { x: number; y: number }) => {
    const size = measureText(annotation.text || t("editor.newText"), annotation.size, annotation.font, annotation.bold);
    const current = viewOf(annotation);
    const turned = (annotation.rot + rotation) % 180 !== 0;
    const rect = { x: at?.x ?? current.x, y: at?.y ?? current.y, w: turned ? size.height : size.width, h: turned ? size.width : size.height };
    return fromView(rect);
  };

  const pointerToView = (event: { clientX: number; clientY: number }) => {
    const rect = pageRef.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  };

  const place = (at: { x: number; y: number }, kind: Tool) => {
    const id = uid();
    let annotation: Annotation | null = null;
    if ((kind === "signature" || kind === "image") && pending) {
      const width = Math.min(view.width * (kind === "signature" ? 0.3 : 0.4), kind === "signature" ? 190 : 260);
      const height = width / (pending.width / pending.height);
      annotation = { id, kind: "image", rot: uprightRotation, asset: pending, ...fromView({ x: at.x - width / 2, y: at.y - height / 2, w: width, h: height }) };
    } else if (kind === "text" || kind === "date") {
      const base: TextAnnotation = { id, kind: "text", rot: uprightRotation, x: 0, y: 0, w: 0, h: 0, text: kind === "date" ? today() : "", size: 12, font: "sans", bold: false, color: TEXT_COLORS[0] };
      const size = measureText(base.text || t("editor.newText"), base.size, base.font, base.bold);
      annotation = { ...base, ...fromView({ x: at.x, y: at.y - base.size * 0.62, w: size.width, h: size.height }) };
    } else if (kind === "check" || kind === "cross") {
      const size = 14;
      annotation = { id, kind: "mark", mark: kind, rot: uprightRotation, color: TEXT_COLORS[0], ...fromView({ x: at.x - size / 2, y: at.y - size / 2, w: size, h: size }) };
    }
    if (!annotation) return;
    commit([...annotations, annotation]);
    setSelectedId(id);
    if (kind === "text") setEditingId(id);
    if (kind !== "check" && kind !== "cross") { setTool(null); setPending(null); setGhost(null); }
  };

  const chooseTool = (next: Tool) => {
    setSelectedId(null);
    setEditingId(null);
    if (tool === next) { setTool(null); setPending(null); return; }
    if (next === "signature") {
      if (signatures.length) { setPending(signatures[signatures.length - 1]); setTool("signature"); }
      setSignatureOpen(true);
      return;
    }
    if (next === "image") { imagePicker.open(); return; }
    setPending(null);
    setTool(next);
  };

  const imagePicker = useFilePicker("image/*,.heic,.heif", async (files) => {
    try {
      const source = await decodeImage(files[0]);
      const scaleDown = Math.min(1, 1600 / Math.max(source.width, source.height));
      const canvas = createCanvas(source.width * scaleDown, source.height * scaleDown);
      context2d(canvas).drawImage(source.image, 0, 0, canvas.width, canvas.height);
      source.close();
      const blob = bytesToBlob(await canvasBytes(canvas, "png"), "image/png");
      const asset: Asset = { id: uid(), blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
      releaseCanvas(canvas);
      setPending(asset);
      setTool("image");
    } catch (error) {
      toast(t("common.error", { error: errorMessage(error) }), "error");
    }
  }, false);

  /* ------------------------------------------------------- pointer input */

  const onPagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget && !(event.target as HTMLElement).dataset.surface) return;
    const at = pointerToView(event);
    if (tool === "whiteout") {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      interaction.current = { kind: "draw", startX: at.x, startY: at.y };
      setDraft({ x: at.x, y: at.y, w: 0, h: 0 });
      return;
    }
    if (tool && (tool !== "signature" && tool !== "image" || pending)) {
      // Keeps the browser from moving focus away from the new text box.
      event.preventDefault();
      place(at, tool);
      return;
    }
    setSelectedId(null);
    setEditingId(null);
  };

  const onPagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = interaction.current;
    if (state?.kind === "draw") {
      const at = pointerToView(event);
      setDraft({ x: Math.min(at.x, state.startX), y: Math.min(at.y, state.startY), w: Math.abs(at.x - state.startX), h: Math.abs(at.y - state.startY) });
      return;
    }
    if (pending && event.pointerType === "mouse") setGhost(pointerToView(event));
  };

  const onPagePointerUp = () => {
    const state = interaction.current;
    if (state?.kind !== "draw" || !draft) return;
    interaction.current = null;
    const rect = draft.w < 4 || draft.h < 4 ? { x: draft.x - 60, y: draft.y - 9, w: 120, h: 18 } : draft;
    const id = uid();
    commit([...annotations, { id, kind: "rect", rot: 0, color: "#ffffff", ...fromView(rect) }]);
    setDraft(null);
    setSelectedId(id);
    setTool(null);
  };

  const beginItem = (event: ReactPointerEvent<HTMLElement>, annotation: Annotation, kind: "move" | "resize") => {
    if (editingId === annotation.id && kind === "move" && (event.target as HTMLElement).tagName === "TEXTAREA") return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setSelectedId(annotation.id);
    if (editingId !== annotation.id) setEditingId(null);
    remember(annotations);
    interaction.current = { kind, id: annotation.id, startX: event.clientX, startY: event.clientY, start: annotation, startView: viewOf(annotation), moved: false };
  };

  const moveItem = (event: ReactPointerEvent<HTMLElement>) => {
    const state = interaction.current;
    if (!state || state.kind === "draw") return;
    const dx = (event.clientX - state.startX) / scale;
    const dy = (event.clientY - state.startY) / scale;
    if (Math.abs(dx) + Math.abs(dy) > 2 / scale) state.moved = true;
    const start = state.start;
    let next: Annotation;
    if (state.kind === "move") {
      const delta = viewDeltaToRaw(dx, dy, rotation);
      next = { ...start, x: clamp(start.x + delta.dx / box.width, 0, 1 - start.w), y: clamp(start.y + delta.dy / box.height, 0, 1 - start.h) };
    } else {
      const sv = state.startView;
      let w = Math.max(6, sv.w + dx);
      let h = Math.max(6, sv.h + dy);
      if (start.kind === "image" || start.kind === "mark") h = (w * sv.h) / sv.w;
      if (start.kind === "text") {
        const size = clamp(Math.round(start.size * (w / sv.w) * 2) / 2, 4, 144);
        const resized = { ...start, size };
        next = { ...resized, ...textBox(resized) };
        onAnnotations(page.id, annotations.map((item) => (item.id === start.id ? next : item)));
        return;
      }
      w = Math.min(w, view.width - sv.x);
      h = Math.min(h, view.height - sv.y);
      next = { ...start, ...fromView({ x: sv.x, y: sv.y, w, h }) };
    }
    onAnnotations(page.id, annotations.map((item) => (item.id === start.id ? next : item)));
  };

  const endItem = (event: ReactPointerEvent<HTMLElement>) => {
    const state = interaction.current;
    if (!state || state.kind === "draw") return;
    interaction.current = null;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    if (!state.moved) {
      // A click (not a drag) is not an edit: drop the history entry.
      forgetLast();
      if (state.kind === "move" && state.start.kind === "text") setEditingId(state.start.id);
    }
  };

  const updateSelected = (patch: Partial<TextAnnotation> & Partial<Annotation>) => {
    if (!selected) return;
    let next = { ...selected, ...patch } as Annotation;
    if (next.kind === "text") next = { ...next, ...textBox(next) };
    commit(annotations.map((item) => (item.id === selected.id ? next : item)));
  };

  const removeSelected = () => {
    if (!selected) return;
    commit(annotations.filter((item) => item.id !== selected.id));
    setSelectedId(null);
    setEditingId(null);
  };

  const goTo = (next: number) => {
    // Empty text boxes are discarded when leaving a page.
    const cleaned = annotations.filter((item) => item.kind !== "text" || item.text.trim());
    if (cleaned.length !== annotations.length) onAnnotations(page.id, cleaned);
    setIndex(clamp(next, 0, pages.length - 1));
    setSelectedId(null);
    setEditingId(null);
    setDraft(null);
  };

  const close = () => {
    const cleaned = annotations.filter((item) => item.kind !== "text" || item.text.trim());
    if (cleaned.length !== annotations.length) onAnnotations(page.id, cleaned);
    onClose();
  };

  // Keyboard shortcuts.
  const keyState = useRef({ selected, editingId, tool, undo, removeSelected, goTo, close, index });
  useEffect(() => { keyState.current = { selected, editingId, tool, undo, removeSelected, goTo, close, index }; });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector(".dialog-backdrop")) return;
      const state = keyState.current;
      const typing = (event.target as HTMLElement | null)?.closest("input, textarea, select");
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !typing) { event.preventDefault(); state.undo(); return; }
      if (event.key === "Escape") {
        event.preventDefault();
        if (state.editingId) { setEditingId(null); (document.activeElement as HTMLElement | null)?.blur(); }
        else if (state.tool) { setTool(null); setPending(null); setGhost(null); setDraft(null); }
        else if (state.selected) setSelectedId(null);
        else state.close();
        return;
      }
      if (typing) return;
      if ((event.key === "Delete" || event.key === "Backspace") && state.selected) { event.preventDefault(); state.removeSelected(); return; }
      if (event.key === "PageDown") { event.preventDefault(); state.goTo(state.index + 1); }
      if (event.key === "PageUp") { event.preventDefault(); state.goTo(state.index - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ------------------------------------------------------------- render */

  const hint = tool === "whiteout" ? t("editor.hint.whiteout")
    : tool === "text" ? t("editor.hint.text")
    : tool && (tool !== "signature" && tool !== "image" || pending) ? t("editor.hint.place")
    : !annotations.length ? t("editor.hint.start") : null;

  const tools: Array<{ id: Tool; icon: React.ReactNode; label: string }> = [
    { id: "signature", icon: <Signature size={18} />, label: t("editor.tool.signature") },
    { id: "text", icon: <Type size={18} />, label: t("editor.tool.text") },
    { id: "date", icon: <CalendarDays size={18} />, label: t("editor.tool.date") },
    { id: "check", icon: <Check size={18} />, label: t("editor.tool.check") },
    { id: "cross", icon: <X size={18} />, label: t("editor.tool.cross") },
    { id: "whiteout", icon: <RectangleHorizontal size={18} />, label: t("editor.tool.whiteout") },
    { id: "image", icon: <ImagePlus size={18} />, label: t("editor.tool.image") },
  ];

  return (
    <div className="editor" role="dialog" aria-modal="true" aria-label={t("editor.page", { n: index + 1, total: pages.length })}>
      {imagePicker.input}
      <div className="editor-top">
        <button className="btn btn-primary" onClick={close}><Check size={17} />{t("editor.done")}</button>
        <span className="title">{t("editor.page", { n: index + 1, total: pages.length })}</span>
        <span className="toolbar-tools" style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {tools.map((item) => (
            <button key={item.id} className={`tool-btn${intent === "sign" && item.id === "signature" && !annotations.length ? " pulse" : ""}`} aria-pressed={tool === item.id} onClick={() => chooseTool(item.id)} title={item.label}>
              {item.icon}<span className="label">{item.label}</span>
            </button>
          ))}
        </span>
        <span style={{ flex: 1 }} />
        {selected?.kind === "text" ? (
          <span className="row" style={{ gap: 2 }}>
            <button className="icon-btn" onClick={() => updateSelected({ size: Math.max(4, selected.size - 1) })} aria-label={t("editor.smaller")} title={t("editor.smaller")}><Minus size={16} /></button>
            <span className="chip" title={t("editor.font")}>{selected.size} pt</span>
            <button className="icon-btn" onClick={() => updateSelected({ size: Math.min(144, selected.size + 1) })} aria-label={t("editor.larger")} title={t("editor.larger")}><Plus size={16} /></button>
            <button className="icon-btn" aria-pressed={selected.bold} onClick={() => updateSelected({ bold: !selected.bold })} aria-label={t("editor.bold")} title={t("editor.bold")}><Bold size={16} /></button>
            <select className="select compact" style={{ height: 32, width: "auto" }} value={selected.font} onChange={(event) => updateSelected({ font: event.target.value as FontId })} aria-label={t("editor.font")}>
              <option value="sans">{t("editor.font.sans")}</option>
              <option value="serif">{t("editor.font.serif")}</option>
              <option value="mono">{t("editor.font.mono")}</option>
            </select>
            {TEXT_COLORS.map((color) => <button key={color} className="color-dot" style={{ background: color, margin: "0 3px" }} aria-pressed={selected.color === color} onClick={() => updateSelected({ color })} aria-label={t("editor.color", { color })} />)}
          </span>
        ) : selected?.kind === "rect" || selected?.kind === "mark" ? (
          <span className="row" style={{ gap: 4 }}>
            {(selected.kind === "rect" ? RECT_COLORS : TEXT_COLORS).map((color) => <button key={color} className="color-dot" style={{ background: color }} aria-pressed={selected.color === color} onClick={() => updateSelected({ color })} aria-label={t("editor.color", { color })} />)}
          </span>
        ) : null}
        {selected ? <button className="icon-btn danger" onClick={removeSelected} aria-label={t("editor.deleteItem")} title={t("editor.deleteItem")}><Trash2 size={17} /></button> : null}
        <button className="icon-btn" onClick={undo} disabled={!pageHistory.length} aria-label={t("editor.undo")} title={t("editor.undo")}><Undo2 size={17} /></button>
        <button className="icon-btn" onClick={() => setZoom((value) => clamp(value / 1.25, 0.5, 3))} aria-label={t("editor.zoomOut")} title={t("editor.zoomOut")}><ZoomOut size={17} /></button>
        <button className="icon-btn" onClick={() => setZoom((value) => clamp(value * 1.25, 0.5, 3))} aria-label={t("editor.zoomIn")} title={t("editor.zoomIn")}><ZoomIn size={17} /></button>
      </div>

      {hint ? (
        <div className="editor-hint" role="status">
          <span>{hint}</span>
          {tool ? <button onClick={() => { setTool(null); setPending(null); setGhost(null); setDraft(null); }}>{t("editor.cancel")}</button> : null}
        </div>
      ) : null}

      <div className="editor-scroll" ref={scrollRef}>
        <div
          ref={pageRef}
          className={`editor-page${tool ? " placing" : ""}`}
          style={{ width: view.width * scale, height: view.height * scale }}
          onPointerDown={onPagePointerDown}
          onPointerMove={onPagePointerMove}
          onPointerUp={onPagePointerUp}
          onPointerLeave={() => setGhost(null)}
          data-surface="true"
        >
          <canvas ref={canvasRef} data-surface="true" aria-hidden="true" />
          {rendered !== renderKey ? <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#888" }} data-surface="true"><Spinner large /></div> : null}

          {annotations.map((annotation) => {
            const rect = viewOf(annotation);
            const turn = (annotation.rot + rotation) % 360;
            const sideways = turn % 180 !== 0;
            const contentWidth = (sideways ? rect.h : rect.w) * scale;
            const contentHeight = (sideways ? rect.w : rect.h) * scale;
            const isSelected = annotation.id === selectedId;
            const body = { width: contentWidth, height: contentHeight, left: (rect.w * scale - contentWidth) / 2, top: (rect.h * scale - contentHeight) / 2, transform: turn ? `rotate(${turn}deg)` : undefined };
            return (
              <div
                key={annotation.id}
                className={`ann${isSelected ? " selected" : ""}`}
                style={{ left: rect.x * scale, top: rect.y * scale, width: rect.w * scale, height: rect.h * scale, cursor: "move" }}
                onPointerDown={(event) => beginItem(event, annotation, "move")}
                onPointerMove={moveItem}
                onPointerUp={endItem}
                onPointerCancel={endItem}
              >
                <div className="ann-body" style={body}>
                  {annotation.kind === "image" ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- local object URL */
                    <img src={annotation.asset.url} alt="" draggable={false} />
                  ) : annotation.kind === "rect" ? (
                    <div className="ann-rect" style={{ background: annotation.color, boxShadow: annotation.color === "#ffffff" ? "inset 0 0 0 1px rgb(0 0 0 / 0.12)" : undefined }} />
                  ) : annotation.kind === "mark" ? (
                    <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
                      <path d={annotation.mark === "check" ? "M12 55 L40 82 L88 18" : "M18 18 L82 82 M82 18 L18 82"} fill="none" stroke={annotation.color} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <textarea
                      data-id={annotation.id}
                      className="ann-text"
                      value={annotation.text}
                      placeholder={t("editor.newText")}
                      readOnly={editingId !== annotation.id}
                      aria-label={t("editor.textLabel")}
                      spellCheck={false}
                      rows={1}
                      style={{
                        width: contentWidth,
                        height: contentHeight,
                        fontSize: annotation.size * scale,
                        fontFamily: FONTS[annotation.font].css,
                        fontWeight: annotation.bold ? 700 : 400,
                        color: annotation.color,
                        cursor: editingId === annotation.id ? "text" : "move",
                      }}
                      onChange={(event) => {
                        const next = { ...annotation, text: event.target.value };
                        onAnnotations(page.id, annotations.map((item) => (item.id === annotation.id ? { ...next, ...textBox(next) } : item)));
                      }}
                      onFocus={() => remember(annotations)}
                    />
                  )}
                </div>
                {isSelected ? (
                  <>
                    <button className="ann-delete" onPointerDown={(event) => event.stopPropagation()} onClick={removeSelected} aria-label={t("editor.deleteItem")}><X size={14} /></button>
                    <span className="ann-handle" aria-label={t("editor.resizeItem")} onPointerDown={(event) => beginItem(event, annotation, "resize")} onPointerMove={moveItem} onPointerUp={endItem} onPointerCancel={endItem} />
                  </>
                ) : null}
              </div>
            );
          })}

          {draft ? <div className="ghost-item" style={{ left: draft.x * scale, top: draft.y * scale, width: draft.w * scale, height: draft.h * scale, background: "#fff", outline: "1.5px dashed var(--accent)", opacity: 1 }} /> : null}
          {ghost && pending && (tool === "signature" || tool === "image") ? (() => {
            const width = Math.min(view.width * (tool === "signature" ? 0.3 : 0.4), tool === "signature" ? 190 : 260);
            const height = width / (pending.width / pending.height);
            return (
              /* eslint-disable-next-line @next/next/no-img-element -- local object URL */
              <img className="ghost-item" src={pending.url} alt="" style={{ left: (ghost.x - width / 2) * scale, top: (ghost.y - height / 2) * scale, width: width * scale, height: height * scale }} />
            );
          })() : null}
        </div>
      </div>

      {pages.length > 1 ? (
        <nav className="editor-nav" aria-label={t("editor.page", { n: index + 1, total: pages.length })}>
          <button className="icon-btn" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label={t("editor.prev")} title={t("editor.prev")}><ChevronLeft size={18} /></button>
          <span>{t("editor.page", { n: index + 1, total: pages.length })}</span>
          <button className="icon-btn" onClick={() => goTo(index + 1)} disabled={index === pages.length - 1} aria-label={t("editor.next")} title={t("editor.next")}><ChevronRight size={18} /></button>
        </nav>
      ) : null}

      <SignatureDialog
        open={signatureOpen}
        saved={signatures}
        onClose={() => { setSignatureOpen(false); if (!pending) setTool(null); }}
        onUse={(asset) => {
          if (!signatures.some((item) => item.id === asset.id)) onSignature(asset);
          setPending(asset);
          setTool("signature");
          setSignatureOpen(false);
        }}
      />
    </div>
  );
}
