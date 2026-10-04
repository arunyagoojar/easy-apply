"use client";

import { setJpegDpi } from "../bytes";
import { canvasBytes } from "../image/encode";
import { createCanvas, releaseCanvas } from "../image/render";

// pdf.js is loaded lazily so pages that never touch a PDF stay light.
type PdfJs = typeof import("pdfjs-dist");
export type PdfProxy = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;

let loader: Promise<PdfJs> | undefined;

export function loadPdfJs(): Promise<PdfJs> {
  loader ??= (async () => {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  return loader;
}

// Copied to public/pdfjs by scripts/copy-pdfjs-assets.mjs.
const ASSETS = "/pdfjs/";

export class PasswordError extends Error {
  constructor(public readonly incorrect: boolean) {
    super(incorrect ? "The password is incorrect." : "This PDF needs a password.");
  }
}

/** Opens a PDF for rendering. The bytes are copied because pdf.js takes ownership of its buffer. */
export async function openPdf(bytes: Uint8Array, password?: string): Promise<PdfProxy> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    password,
    cMapUrl: `${ASSETS}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    wasmUrl: `${ASSETS}wasm/`,
    iccUrl: `${ASSETS}iccs/`,
  });
  try {
    return await task.promise;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "PasswordException") {
      await task.destroy().catch(() => undefined);
      throw new PasswordError((error as { code?: number }).code === pdfjs.PasswordResponses.INCORRECT_PASSWORD);
    }
    throw error;
  }
}

/** Releases a document and its worker resources. */
export function closePdf(document: PdfProxy) {
  return document.loadingTask.destroy().catch(() => undefined);
}

export type PageGeometry = { view: [number, number, number, number]; rotate: number };

export async function pageGeometry(document: PdfProxy, pageIndex: number): Promise<PageGeometry> {
  const page = await document.getPage(pageIndex + 1);
  const [x1, y1, x2, y2] = page.view;
  return { view: [x1, y1, x2, y2], rotate: ((page.rotate % 360) + 360) % 360 };
}

/**
 * Renders one page to a canvas. `rotation` is absolute (0 renders the page
 * unrotated); by default the page's own rotation is used. Form fields and
 * other annotations are drawn too, so filled-in forms look right.
 */
export async function renderPage(document: PdfProxy, pageIndex: number, scale: number, rotation?: number): Promise<HTMLCanvasElement> {
  const pdfjs = await loadPdfJs();
  const page = await document.getPage(pageIndex + 1);
  const viewport = page.getViewport(rotation === undefined ? { scale } : { scale, rotation });
  const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
  await page.render({ canvas, viewport, annotationMode: pdfjs.AnnotationMode.ENABLE, background: "#ffffff" }).promise;
  page.cleanup();
  return canvas;
}

/** Renders a page to a JPEG thumbnail sized to `width` CSS pixels. */
export async function renderThumbnail(document: PdfProxy, pageIndex: number, width: number): Promise<Blob> {
  const page = await document.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const canvas = await renderPage(document, pageIndex, Math.max(0.05, width / base.width));
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  releaseCanvas(canvas);
  if (!blob) throw new Error("Could not render the page preview.");
  return blob;
}

/** Renders a page as a JPEG at the given resolution (with DPI metadata). */
export async function renderPageJpeg(document: PdfProxy, pageIndex: number, dpi: number, quality: number, rotation?: number) {
  const canvas = await renderPage(document, pageIndex, dpi / 72, rotation);
  const bytes = setJpegDpi(await canvasBytes(canvas, "jpeg", quality), dpi);
  const size = { width: canvas.width, height: canvas.height };
  releaseCanvas(canvas);
  return { bytes, ...size };
}

export { createCanvas };
