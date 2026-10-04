"use client";

import caveatUrl from "@fontsource/caveat/files/caveat-latin-400-normal.woff2?url";
import dancingUrl from "@fontsource/dancing-script/files/dancing-script-latin-400-normal.woff2?url";
import greatVibesUrl from "@fontsource/great-vibes/files/great-vibes-latin-400-normal.woff2?url";
import { Eraser, ImageUp, PenLine, Type, Undo2 } from "lucide-react";
import { PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { errorMessage, uid } from "../../lib/files";
import { decodeImage } from "../../lib/image/decode";
import { canvasBytes, bytesToBlob } from "../../lib/image/encode";
import { applyLook, context2d, createCanvas, releaseCanvas } from "../../lib/image/render";
import type { Asset } from "../../lib/pdf/model";
import { useT } from "../LanguageProvider";
import { Dialog, Segmented, Spinner, Switch, useFilePicker } from "../ui";

const STYLES = [
  { id: "dancing", family: "EasyApply Dancing Script", url: dancingUrl, size: 1 },
  { id: "vibes", family: "EasyApply Great Vibes", url: greatVibesUrl, size: 1.1 },
  { id: "caveat", family: "EasyApply Caveat", url: caveatUrl, size: 1.05 },
];
const INKS = { black: "#14161c", blue: "#1b3aa0" } as const;
type Ink = keyof typeof INKS;
type Point = { x: number; y: number; t: number };

let fontsReady: Promise<void> | null = null;
function loadFonts() {
  fontsReady ??= Promise.all(STYLES.map(async (style) => {
    const face = new FontFace(style.family, `url(${style.url})`);
    await face.load();
    document.fonts.add(face);
  })).then(() => undefined, () => undefined);
  return fontsReady;
}

/** Crops a canvas to its visible (non-transparent) pixels. */
function trim(canvas: HTMLCanvasElement, padding: number) {
  const { width, height } = canvas;
  const data = context2d(canvas, { willReadFrequently: true }).getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  const out = createCanvas(Math.min(width, maxX + padding + 1) - x, Math.min(height, maxY + padding + 1) - y);
  context2d(out).drawImage(canvas, x, y, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

async function toAsset(canvas: HTMLCanvasElement): Promise<Asset> {
  const blob = bytesToBlob(await canvasBytes(canvas, "png"), "image/png");
  const asset = { id: uid(), blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
  releaseCanvas(canvas);
  return asset;
}

/** Draws a stroke as short curves whose width follows the pen speed. */
function drawStroke(context: CanvasRenderingContext2D, stroke: Point[], scale: number, color: string) {
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineCap = "round";
  context.lineJoin = "round";
  if (stroke.length === 1) {
    context.beginPath();
    context.arc(stroke[0].x * scale, stroke[0].y * scale, 1.6 * scale, 0, Math.PI * 2);
    context.fill();
    return;
  }
  let width = 2.6;
  for (let i = 1; i < stroke.length; i += 1) {
    const a = stroke[i - 1];
    const b = stroke[i];
    const speed = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, b.t - a.t);
    width = width * 0.7 + Math.max(1.1, Math.min(3.4, 3.4 - speed * 1.2)) * 0.3;
    const previous = stroke[i - 2] ?? a;
    const start = { x: (previous.x + a.x) / 2, y: (previous.y + a.y) / 2 };
    const end = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    context.lineWidth = width * scale;
    context.beginPath();
    context.moveTo(start.x * scale, start.y * scale);
    context.quadraticCurveTo(a.x * scale, a.y * scale, end.x * scale, end.y * scale);
    context.stroke();
  }
}

function DrawPad({ strokes, onStrokes, ink, label }: { strokes: Point[][]; onStrokes: (strokes: Point[][]) => void; ink: Ink; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const current = useRef<Point[] | null>(null);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(canvas.clientWidth * ratio);
    canvas.height = Math.round(canvas.clientHeight * ratio);
    const context = context2d(canvas);
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) drawStroke(context, stroke, ratio, INKS[ink]);
  };

  // Redraw when strokes or the ink change, and when the pad is resized.
  useLayoutEffect(() => {
    redraw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(canvas);
    return () => observer.disconnect();
  });

  const point = (event: { clientX: number; clientY: number; timeStamp: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, t: event.timeStamp };
  };

  const onDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    current.current = [point(event)];
  };
  const onMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const stroke = current.current;
    const canvas = canvasRef.current;
    if (!stroke || !canvas) return;
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    for (const item of events) stroke.push(point(item));
    const ratio = canvas.width / Math.max(1, canvas.clientWidth);
    const context = context2d(canvas);
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (const done of strokes) drawStroke(context, done, ratio, INKS[ink]);
    drawStroke(context, stroke, ratio, INKS[ink]);
  };
  const onUp = () => {
    if (current.current) onStrokes([...strokes, current.current]);
    current.current = null;
  };

  return (
    <div className="sig-pad-wrap">
      <canvas ref={canvasRef} className="sig-pad" aria-label={label} role="img" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      <span className="sig-baseline" />
      <span className="sig-baseline-label">{label}</span>
    </div>
  );
}

