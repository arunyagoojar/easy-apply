"use client";

import { CircleAlert, FlipHorizontal2, FlipVertical2, ImagePlus, RotateCcw, RotateCw, ScanFace, Trash2, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cropAspect, flipCrop, flipOrientation, normalizeQuarter, orientedSize, rotateCrop, type Rect } from "../../lib/geometry";
import { baseName, downloadBlob, errorMessage, isImageFile, isPdfFile, takeHandOff, uid, zipBlobs } from "../../lib/files";
import { removeBackground } from "../../lib/image/background";
import { decodeImage, HeicError, type DecodedSource } from "../../lib/image/decode";
import { bytesToBlob, imagesToPdf } from "../../lib/image/encode";
import { lookFor, produceImage, type Produced } from "../../lib/image/produce";
import type { Source } from "../../lib/image/render";
import {
  backgroundColor,
  CROP_SHAPES,
  initialEdits,
  loadAllSettings,
  lockedAspect,
  outputSize,
  refitCrop,
  resolveFormat,
  sanitizeSettings,
  saveAllSettings,
  type ImageEdits,
  type ImageMode,
  type ImageSettings,
} from "../../lib/image/settings";
import { printSheetJpg, printSheetPdf } from "../../lib/image/sheet";
import { AppHeader } from "../AppHeader";
import { useT } from "../LanguageProvider";
import { Spinner, useFilePicker, useLeaveWarning, usePasteFiles, useToast, useWindowDrop } from "../ui";
import { CropStage } from "./CropStage";
import { ImagePanel, type CutoutStatus } from "./ImagePanel";
import { ResultFooter, type OutputView } from "./ResultFooter";

type ImageItem = {
  id: string;
  file: File;
  thumb: string;
  status: "loading" | "ready" | "error";
  error?: string;
  /** Size of the decoded picture with EXIF orientation applied. */
  width: number;
  height: number;
  edits: ImageEdits;
  cutout: CutoutStatus;
};

const ACCEPT_IMAGES = "image/*,.heic,.heif";
// Settings that change the crop box shape.
const SHAPE_KEYS: Array<keyof ImageSettings> = ["preset", "sizeMode", "width", "height", "unit", "dpi", "lockAspect", "cropShape"];
const SOURCE_CACHE_SIZE = 3;

const subscribeNothing = () => () => undefined;

/** Renders nothing on the server so browser-only state never mismatches. */
export function ImageWorkspace({ initialMode }: { initialMode: ImageMode }) {
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  if (!hydrated) {
    return (
      <div className="app">
        <AppHeader section="image" />
        <main className="workspace"><section className="ws-main" /><aside className="ws-side" /></main>
      </div>
    );
  }
  return <Workspace initialMode={initialMode} />;
}

function workingAspect(item: ImageItem) {
  const { width, height } = orientedSize(item.width, item.height, item.edits.rotate);
  return width / Math.max(1, height);
}

