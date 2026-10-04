"use client";

import { CircleAlert, CircleCheck, Download, Ellipsis, FileArchive, FileImage, FilePlus2, Images, RotateCcw, RotateCw, Scissors, Trash2, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { normalizeQuarter, type Quarter } from "../../lib/geometry";
import { baseName, downloadBlob, errorMessage, isImageFile, isPdfFile, takeHandOff, uid, zipBlobs } from "../../lib/files";
import { decodeImage } from "../../lib/image/decode";
import { bytesToBlob } from "../../lib/image/encode";
import { rasterizeToFit, shrinkImages } from "../../lib/pdf/compress";
import { padPdf } from "../../lib/pdf/pad";
import { buildPdf, pdfToJpegs, splitPdf } from "../../lib/pdf/export";
import { FILE_COLORS, imagePageSize as imagePageSizeOf, type Annotation, type Asset, type ImagePageSize, type PageItem, type SourceDoc } from "../../lib/pdf/model";
import { forgetImage, renderPageView } from "../../lib/pdf/pageRender";
import { closePdf, openPdf, pageGeometry, PasswordError, renderThumbnail, type PdfProxy } from "../../lib/pdf/pdfjs";
import { formatBytes } from "../../lib/units";
import { AppHeader } from "../AppHeader";
import { useT } from "../LanguageProvider";
import { Dialog, Menu, NumberField, Segmented, Spinner, useFilePicker, useLeaveWarning, usePasteFiles, useToast, useWindowDrop } from "../ui";
import { PageEditor } from "./PageEditor";
import { PageGrid, thumbKey } from "./PageGrid";

export type PdfIntent = "organize" | "sign" | "edit" | "compress" | "increase" | "images";
type Compression = "none" | "balanced" | "range";

const ACCEPT = "application/pdf,.pdf,image/*,.heic,.heif";
const THUMB_WIDTH = 220;
const subscribeNothing = () => () => undefined;

export function PdfWorkspace({ intent = "organize" }: { intent?: PdfIntent }) {
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  if (!hydrated) {
    return (
      <div className="app">
        <AppHeader section="pdf" />
        <main className="workspace"><section className="ws-main" /><aside className="ws-side" /></main>
      </div>
    );
  }
  return <Workspace intent={intent} />;
}

function Workspace({ intent }: { intent: PdfIntent }) {
  const t = useT();
  const toast = useToast();
  const [sources, setSources] = useState<Record<string, SourceDoc>>({});
  const [pages, setPages] = useState<PageItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [failedThumbs, setFailedThumbs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(0);
  const [editor, setEditor] = useState<{ index: number; intent?: "sign" | "edit" } | null>(null);
  const [imagePageSize, setImagePageSize] = useState<ImagePageSize>("a4");
  const [compression, setCompression] = useState<Compression>(intent === "compress" ? "balanced" : intent === "increase" ? "range" : "none");
  const [minSize, setMinSize] = useState<number | null>(null);
  const [maxSize, setMaxSize] = useState<number | null>(null);
  const [sizeUnit, setSizeUnit] = useState<"KB" | "MB">("KB");
  const [busy, setBusy] = useState<{ label: string; progress?: number } | null>(null);
  const [result, setResult] = useState<{ name: string; size: number; original: number; notes: string[]; warn: boolean } | null>(null);
  const [password, setPassword] = useState<{ name: string; incorrect: boolean; resolve: (value: string | null) => void } | null>(null);
  const [passwordText, setPasswordText] = useState("");
  const [signatures, setSignatures] = useState<Asset[]>([]);
  const [undoDelete, setUndoDelete] = useState<{ pages: Array<{ page: PageItem; position: number }> } | null>(null);

  const proxies = useRef(new Map<string, PdfProxy>());
  const rendering = useRef(false);
  const autoOpened = useRef(false);
  const colorIndex = useRef(0);
  const latest = useRef({ sources, thumbs, pageCount: pages.length });
  useEffect(() => { latest.current = { sources, thumbs, pageCount: pages.length }; });
  useLeaveWarning(pages.length > 0);

  /* ------------------------------------------------------------- adding */

  const askPassword = (name: string, incorrect: boolean) => new Promise<string | null>((resolve) => {
    setPasswordText("");
    setPassword({ name, incorrect, resolve });
  });

  const addPdf = async (file: File): Promise<PageItem[]> => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let secret: string | undefined;
    let proxy: PdfProxy | null = null;
    while (!proxy) {
      try {
        proxy = await openPdf(bytes, secret);
      } catch (error) {
        if (!(error instanceof PasswordError)) throw error;
        const answer = await askPassword(file.name, error.incorrect);
        if (answer === null) return [];
        secret = answer;
      }
    }
    const id = uid();
    const geometries = [];
    for (let index = 0; index < proxy.numPages; index += 1) geometries.push(await pageGeometry(proxy, index));
    proxies.current.set(id, proxy);
    const color = FILE_COLORS[colorIndex.current++ % FILE_COLORS.length];
    setSources((current) => ({ ...current, [id]: { id, kind: "pdf", name: file.name, file, bytes, pageCount: proxy!.numPages, password: secret, color } }));
    return geometries.map((geometry, pageIndex) => ({
      id: uid(),
      sourceId: id,
      pageIndex,
      baseRotation: normalizeQuarter(geometry.rotate),
      rotation: 0 as Quarter,
      view: geometry.view,
      annotations: [],
    }));
  };

  const addImage = async (file: File): Promise<PageItem[]> => {
    const decoded = await decodeImage(file);
    const { width, height } = decoded;
    decoded.close();
    const id = uid();
    const color = FILE_COLORS[colorIndex.current++ % FILE_COLORS.length];
    setSources((current) => ({ ...current, [id]: { id, kind: "image", name: file.name, file, width, height, color } }));
    return [{ id: uid(), sourceId: id, pageIndex: 0, baseRotation: 0, rotation: 0, view: [0, 0, width, height], annotations: [] }];
  };

  const addFiles = useCallback(async (files: File[]) => {
    const accepted = files.filter((file) => isPdfFile(file) || isImageFile(file));
    const rejected = files.find((file) => !isPdfFile(file) && !isImageFile(file));
    if (rejected) toast(t("common.unsupported", { name: rejected.name }), "error");
    if (!accepted.length) return;
    setResult(null);
    setLoading((count) => count + accepted.length);
    for (const file of accepted) {
      try {
        const added = isPdfFile(file) ? await addPdf(file) : await addImage(file);
        if (added.length) {
          const firstIndex = latest.current.pageCount;
          latest.current.pageCount += added.length;
          setPages((current) => [...current, ...added]);
          if (!autoOpened.current && isPdfFile(file) && (intent === "sign" || intent === "edit")) {
            autoOpened.current = true;
            setEditor({ index: firstIndex, intent });
          }
        }
      } catch (error) {
        toast(isPdfFile(file) ? t("pdf.openFailed", { name: file.name }) : t("common.error", { error: errorMessage(error) }), "error");
      } finally {
        setLoading((count) => count - 1);
      }
    }
    // These helpers only use refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, t, toast]);

  const [initialFiles] = useState(() => takeHandOff("pdf"));
  const handedOff = useRef(false);
  useEffect(() => {
    if (handedOff.current || !initialFiles.length) return;
    handedOff.current = true;
    void Promise.resolve().then(() => addFiles(initialFiles));
  }, [initialFiles, addFiles]);

  const picker = useFilePicker(ACCEPT, (files) => { void addFiles(files); });
  const dragging = useWindowDrop((files) => { void addFiles(files); }, !editor);
  usePasteFiles((files) => { void addFiles(files); }, !editor);

  /* --------------------------------------------------------- thumbnails */

  useEffect(() => {
    if (rendering.current) return;
    const next = pages.find((page) => {
      const key = thumbKey(page, sources[page.sourceId], imagePageSize);
      return sources[page.sourceId] && !thumbs[key] && !failedThumbs.has(key);
    });
    if (!next) return;
    const source = sources[next.sourceId];
    const key = thumbKey(next, source, imagePageSize);
    rendering.current = true;
    (async () => {
      try {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        let blob: Blob;
        if (source.kind === "pdf") {
          const proxy = proxies.current.get(source.id);
          if (!proxy) throw new Error("closed");
          blob = await renderThumbnail(proxy, next.pageIndex, THUMB_WIDTH * ratio);
        } else {
          const page = imagePageSizeOf(source.width, source.height, imagePageSize);
          const canvas = await renderPageView(next, source, undefined, imagePageSize, (THUMB_WIDTH * ratio) / page.width, 0);
          blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("thumb"))), "image/jpeg", 0.82));
        }
        const url = URL.createObjectURL(blob);
        if (!latest.current.sources[next.sourceId]) { URL.revokeObjectURL(url); return; }
        setThumbs((current) => ({ ...current, [key]: url }));
      } catch {
        setFailedThumbs((current) => new Set(current).add(key));
      } finally {
        rendering.current = false;
      }
    })();
  }, [pages, sources, thumbs, failedThumbs, imagePageSize]);

  useEffect(() => () => {
    Object.values(latest.current.thumbs).forEach((url) => URL.revokeObjectURL(url));
    proxies.current.forEach((proxy) => { void closePdf(proxy); });
  }, []);

  /* ------------------------------------------------------------ editing */

  const toggle = (id: string, range: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (range && anchor) {
        const from = pages.findIndex((page) => page.id === anchor);
        const to = pages.findIndex((page) => page.id === id);
        if (from >= 0 && to >= 0) {
          const [start, end] = from < to ? [from, to] : [to, from];
          for (let index = start; index <= end; index += 1) next.add(pages[index].id);
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(id);
  };

  const rotate = (ids: string[], clockwise: boolean) => {
    setResult(null);
    setPages((current) => current.map((page) => (ids.includes(page.id) ? { ...page, rotation: normalizeQuarter(page.rotation + (clockwise ? 90 : -90)) } : page)));
  };

  const remove = (ids: string[]) => {
    setResult(null);
    const removed = pages.map((page, position) => ({ page, position })).filter((entry) => ids.includes(entry.page.id));
    setPages((current) => current.filter((page) => !ids.includes(page.id)));
    setSelected((current) => new Set([...current].filter((id) => !ids.includes(id))));
    setUndoDelete({ pages: removed });
  };

  const restoreDeleted = () => {
    if (!undoDelete) return;
    setPages((current) => {
      const next = [...current];
      for (const { page, position } of [...undoDelete.pages].sort((a, b) => a.position - b.position)) {
        if (sources[page.sourceId]) next.splice(Math.min(position, next.length), 0, page);
      }
      return next;
    });
    setUndoDelete(null);
  };

  const move = (ids: string[], insertAt: number) => {
    setResult(null);
    setPages((current) => {
      const moving = current.filter((page) => ids.includes(page.id));
      const before = current.slice(0, insertAt).filter((page) => !ids.includes(page.id));
      const after = current.slice(insertAt).filter((page) => !ids.includes(page.id));
      return [...before, ...moving, ...after];
    });
  };

  const removeSource = (sourceId: string) => {
    const proxy = proxies.current.get(sourceId);
    if (proxy) void closePdf(proxy);
    proxies.current.delete(sourceId);
    forgetImage(sourceId);
    setPages((current) => current.filter((page) => page.sourceId !== sourceId));
    setSources((current) => {
      const next = { ...current };
      delete next[sourceId];
      return next;
    });
    setThumbs((current) => Object.fromEntries(Object.entries(current).filter(([key, url]) => {
      const keep = !key.startsWith(`${sourceId}:`);
      if (!keep) URL.revokeObjectURL(url);
      return keep;
    })));
    setUndoDelete(null);
    setResult(null);
  };

  const removeEverything = () => {
    Object.keys(sources).forEach(removeSource);
    setSelected(new Set());
  };

  const getProxy = useCallback((sourceId: string) => proxies.current.get(sourceId), []);

  const setAnnotations = useCallback((pageId: string, annotations: Annotation[]) => {
    setResult(null);
    setPages((current) => current.map((page) => (page.id === pageId ? { ...page, annotations } : page)));
  }, []);

  /* ---------------------------------------------------------- downloads */

  const sourceList = Object.values(sources);
  const originalSize = sourceList.reduce((total, source) => total + source.file.size, 0);
  const hasImages = sourceList.some((source) => source.kind === "image");
  const selectedPages = pages.filter((page) => selected.has(page.id));
  const unitBytes = sizeUnit === "MB" ? 1024 * 1024 : 1024;
  const minBytes = compression === "range" && minSize ? Math.round(minSize * unitBytes) : null;
  const maxBytes = compression === "range" && maxSize ? Math.round(maxSize * unitBytes) : null;

  const outputBase = () => {
    const used = [...new Set(pages.map((page) => page.sourceId))].map((id) => sources[id]).filter(Boolean);
    const first = used[0] ? baseName(used[0].name) : "document";
    return used.length > 1 ? `${first}-merged` : `${first}-final`;
  };

  const run = async (kind: "pdf" | "split" | "jpg", scope: "all" | "selected") => {
    const list = scope === "selected" ? selectedPages : pages;
    if (!list.length) { toast(t("pdf.noPages"), "error"); return; }
    setResult(null);
    setBusy({ label: t("pdf.building", { done: 0, total: list.length }), progress: 0 });
    try {
      const built = await buildPdf(list, sources, {
        imagePageSize,
        proxies: proxies.current,
        onProgress: (done, total) => setBusy({ label: t("pdf.building", { done, total }), progress: done / total }),
      });
      let bytes = built.bytes;
      const notes: string[] = built.rasterized.length ? [t("pdf.protected")] : [];
      let warn = false;
      const base = outputBase() + (scope === "selected" ? "-selection" : "");
      if (kind === "pdf") {
        if (compression === "balanced" || (maxBytes && bytes.length > maxBytes)) {
          setBusy({ label: t("pdf.compressing", { step: 1 }) });
          const smaller = await shrinkImages(bytes);
          if (smaller.length < bytes.length) bytes = smaller;
        }
        if (maxBytes && bytes.length > maxBytes) {
          const fitted = await rasterizeToFit(bytes, maxBytes, (step) => setBusy({ label: t("pdf.compressing", { step: step + 1 }) }));
          if (fitted.bytes.length < bytes.length) bytes = fitted.bytes;
          notes.push(fitted.fits ? t("pdf.result.rasterized") : t("pdf.result.cantFit", { limit: formatBytes(maxBytes), size: formatBytes(fitted.bytes.length) }));
          warn = !fitted.fits;
        }
        if (minBytes && bytes.length < minBytes && (!maxBytes || minBytes <= maxBytes)) {
          bytes = await padPdf(bytes, minBytes);
          notes.push(t("pdf.result.padded"));
        }
        const name = `${base}.pdf`;
        downloadBlob(bytesToBlob(bytes, "application/pdf"), name);
        setResult({ name, size: bytes.length, original: originalSize, notes, warn });
      } else if (kind === "split") {
        const parts = await splitPdf(bytes, base);
        const blob = parts.length === 1 ? parts[0].blob : await zipBlobs(parts);
        const name = parts.length === 1 ? parts[0].name : `${base}-pages.zip`;
        downloadBlob(blob, name);
        setResult({ name, size: blob.size, original: originalSize, notes, warn });
      } else {
        const images = await pdfToJpegs(bytes, base, 200, (done, total) => setBusy({ label: t("pdf.rendering", { done, total }), progress: done / total }));
        const blob = images.length === 1 ? images[0].blob : await zipBlobs(images);
        const name = images.length === 1 ? images[0].name : `${base}-images.zip`;
        downloadBlob(blob, name);
        setResult({ name, size: blob.size, original: originalSize, notes, warn });
      }
    } catch (error) {
      toast(t("common.error", { error: errorMessage(error) }), "error");
    } finally {
      setBusy(null);
    }
  };

  /* ------------------------------------------------------------- render */

  const emptyTitle = intent === "sign" ? t("pdf.empty.sign") : intent === "edit" ? t("pdf.empty.edit") : intent === "compress" ? t("pdf.empty.compress") : intent === "increase" ? t("pdf.empty.increase") : intent === "images" ? t("pdf.empty.images") : t("pdf.empty.title");
  const emptyBody = intent === "images" ? t("pdf.empty.imagesBody") : t("pdf.empty.body");
  const hasContent = pages.length > 0 || loading > 0;

  return (
    <div className="app">
      <AppHeader section="pdf" guard={pages.length > 0} />
      {picker.input}
      <main className="workspace">
        <section className="ws-main">
          {!hasContent ? (
            <div className="ws-empty">
              <div className="dropzone" role="button" tabIndex={0} onClick={picker.open} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); picker.open(); } }}>
                <span className="dz-icon">{intent === "images" ? <Images size={24} /> : <FilePlus2 size={24} />}</span>
                <h2>{emptyTitle}</h2>
                <p>{emptyBody}</p>
                <span className="btn btn-primary" style={{ marginTop: 6 }}>{t("common.chooseFiles")}</span>
                <small>{t("hub.drop.formats")}</small>
              </div>
            </div>
          ) : (
            <>
              <div className="toolbar">
                {selected.size ? (
                  <div className="selection-bar">
                    <span className="count">{t("pdf.selected", { count: selected.size })}</span>
                    <button className="btn btn-sm" onClick={() => rotate([...selected], false)}><RotateCcw size={15} />{t("pdf.rotateLeft")}</button>
                    <button className="btn btn-sm" onClick={() => rotate([...selected], true)}><RotateCw size={15} />{t("pdf.rotateRight")}</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove([...selected])}><Trash2 size={15} />{t("pdf.delete")}</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set())}><X size={15} />{t("pdf.clearSelection")}</button>
                  </div>
                ) : (
                  <>
                    <button className="btn btn-sm" onClick={picker.open}><FilePlus2 size={15} />{t("pdf.add")}</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setSelected(new Set(pages.map((page) => page.id)))} disabled={!pages.length}>{t("pdf.selectAll")}</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditor({ index: 0 })} disabled={!pages.length}>{t("pdf.edit")}</button>
                  </>
                )}
                {undoDelete ? <button className="btn btn-sm" onClick={restoreDeleted}><Undo2 size={15} />{t("common.undo")} · {undoDelete.pages.length === 1 ? t("pdf.deleted.one") : t("pdf.deleted.many", { count: undoDelete.pages.length })}</button> : null}
                <span className="spacer" />
                <span className="hint" style={{ maxWidth: 360 }}>{t("pdf.dragHint")}</span>
              </div>
              <p id="pdf-move-hint" className="sr-only">{t("pdf.moveHint")}</p>
              <div className="pdf-scroll">
                <PageGrid
                  pages={pages}
                  sources={sources}
                  thumbs={thumbs}
                  selected={selected}
                  imagePageSize={imagePageSize}
                  loading={loading}
                  onToggle={toggle}
                  onRotate={rotate}
                  onDelete={remove}
                  onEdit={(index) => setEditor({ index })}
                  onMove={move}
                  onAdd={picker.open}
                />
              </div>
            </>
          )}
        </section>

        <aside className="ws-side" aria-label={t("pdf.download")}>
          <div className="side-scroll">
            <div className="side-section">
              <h3>{t("pdf.files")}{sourceList.length ? <button className="link-btn" style={{ fontSize: 12, textTransform: "none", letterSpacing: 0 }} onClick={removeEverything}>{t("pdf.startOver")}</button> : null}</h3>
              {sourceList.length ? (
                <>
                  <p className="hint" style={{ marginBottom: 10 }}>{sourceList.length > 1 ? t("pdf.summary", { pages: pages.length, files: sourceList.length }) : pages.length === 1 ? t("pdf.pages.one") : t("pdf.pages.many", { count: pages.length })} · {formatBytes(originalSize)}</p>
                  <ul className="file-legend">
                    {sourceList.map((source) => (
                      <li key={source.id}>
                        <span className="file-dot" style={{ background: source.color }} />
                        <span className="name" title={source.name}>{source.name}</span>
                        <small>{source.kind === "pdf" ? `${source.pageCount} p` : <FileImage size={13} />}</small>
                        <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => removeSource(source.id)} aria-label={t("pdf.removeFile", { name: source.name })} title={t("pdf.removeFile", { name: source.name })}><X size={14} /></button>
                      </li>
                    ))}
                  </ul>
                  {sourceList.some((source) => source.kind === "pdf" && source.password) ? <p className="note" style={{ marginTop: 10 }}><CircleAlert size={15} />{t("pdf.protected")}</p> : null}
                </>
              ) : <p className="hint">{emptyBody}</p>}
            </div>

            {hasImages ? (
              <div className="side-section">
                <h3>{t("pdf.pageSize.title")}</h3>
                <Segmented label={t("pdf.pageSize.title")} value={imagePageSize} onChange={(value) => { setImagePageSize(value); setResult(null); }} options={[
                  { value: "a4", label: t("pdf.pageSize.a4") },
                  { value: "letter", label: t("pdf.pageSize.letter") },
                  { value: "fit", label: t("pdf.pageSize.fit") },
                ]} />
              </div>
            ) : null}

            <div className="side-section">
              <h3>{t("pdf.compression.title")}</h3>
              <div className="radio-list" role="radiogroup" aria-label={t("pdf.compression.title")}>
                {([
                  ["none", t("pdf.compression.none"), t("pdf.compression.noneHint")],
                  ["balanced", t("pdf.compression.balanced"), t("pdf.compression.balancedHint")],
                  ["range", t("pdf.compression.target"), t("pdf.compression.targetHint")],
                ] as Array<[Compression, string, string]>).map(([value, label, hint]) => (
                  <div key={value} className="radio-card" role="radio" tabIndex={0} aria-checked={compression === value} onClick={() => { setCompression(value); setResult(null); }} onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); setCompression(value); } }}>
                    <span className="dot" />
                    <span style={{ flex: 1 }}>
                      <b>{label}</b>
                      <small>{hint}</small>
                      {value === "range" && compression === "range" ? (
                        <span className="dims" style={{ marginTop: 10, gridTemplateColumns: "1fr auto 1fr auto" }} onClick={(event) => event.stopPropagation()}>
                          <span className="input-group">
                            <NumberField value={minSize} onChange={(next) => { setMinSize(next); setResult(null); }} min={0.1} max={100000} decimals={sizeUnit === "MB" ? 2 : 0} allowEmpty placeholder={t("image.kb.min")} ariaLabel={`${t("image.kb.min")} ${sizeUnit}`} />
                          </span>
                          <span className="times">–</span>
                          <span className="input-group">
                            <NumberField value={maxSize} onChange={(next) => { setMaxSize(next); setResult(null); }} min={0.1} max={100000} decimals={sizeUnit === "MB" ? 2 : 0} allowEmpty placeholder={t("image.kb.max")} ariaLabel={`${t("image.kb.max")} ${sizeUnit}`} />
                          </span>
                          <span className="input-group" style={{ width: 62 }}>
                            <select className="suffix" style={{ width: "100%", borderLeft: 0 }} value={sizeUnit} onChange={(event) => setSizeUnit(event.target.value as "KB" | "MB")} aria-label="Unit">
                              <option>KB</option>
                              <option>MB</option>
                            </select>
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {hasContent ? (
            <div className="side-footer">
              {busy ? (
                <div className="field" aria-live="polite">
                  <span className="row hint"><Spinner />{busy.label}</span>
                  {busy.progress !== undefined ? <div className="progress"><span style={{ width: `${Math.round(busy.progress * 100)}%` }} /></div> : null}
                </div>
              ) : result ? (
                <div className="field" aria-live="polite">
                  <span className={`check ${result.warn ? "warn" : "ok"}`} style={{ fontSize: 13 }}>
                    {result.warn ? <CircleAlert size={15} /> : <CircleCheck size={15} />}
                    <span>{t("pdf.result", { name: result.name, size: formatBytes(result.size) })}</span>
                  </span>
                  {result.size < result.original * 0.95 && result.name.endsWith(".pdf") ? <span className="hint">{t("pdf.result.smaller", { percent: Math.round((1 - result.size / result.original) * 100) })}</span> : null}
                  {result.notes.map((note) => <span key={note} className={`note ${result.warn ? "note-warning" : ""}`}>{note}</span>)}
                </div>
              ) : null}
              <div className="row">
                <button className="btn btn-primary btn-lg btn-block" onClick={() => run("pdf", "all")} disabled={!pages.length || !!busy || loading > 0}>
                  <Download size={18} />{t("pdf.download")}
                </button>
                <Menu
                  label={t("pdf.more")}
                  icon={<Ellipsis size={18} />}
                  buttonClassName="btn btn-lg"
                  items={[
                    ...(selectedPages.length ? [{ label: t("pdf.downloadSelected"), hint: t("pdf.scopeSelected", { count: selectedPages.length }), icon: <Download size={16} />, onSelect: () => run("pdf", "selected"), disabled: !!busy || loading > 0 }] : []),
                    { label: t("pdf.split"), hint: selectedPages.length ? t("pdf.scopeSelected", { count: selectedPages.length }) : t("pdf.splitHint"), icon: <Scissors size={16} />, onSelect: () => run("split", selectedPages.length ? "selected" : "all"), disabled: !pages.length || !!busy || loading > 0 },
                    { label: t("pdf.toJpg"), hint: selectedPages.length ? t("pdf.scopeSelected", { count: selectedPages.length }) : t("pdf.toJpgHint"), icon: <FileArchive size={16} />, onSelect: () => run("jpg", selectedPages.length ? "selected" : "all"), disabled: !pages.length || !!busy || loading > 0 },
                  ]}
                />
              </div>
            </div>
          ) : null}
        </aside>
      </main>

      {editor && pages.length ? (
        <PageEditor
          pages={pages}
          sources={sources}
          getProxy={getProxy}
          imagePageSize={imagePageSize}
          startIndex={editor.index}
          intent={editor.intent}
          signatures={signatures}
          onSignature={(asset) => setSignatures((current) => [...current, asset])}
          onAnnotations={setAnnotations}
          onClose={() => setEditor(null)}
        />
      ) : null}

      <Dialog
        open={!!password}
        onClose={() => { password?.resolve(null); setPassword(null); }}
        title={t("pdf.password.title")}
        footer={(
          <>
            <button className="btn" onClick={() => { password?.resolve(null); setPassword(null); }}>{t("pdf.password.skip")}</button>
            <button className="btn btn-primary" form="pdf-password-form" type="submit" disabled={!passwordText}>{t("pdf.password.open")}</button>
          </>
        )}
      >
        <form id="pdf-password-form" className="field" onSubmit={(event) => { event.preventDefault(); if (!passwordText) return; password?.resolve(passwordText); setPassword(null); }}>
          <p className="hint" style={{ color: "var(--text-2)" }}>{t("pdf.password.body", { name: password?.name ?? "" })}</p>
          <label className="label" htmlFor="pdf-password">{t("pdf.password.label")}</label>
          <input id="pdf-password" className="input" type="password" autoComplete="off" value={passwordText} onChange={(event) => setPasswordText(event.target.value)} data-autofocus />
          {password?.incorrect ? <p className="note note-danger">{t("pdf.password.wrong")}</p> : null}
        </form>
      </Dialog>

      {dragging ? <div className="drop-overlay">{t("common.dropToAdd")}</div> : null}
    </div>
  );
}