export function SignatureDialog({ open, onClose, onUse, saved }: { open: boolean; onClose: () => void; onUse: (asset: Asset) => void; saved: Asset[] }) {
  const t = useT();
  const [tab, setTab] = useState<"draw" | "type" | "upload">("draw");
  const [ink, setInk] = useState<Ink>("black");
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [name, setName] = useState("");
  const [style, setStyle] = useState(STYLES[0].id);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [upload, setUpload] = useState<{ file: File; preview: Asset | null; error?: string } | null>(null);
  const [removeBg, setRemoveBg] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || fontsLoaded) return;
    let active = true;
    loadFonts().then(() => { if (active) setFontsLoaded(true); });
    return () => { active = false; };
  }, [open, fontsLoaded]);

  const processUpload = async (file: File, clean: boolean) => {
    setWorking(true);
    try {
      const source = await decodeImage(file);
      const scale = Math.min(1, 1400 / Math.max(source.width, source.height));
      const canvas = createCanvas(source.width * scale, source.height * scale);
      context2d(canvas).drawImage(source.image, 0, 0, canvas.width, canvas.height);
      source.close();
      if (clean) applyLook(canvas, { brightness: 100, contrast: 100, saturation: 100, grayscale: false, cleanup: { strength: 55, ink: "original", transparent: true } });
      const trimmed = clean ? trim(canvas, 8) ?? canvas : canvas;
      if (trimmed !== canvas) releaseCanvas(canvas);
      const preview = await toAsset(trimmed);
      setUpload((current) => {
        if (current?.preview) URL.revokeObjectURL(current.preview.url);
        return { file, preview };
      });
    } catch (problem) {
      setUpload({ file, preview: null, error: errorMessage(problem) });
    } finally {
      setWorking(false);
    }
  };

  const picker = useFilePicker("image/*,.heic,.heif", (files) => { setError(""); processUpload(files[0], removeBg); }, false);

  const finish = async () => {
    setError("");
    if (tab === "draw") {
      if (!strokes.length) { setError(t("sig.drawFirst")); return; }
      const width = Math.max(...strokes.flat().map((p) => p.x)) + 20;
      const height = Math.max(...strokes.flat().map((p) => p.y)) + 20;
      const scale = 3;
      const canvas = createCanvas(width * scale, height * scale);
      const context = context2d(canvas);
      for (const stroke of strokes) drawStroke(context, stroke, scale, INKS[ink]);
      const trimmed = trim(canvas, 12);
      releaseCanvas(canvas);
      if (!trimmed) { setError(t("sig.drawFirst")); return; }
      onUse(await toAsset(trimmed));
    } else if (tab === "type") {
      if (!name.trim()) { setError(t("sig.typeFirst")); return; }
      const chosen = STYLES.find((item) => item.id === style) ?? STYLES[0];
      await loadFonts();
      const size = 140 * chosen.size;
      const probe = context2d(createCanvas(1, 1));
      probe.font = `${size}px "${chosen.family}"`;
      const width = probe.measureText(name.trim()).width;
      const canvas = createCanvas(width + size, size * 1.8);
      const context = context2d(canvas);
      context.font = `${size}px "${chosen.family}"`;
      context.fillStyle = INKS[ink];
      context.textBaseline = "alphabetic";
      context.fillText(name.trim(), size / 2, size * 1.2);
      const trimmed = trim(canvas, 14);
      releaseCanvas(canvas);
      if (!trimmed) { setError(t("sig.typeFirst")); return; }
      onUse(await toAsset(trimmed));
    } else {
      if (!upload?.preview) { setError(t("sig.uploadFirst")); return; }
      onUse(upload.preview);
      setUpload(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("sig.title")}
      footer={(
        <>
          <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn btn-primary" onClick={finish} disabled={working}>{t("sig.use")}</button>
        </>
      )}
    >
      <div style={{ display: "grid", gap: 14 }}>
        {saved.length ? (
          <div className="field">
            <span className="label">{t("sig.saved")}</span>
            <div className="saved-sigs">
              {saved.map((asset) => (
                <button key={asset.id} type="button" className="saved-sig" onClick={() => onUse(asset)} aria-label={t("sig.use")}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                  <img src={asset.url} alt="" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <Segmented
          label={t("sig.title")}
          value={tab}
          onChange={(value) => { setTab(value); setError(""); }}
          options={[
            { value: "draw", label: t("sig.draw"), icon: <PenLine size={15} /> },
            { value: "type", label: t("sig.type"), icon: <Type size={15} /> },
            { value: "upload", label: t("sig.upload"), icon: <ImageUp size={15} /> },
          ]}
        />

        {tab !== "upload" ? (
          <div className="row" role="group" aria-label={t("sig.ink")}>
            <span className="label">{t("sig.ink")}</span>
            {(Object.keys(INKS) as Ink[]).map((key) => (
              <button key={key} type="button" className="color-dot" style={{ background: INKS[key] }} aria-pressed={ink === key} aria-label={t(`sig.color.${key}`)} title={t(`sig.color.${key}`)} onClick={() => setInk(key)} />
            ))}
          </div>
        ) : null}

        {tab === "draw" ? (
          <div className="field">
            <DrawPad strokes={strokes} onStrokes={(next) => { setStrokes(next); setError(""); }} ink={ink} label={t("sig.signHere")} />
            <div className="row">
              <p className="hint" style={{ flex: 1 }}>{t("sig.drawHint")}</p>
              <button className="btn btn-sm" onClick={() => setStrokes(strokes.slice(0, -1))} disabled={!strokes.length}><Undo2 size={14} />{t("common.undo")}</button>
              <button className="btn btn-sm" onClick={() => setStrokes([])} disabled={!strokes.length}><Eraser size={14} />{t("sig.clear")}</button>
            </div>
          </div>
        ) : null}

        {tab === "type" ? (
          <div className="field">
            <input className="input" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} placeholder={t("sig.typeName")} aria-label={t("sig.typeName")} data-autofocus autoComplete="name" />
            <div className="sig-styles" role="group" aria-label={t("sig.type")}>
              {STYLES.map((item) => (
                <button key={item.id} type="button" className="sig-style" aria-pressed={style === item.id} onClick={() => setStyle(item.id)} style={{ fontFamily: fontsLoaded ? `"${item.family}", cursive` : "cursive", color: INKS[ink], fontSize: 28 * item.size }}>
                  {name.trim() || "Signature"}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "upload" ? (
          <div className="field">
            {picker.input}
            <div className="sig-upload-preview checker">
              {working ? <Spinner large /> : upload?.preview ? (
                /* eslint-disable-next-line @next/next/no-img-element -- local object URL */
                <img src={upload.preview.url} alt="" />
              ) : (
                <button className="btn" onClick={picker.open}><ImageUp size={16} />{t("sig.chooseImage")}</button>
              )}
            </div>
            {upload?.error ? <p className="note note-danger">{upload.error}</p> : null}
            <p className="hint">{t("sig.uploadHint")}</p>
            <Switch checked={removeBg} onChange={(value) => { setRemoveBg(value); if (upload) processUpload(upload.file, value); }} label={t("sig.removeBg")} />
            {upload?.preview ? <button className="btn btn-sm" style={{ justifySelf: "start" }} onClick={picker.open}><ImageUp size={14} />{t("sig.chooseImage")}</button> : null}
          </div>
        ) : null}

        {error ? <p className="note note-warning" role="alert">{error}</p> : null}
      </div>
    </Dialog>
  );
}