function Workspace({ initialMode }: { initialMode: ImageMode }) {
  const t = useT();
  const toast = useToast();
  const [mode, setMode] = useState<ImageMode>(initialMode);
  const [allSettings, setAllSettings] = useState(loadAllSettings);
  const settings = allSettings[mode];
  const [initialFiles] = useState(() => takeHandOff("image"));
  const [items, setItems] = useState<ImageItem[]>(() => initialFiles.filter(isImageFile).map(newItem));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<{ id: string; source: DecodedSource } | null>(null);
  const [output, setOutput] = useState<(OutputView & { key: string }) | null>(null);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);

  const active = items.find((item) => item.id === activeId) ?? items[0] ?? null;
  const sources = useRef(new Map<string, DecodedSource>());
  const recent = useRef<string[]>([]);
  const cutouts = useRef(new Map<string, Source>());
  const cutoutJobs = useRef(new Map<string, Promise<Source | null>>());
  const cutoutQueue = useRef<Promise<unknown>>(Promise.resolve());
  const decoding = useRef(new Set<string>());
  const activeIdRef = useRef<string | null>(null);
  const latest = useRef({ items, settings, mode });

  useEffect(() => {
    latest.current = { items, settings, mode };
    activeIdRef.current = active?.id ?? null;
  });
  useLeaveWarning(items.length > 0);

  /* ------------------------------------------------------------ sources */

  const remember = useCallback((id: string, source: DecodedSource) => {
    sources.current.set(id, source);
    recent.current = [id, ...recent.current.filter((item) => item !== id)];
    while (recent.current.length > SOURCE_CACHE_SIZE) {
      const victim = recent.current[recent.current.length - 1];
      if (victim === activeIdRef.current) break;
      recent.current.pop();
      sources.current.get(victim)?.close();
      sources.current.delete(victim);
    }
  }, []);

  const getSource = useCallback(async (item: ImageItem) => {
    const cached = sources.current.get(item.id);
    if (cached) {
      recent.current = [item.id, ...recent.current.filter((id) => id !== item.id)];
      return cached;
    }
    const source = await decodeImage(item.file);
    remember(item.id, source);
    return source;
  }, [remember]);

  const setCutout = useCallback((id: string, cutout: CutoutStatus) => {
    setItems((list) => list.map((item) => (item.id === id ? { ...item, cutout } : item)));
  }, []);

  /** Removes the photo background once per image (jobs run one at a time). */
  const ensureCutout = useCallback((item: ImageItem): Promise<Source | null> => {
    const existing = cutoutJobs.current.get(item.id);
    if (existing) return existing;
    setCutout(item.id, { state: "working", progress: null });
    let lastReport = 0;
    const job = cutoutQueue.current.then(async () => {
      try {
        const source = await getSource(item);
        const result = await removeBackground(source, (progress) => {
          const now = performance.now();
          if (progress !== null && progress < 1 && now - lastReport < 120) return;
          lastReport = now;
          setCutout(item.id, { state: "working", progress });
        });
        cutouts.current.set(item.id, result);
        setCutout(item.id, { state: "ready" });
        return result;
      } catch (error) {
        cutoutJobs.current.delete(item.id);
        setCutout(item.id, { state: "error", message: errorMessage(error) });
        return null;
      }
    });
    cutoutQueue.current = job;
    cutoutJobs.current.set(item.id, job);
    return job;
  }, [getSource, setCutout]);

  const wantsCutout = (forMode: ImageMode, forSettings: ImageSettings) => forMode === "photo" && forSettings.background !== "keep";

  // Decode newly added images one at a time to keep memory low on phones.
  useEffect(() => {
    const next = items.find((item) => item.status === "loading" && !decoding.current.has(item.id));
    if (!next || decoding.current.size > 0) return;
    decoding.current.add(next.id);
    decodeImage(next.file).then((source) => {
      decoding.current.delete(next.id);
      remember(next.id, source);
      const { settings: currentSettings, mode: currentMode } = latest.current;
      const aspect = lockedAspect(currentSettings, currentMode, source.width / source.height);
      const ready: ImageItem = { ...next, status: "ready", width: source.width, height: source.height, edits: initialEdits(source.width, source.height, aspect) };
      setItems((list) => list.map((item) => (item.id === next.id ? { ...ready, cutout: item.cutout } : item)));
      if (wantsCutout(currentMode, currentSettings) && (activeIdRef.current ?? latest.current.items[0]?.id) === next.id) ensureCutout(ready);
    }, (error) => {
      decoding.current.delete(next.id);
      const message = error instanceof HeicError ? t("image.heic", { name: next.file.name }) : t("image.decodeFailed", { name: next.file.name });
      setItems((list) => list.map((item) => (item.id === next.id ? { ...item, status: "error", error: message } : item)));
    });
  }, [items, remember, ensureCutout, t]);

  // Keep the active image's decoded pixels at hand for the stage.
  const activeReady = active?.status === "ready" ? active : null;
  useEffect(() => {
    if (!activeReady) return;
    let cancelled = false;
    getSource(activeReady).then((source) => { if (!cancelled) setActiveSource({ id: activeReady.id, source }); }, () => undefined);
    return () => { cancelled = true; };
    // Only re-run when the active image changes, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReady?.id, getSource]);

  useEffect(() => () => {
    // Release everything when leaving the workspace.
    sources.current.forEach((source) => source.close());
    latest.current.items.forEach((item) => URL.revokeObjectURL(item.thumb));
  }, []);

  /* ------------------------------------------------------------- files */

  const addFiles = useCallback((files: File[]) => {
    const images = files.filter((file) => !isPdfFile(file) && isImageFile(file));
    const rejected = files.find((file) => isPdfFile(file) || !isImageFile(file));
    if (rejected) toast(t("common.unsupported", { name: rejected.name }), "error");
    if (!images.length) return;
    const added = images.map(newItem);
    setItems((list) => [...list, ...added]);
    setActiveId((current) => current ?? added[0].id);
  }, [t, toast]);

  const picker = useFilePicker(ACCEPT_IMAGES, addFiles);
  const dragging = useWindowDrop(addFiles);
  usePasteFiles(addFiles);

  const removeItem = (id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (item) URL.revokeObjectURL(item.thumb);
    sources.current.get(id)?.close();
    sources.current.delete(id);
    cutouts.current.delete(id);
    cutoutJobs.current.delete(id);
    recent.current = recent.current.filter((entry) => entry !== id);
    const remaining = items.filter((entry) => entry.id !== id);
    setItems(remaining);
    if (activeId === id || !remaining.some((entry) => entry.id === activeId)) setActiveId(remaining[0]?.id ?? null);
  };

  const removeAll = () => {
    items.forEach((item) => URL.revokeObjectURL(item.thumb));
    sources.current.forEach((source) => source.close());
    sources.current.clear();
    cutouts.current.clear();
    cutoutJobs.current.clear();
    recent.current = [];
    setItems([]);
    setActiveId(null);
    setActiveSource(null);
  };

  const selectItem = (item: ImageItem) => {
    setActiveId(item.id);
    if (item.status === "ready" && wantsCutout(mode, settings)) ensureCutout(item);
  };

  /* ---------------------------------------------------------- settings */

  const refitAll = (nextSettings: ImageSettings, nextMode: ImageMode) => {
    setItems((list) => list.map((item) => (item.status === "ready"
      ? { ...item, edits: refitCrop(item.edits, item.width, item.height, lockedAspect(nextSettings, nextMode, workingAspect(item))) }
      : item)));
  };

  const changeSettings = (patch: Partial<ImageSettings>) => {
    const next = sanitizeSettings({ ...settings, ...patch });
    const all = { ...allSettings, [mode]: next };
    setAllSettings(all);
    saveAllSettings(all);
    if (SHAPE_KEYS.some((key) => key in patch)) refitAll(next, mode);
    if (activeReady && wantsCutout(mode, next)) ensureCutout(activeReady);
  };

  const changeMode = (next: ImageMode) => {
    setMode(next);
    refitAll(allSettings[next], next);
    if (activeReady && wantsCutout(next, allSettings[next])) ensureCutout(activeReady);
  };

  /* ------------------------------------------------------------- edits */

  const aspectFor = (item: ImageItem, edits: ImageEdits) => {
    const { width, height } = orientedSize(item.width, item.height, edits.rotate);
    return lockedAspect(settings, mode, width / height);
  };

  const updateEdits = (change: (item: ImageItem) => ImageEdits) => {
    if (!activeReady) return;
    setItems((list) => list.map((item) => (item.id === activeReady.id ? { ...item, edits: change(item) } : item)));
  };

  const rotate = (clockwise: boolean) => updateEdits((item) => {
    const edits = { ...item.edits, rotate: normalizeQuarter(item.edits.rotate + (clockwise ? 90 : -90)), crop: rotateCrop(item.edits.crop, clockwise) };
    return refitCrop(edits, item.width, item.height, aspectFor(item, edits));
  });

  const flip = (axis: "horizontal" | "vertical") => updateEdits((item) => {
    const orientation = flipOrientation(item.edits.rotate, item.edits.flip, axis);
    return { ...item.edits, ...orientation, straighten: -item.edits.straighten, crop: flipCrop(item.edits.crop, axis) };
  });

  const resetEdits = () => updateEdits((item) => initialEdits(item.width, item.height, lockedAspect(settings, mode, item.width / item.height)));

  /* ------------------------------------------------------------ output */

  const useCutout = !!activeReady && wantsCutout(mode, settings) && activeReady.cutout.state === "ready";
  const outputKey = activeReady && activeSource?.id === activeReady.id
    ? JSON.stringify({ id: activeReady.id, edits: activeReady.edits, settings, mode, useCutout })
    : null;
  const busy = !!outputKey && output?.key !== outputKey;

  const latestOutput = useRef({ activeReady, activeSource, useCutout });
  useEffect(() => { latestOutput.current = { activeReady, activeSource, useCutout }; });

  useEffect(() => {
    if (!outputKey) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { activeReady: item, activeSource: loaded, useCutout: cut } = latestOutput.current;
      const { settings: currentSettings, mode: currentMode } = latest.current;
      if (!item || !loaded) return;
      const cutoutSource = cut ? cutouts.current.get(item.id) : undefined;
      try {
        const result = await produceImage({ file: item.file, source: cutoutSource ?? loaded.source, cutout: !!cutoutSource, edits: item.edits, settings: currentSettings, mode: currentMode });
        if (cancelled) return;
        const url = URL.createObjectURL(result.blob);
        setOutput((previous) => {
          if (previous?.url) URL.revokeObjectURL(previous.url);
          return { key: outputKey, result, url };
        });
      } catch (error) {
        if (!cancelled) setOutput((previous) => {
          if (previous?.url) URL.revokeObjectURL(previous.url);
          return { key: outputKey, error: errorMessage(error) };
        });
      }
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [outputKey]);

  const produceFor = async (item: ImageItem): Promise<Produced> => {
    const source = await getSource(item);
    const cutout = wantsCutout(mode, settings) ? await ensureCutout(item) : null;
    return produceImage({ file: item.file, source: cutout ?? source, cutout: !!cutout, edits: item.edits, settings, mode });
  };

  const downloadCurrent = async () => {
    if (!activeReady) return;
    try {
      const result = output?.key === outputKey && output?.result ? output.result : await produceFor(activeReady);
      downloadBlob(result.blob, result.name);
    } catch (error) {
      toast(t("common.error", { error: errorMessage(error) }), "error");
    }
  };

  const downloadAll = async () => {
    const ready = items.filter((item) => item.status === "ready");
    if (!ready.length) return;
    setExporting({ done: 0, total: ready.length });
    try {
      const results: Produced[] = [];
      for (const item of ready) {
        results.push(await produceFor(item));
        setExporting({ done: results.length, total: ready.length });
      }
      if (settings.format === "pdf" && settings.combinePdf && results.length > 1) {
        const pdf = await imagesToPdf(results.map((result) => result.page), "EasyApply images");
        downloadBlob(bytesToBlob(pdf, "application/pdf"), "easyapply-images.pdf");
      } else if (results.length === 1) {
        downloadBlob(results[0].blob, results[0].name);
      } else {
        downloadBlob(await zipBlobs(results.map((result) => ({ name: result.name, blob: result.blob }))), "easyapply-images.zip");
      }
    } catch (error) {
      toast(t("common.error", { error: errorMessage(error) }), "error");
    } finally {
      setExporting(null);
    }
  };

  const downloadSheet = async (paper: "4x6" | "a4") => {
    const result = output?.result;
    if (!result || !activeReady) return;
    try {
      const widthMm = (result.width / settings.dpi) * 25.4;
      const heightMm = (result.height / settings.dpi) * 25.4;
      const name = baseName(activeReady.file.name);
      if (paper === "4x6") {
        const photo = bytesToBlob(result.page.bytes, result.page.format === "png" ? "image/png" : "image/jpeg");
        const sheet = await printSheetJpg(photo, widthMm, heightMm);
        downloadBlob(sheet.blob, `${name}-print-4x6.jpg`);
      } else {
        const sheet = await printSheetPdf(result.page.bytes, result.page.format, widthMm, heightMm);
        downloadBlob(bytesToBlob(sheet.bytes, "application/pdf"), `${name}-print-a4.pdf`);
      }
    } catch (error) {
      toast(t("common.error", { error: errorMessage(error) }), "error");
    }
  };

  /* ------------------------------------------------------------ render */

  const stageSource = activeReady && activeSource?.id === activeReady.id ? (useCutout ? cutouts.current.get(activeReady.id) ?? activeSource.source : activeSource.source) : null;
  const aspect = activeReady ? lockedAspect(settings, mode, workingAspect(activeReady)) : null;
  const cropPixels = activeReady ? (() => {
    const { width, height } = orientedSize(activeReady.width, activeReady.height, activeReady.edits.rotate);
    return { w: activeReady.edits.crop.w * width, h: activeReady.edits.crop.h * height, width, height };
  })() : null;
  const previewSize = cropPixels ? outputSize(settings, mode, cropPixels.w, cropPixels.h) : null;
  const look = lookFor(settings, mode, activeReady ? (resolveFormat(settings, activeReady.file, mode) === "jpeg" ? "jpeg" : "png") : "jpeg");
  const emptyKey = mode === "photo" ? "photo" : mode === "signature" ? "signature" : "any";

  return (
    <div className="app">
      <AppHeader section="image" guard={items.length > 0} />
      {picker.input}
      <main className="workspace">
        <section className="ws-main">
          {!items.length ? (
            <div className="ws-empty">
              <div className="dropzone" role="button" tabIndex={0} onClick={picker.open} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); picker.open(); } }}>
                <span className="dz-icon"><ImagePlus size={24} /></span>
                <h2>{t(`image.empty.${emptyKey}.title`)}</h2>
                <p>{t(`image.empty.${emptyKey}.body`)}</p>
                <span className="btn btn-primary" style={{ marginTop: 6 }}>{mode === "any" ? t("common.chooseFiles") : t("common.chooseFile")}</span>
                <small>{t("image.empty.paste")}</small>
              </div>
            </div>
          ) : (
            <>
              <div className="toolbar" role="toolbar" aria-label={t("image.tool.crop")}>
                <button className="icon-btn" onClick={() => rotate(false)} disabled={!activeReady} aria-label={t("image.tool.rotateLeft")} title={t("image.tool.rotateLeft")}><RotateCcw size={18} /></button>
                <button className="icon-btn" onClick={() => rotate(true)} disabled={!activeReady} aria-label={t("image.tool.rotateRight")} title={t("image.tool.rotateRight")}><RotateCw size={18} /></button>
                <button className="icon-btn" onClick={() => flip("horizontal")} disabled={!activeReady} aria-label={t("image.tool.flipH")} title={t("image.tool.flipH")}><FlipHorizontal2 size={18} /></button>
                <button className="icon-btn" onClick={() => flip("vertical")} disabled={!activeReady} aria-label={t("image.tool.flipV")} title={t("image.tool.flipV")}><FlipVertical2 size={18} /></button>
                <span className="divider" />
                <label className="straighten">
                  <span>{t("image.tool.straighten")}</span>
                  <input className="slider" type="range" min={-30} max={30} step={0.5} value={activeReady?.edits.straighten ?? 0} disabled={!activeReady} onChange={(event) => { const value = Number(event.target.value); updateEdits((item) => ({ ...item.edits, straighten: value })); }} />
                  <output>{(activeReady?.edits.straighten ?? 0).toFixed(1).replace(/\.0$/, "")}°</output>
                </label>
                {mode === "any" && (settings.sizeMode !== "exact" || settings.lockAspect) ? (
                  <>
                    <span className="divider" />
                    <label className="inline">
                      <span>{t("image.tool.crop")}</span>
                      <select className="select compact" value={settings.cropShape} onChange={(event) => changeSettings({ cropShape: event.target.value })}>
                        {CROP_SHAPES.map((shape) => <option key={shape.id} value={shape.id}>{shape.id === "free" ? t("crop.free") : shape.id === "original" ? t("crop.original") : shape.id === "1:1" ? `${t("crop.square")} 1:1` : shape.id}</option>)}
                      </select>
                    </label>
                  </>
                ) : null}
                {mode === "photo" ? (
                  <button className="icon-btn" aria-pressed={settings.faceGuide} onClick={() => changeSettings({ faceGuide: !settings.faceGuide })} aria-label={t("image.tool.guide")} title={t("image.tool.guide")}><ScanFace size={18} /></button>
                ) : null}
                <span className="spacer" />
                <button className="icon-btn" onClick={resetEdits} disabled={!activeReady} aria-label={t("image.tool.reset")} title={t("image.tool.reset")}><Undo2 size={18} /></button>
                <button className="icon-btn" onClick={picker.open} aria-label={t("image.add")} title={t("image.add")}><ImagePlus size={18} /></button>
                <button className="icon-btn danger" onClick={() => (items.length > 1 ? removeAll() : active && removeItem(active.id))} aria-label={items.length > 1 ? t("image.removeAll") : t("image.remove", { name: active?.file.name ?? "" })} title={items.length > 1 ? t("image.removeAll") : t("common.remove")}><Trash2 size={18} /></button>
              </div>

              {activeReady ? (
                <CropStage
                  source={stageSource}
                  edits={activeReady.edits}
                  look={look}
                  background={useCutout ? backgroundColor(settings) : null}
                  aspect={aspect}
                  onCrop={(crop: Rect) => updateEdits((item) => ({ ...item.edits, crop }))}
                  caption={mode === "photo" && settings.caption ? { name: settings.captionName, date: settings.captionDate } : null}
                  faceGuide={mode === "photo" && settings.faceGuide}
                  label={t("image.tool.crop")}
                  badge={previewSize ? <span className="dims-badge">{previewSize.width} × {previewSize.height} px</span> : null}
                  overlay={!stageSource ? <div className="stage-busy"><div><Spinner large /></div></div> : null}
                />
              ) : (
                <div className="stage">
                  {active?.status === "error" ? (
                    <div className="note note-danger" style={{ maxWidth: 440 }}>
                      <CircleAlert size={18} />
                      <span style={{ display: "grid", gap: 10 }}>
                        <span>{active.error}</span>
                        <button className="btn btn-sm" style={{ justifySelf: "start" }} onClick={() => removeItem(active.id)}><X size={15} />{t("common.remove")}</button>
                      </span>
                    </div>
                  ) : <Spinner large />}
                </div>
              )}

              {items.length > 1 ? (
                <div className="filmstrip" role="list">
                  {items.map((item) => (
                    <div key={item.id} className="film-item" role="listitem" aria-current={item.id === active?.id}>
                      <button type="button" style={{ width: "100%", height: "100%" }} onClick={() => selectItem(item)} aria-label={item.file.name} title={item.file.name}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                        <img src={item.thumb} alt="" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} />
                      </button>
                      <button type="button" className="film-remove" onClick={() => removeItem(item.id)} aria-label={t("image.remove", { name: item.file.name })}><X size={12} /></button>
                      {item.status === "error" ? <CircleAlert size={16} style={{ position: "absolute", left: 4, bottom: 4, color: "var(--danger)" }} /> : null}
                    </div>
                  ))}
                  <button type="button" className="film-add" onClick={picker.open} aria-label={t("image.add")} title={t("image.add")}><ImagePlus size={20} /></button>
                </div>
              ) : null}
            </>
          )}
        </section>

        <aside className="ws-side" aria-label="Settings">
          <div className="side-scroll">
            <ImagePanel
              mode={mode}
              onMode={changeMode}
              settings={settings}
              onChange={changeSettings}
              itemCount={items.length}
              cropAspect={activeReady && cropPixels ? cropAspect(activeReady.edits.crop, cropPixels.width, cropPixels.height) : 1}
              cutout={activeReady?.cutout ?? { state: "idle" }}
            />
          </div>
          {items.length ? (
            <ResultFooter
              output={output}
              busy={busy || activeReady?.cutout.state === "working"}
              settings={settings}
              itemCount={items.filter((item) => item.status !== "error").length}
              exporting={exporting}
              onDownload={downloadCurrent}
              onDownloadAll={downloadAll}
              onSheet={downloadSheet}
              showSheets={mode === "photo"}
              disabled={!activeReady}
            />
          ) : null}
        </aside>
      </main>
      {dragging ? <div className="drop-overlay">{t("common.dropToAdd")}</div> : null}
    </div>
  );
}

function newItem(file: File): ImageItem {
  return {
    id: uid(),
    file,
    thumb: URL.createObjectURL(file),
    status: "loading",
    width: 0,
    height: 0,
    edits: { rotate: 0, flip: false, straighten: 0, crop: { x: 0, y: 0, w: 1, h: 1 } },
    cutout: { state: "idle" },
  };
}
