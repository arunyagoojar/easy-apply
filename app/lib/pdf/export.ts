"use client";

import type { PDFDocument as PDFDocumentType, PDFFont, PDFImage, PDFPage } from "pdf-lib";
import { isJpeg, isPng, jpegOrientation } from "../bytes";
import { containBox, contentFrame, framePoint } from "../geometry";
import { decodeImage } from "../image/decode";
import { bytesToBlob, canvasBytes } from "../image/encode";
import { context2d, createCanvas, releaseCanvas } from "../image/render";
import { FONTS, LINE_HEIGHT, imagePageSize, pageBox, type Annotation, type FontId, type ImagePageSize, type PageItem, type SourceDoc, type TextAnnotation } from "./model";
import { closePdf, openPdf, renderPageJpeg, type PdfProxy } from "./pdfjs";

export type BuildOptions = {
  imagePageSize: ImagePageSize;
  /** Open pdf.js documents, reused for protected files. */
  proxies: Map<string, PdfProxy>;
  onProgress?: (done: number, total: number) => void;
};

export type BuildResult = { bytes: Uint8Array; rasterized: string[] };

const PROTECTED_DPI = 200;

function hexColor(rgb: typeof import("pdf-lib").rgb, hex: string) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((char) => char + char).join("") : value.padEnd(6, "0");
  const channel = (offset: number) => (parseInt(full.slice(offset, offset + 2), 16) || 0) / 255;
  return rgb(channel(0), channel(2), channel(4));
}

/** Embeds an image file, keeping JPEG/PNG bytes untouched whenever possible. */
async function embedImageFile(document: PDFDocumentType, file: File): Promise<PDFImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isJpeg(bytes) && jpegOrientation(bytes) === 1) {
    try { return await document.embedJpg(bytes); } catch { /* fall back to re-encoding */ }
  }
  if (isPng(bytes)) {
    try { return await document.embedPng(bytes); } catch { /* fall back to re-encoding */ }
  }
  // Rotated phone photos, WebP, GIF, HEIC (in Safari)…: decode with the
  // orientation applied and store as JPEG (or PNG when it may be transparent).
  const source = await decodeImage(file);
  const scale = Math.min(1, 5000 / Math.max(source.width, source.height));
  const canvas = createCanvas(source.width * scale, source.height * scale);
  const transparent = /png|webp|gif/i.test(file.type);
  const context = context2d(canvas);
  if (!transparent) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(source.image, 0, 0, canvas.width, canvas.height);
  source.close();
  const encoded = await canvasBytes(canvas, transparent ? "png" : "jpeg", 0.92);
  releaseCanvas(canvas);
  return transparent ? document.embedPng(encoded) : document.embedJpg(encoded);
}

/** Draws text that the standard PDF fonts cannot encode (e.g. Hindi) as an image. */
async function textAsPng(annotation: TextAnnotation, widthPt: number, heightPt: number) {
  const scale = 4;
  const canvas = createCanvas(Math.max(1, widthPt * scale), Math.max(1, heightPt * scale));
  const context = context2d(canvas);
  context.fillStyle = annotation.color;
  context.textBaseline = "alphabetic";
  context.font = `${annotation.bold ? "700 " : ""}${annotation.size * scale}px ${FONTS[annotation.font].css}`;
  annotation.text.split("\n").forEach((line, index) => {
    context.fillText(line, 0, (index * LINE_HEIGHT + FONTS[annotation.font].baseline) * annotation.size * scale);
  });
  const bytes = await canvasBytes(canvas, "png");
  releaseCanvas(canvas);
  return bytes;
}

async function drawAnnotations(
  lib: typeof import("pdf-lib"),
  document: PDFDocumentType,
  page: PDFPage,
  box: { x1: number; y1: number; width: number; height: number },
  annotations: Annotation[],
  cache: { fonts: Map<string, PDFFont>; images: Map<string, PDFImage> },
) {
  const { degrees, LineCapStyle, StandardFonts } = lib;
  const fontNames: Record<FontId, [string, string]> = {
    sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
    serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
    mono: [StandardFonts.Courier, StandardFonts.CourierBold],
  };
  const font = async (id: FontId, bold: boolean) => {
    const name = fontNames[id][bold ? 1 : 0];
    let embedded = cache.fonts.get(name);
    if (!embedded) {
      embedded = await document.embedFont(name);
      cache.fonts.set(name, embedded);
    }
    return embedded;
  };

  for (const annotation of annotations) {
    const fw = annotation.w * box.width;
    const fh = annotation.h * box.height;
    const footprint = { left: box.x1 + annotation.x * box.width, bottom: box.y1 + box.height - annotation.y * box.height - fh, width: fw, height: fh };
    const frame = contentFrame(footprint, annotation.rot);
    const color = hexColor(lib.rgb, annotation.kind === "image" ? "#000000" : annotation.color);

    if (annotation.kind === "rect") {
      page.drawRectangle({ x: footprint.left, y: footprint.bottom, width: fw, height: fh, color });
      continue;
    }

    if (annotation.kind === "mark") {
      const thickness = Math.max(0.6, Math.min(frame.contentWidth, frame.contentHeight) * 0.12);
      const point = (u: number, v: number) => framePoint(frame, u * frame.contentWidth, (1 - v) * frame.contentHeight);
      const segments: Array<[[number, number], [number, number]]> = annotation.mark === "check"
        ? [[[0.12, 0.55], [0.4, 0.82]], [[0.4, 0.82], [0.88, 0.18]]]
        : [[[0.18, 0.18], [0.82, 0.82]], [[0.82, 0.18], [0.18, 0.82]]];
      for (const [from, to] of segments) {
        page.drawLine({ start: point(...from), end: point(...to), thickness, color, lineCap: LineCapStyle.Round });
      }
      continue;
    }

    if (annotation.kind === "text") {
      const text = annotation.text.replace(/\t/g, "    ");
      if (!text.trim()) continue;
      const embedded = await font(annotation.font, annotation.bold);
      let encodable = true;
      try { text.split("\n").forEach((line) => embedded.encodeText(line)); } catch { encodable = false; }
      if (!encodable) {
        const png = await document.embedPng(await textAsPng({ ...annotation, text }, frame.contentWidth, frame.contentHeight));
        const origin = framePoint(frame, 0, 0);
        page.drawImage(png, { x: origin.x, y: origin.y, width: frame.contentWidth, height: frame.contentHeight, rotate: degrees(frame.angle) });
        continue;
      }
      text.split("\n").forEach((line, index) => {
        if (!line) return;
        const fromTop = (index * LINE_HEIGHT + FONTS[annotation.font].baseline) * annotation.size;
        const origin = framePoint(frame, 0, frame.contentHeight - fromTop);
        page.drawText(line, { x: origin.x, y: origin.y, size: annotation.size, font: embedded, color, rotate: degrees(frame.angle) });
      });
      continue;
    }

    let image = cache.images.get(annotation.asset.id);
    if (!image) {
      image = await document.embedPng(new Uint8Array(await annotation.asset.blob.arrayBuffer()));
      cache.images.set(annotation.asset.id, image);
    }
    const fit = containBox(frame.contentWidth, frame.contentHeight, annotation.asset.width / annotation.asset.height);
    const origin = framePoint(frame, fit.offsetX, fit.offsetY);
    page.drawImage(image, { x: origin.x, y: origin.y, width: fit.width, height: fit.height, rotate: degrees(frame.angle) });
  }
}

/**
 * Builds the final PDF: pages in the chosen order with their rotation and
 * edits. Each source file is loaded once and its pages copied in one pass,
 * so shared fonts and images are not duplicated.
 */
export async function buildPdf(pages: PageItem[], sources: Record<string, SourceDoc>, options: BuildOptions): Promise<BuildResult> {
  const lib = await import("pdf-lib");
  const { PDFDocument, degrees } = lib;
  const out = await PDFDocument.create();
  out.setProducer("EasyApply");
  out.setCreator("EasyApply");

  const needed = new Map<string, number[]>();
  for (const page of pages) {
    if (sources[page.sourceId]?.kind !== "pdf") continue;
    const list = needed.get(page.sourceId) ?? [];
    if (!list.includes(page.pageIndex)) list.push(page.pageIndex);
    needed.set(page.sourceId, list);
  }

  const copied = new Map<string, Map<number, PDFPage>>();
  const rasterized = new Set<string>();
  for (const [sourceId, indices] of needed) {
    const source = sources[sourceId];
    if (source.kind !== "pdf") continue;
    if (source.password) { rasterized.add(sourceId); continue; }
    try {
      const document = await PDFDocument.load(source.bytes, { updateMetadata: false });
      const copies = await out.copyPages(document, indices);
      copied.set(sourceId, new Map(indices.map((index, position) => [index, copies[position]])));
    } catch (error) {
      // Owner-password (restricted) PDFs open in pdf.js but not in pdf-lib.
      if (error instanceof lib.EncryptedPDFError || /encrypt/i.test(String(error))) rasterized.add(sourceId);
      else throw error;
    }
  }

  const cache = { fonts: new Map<string, PDFFont>(), images: new Map<string, PDFImage>() };
  const imageCache = new Map<string, PDFImage>();
  let done = 0;
  for (const page of pages) {
    const source = sources[page.sourceId];
    if (!source) continue;
    const box = pageBox(page, source, options.imagePageSize);
    let pdfPage: PDFPage;
    if (source.kind === "pdf" && !rasterized.has(source.id)) {
      pdfPage = out.addPage(copied.get(source.id)!.get(page.pageIndex)!);
    } else if (source.kind === "pdf") {
      let proxy = options.proxies.get(source.id);
      if (!proxy) {
        proxy = await openPdf(source.bytes, source.password);
        options.proxies.set(source.id, proxy);
      }
      const jpeg = await renderPageJpeg(proxy, page.pageIndex, PROTECTED_DPI, 0.9, 0);
      pdfPage = out.addPage([box.width, box.height]);
      pdfPage.drawImage(await out.embedJpg(jpeg.bytes), { x: 0, y: 0, width: box.width, height: box.height });
      box.x1 = 0;
      box.y1 = 0;
    } else {
      const size = imagePageSize(source.width, source.height, options.imagePageSize);
      pdfPage = out.addPage([size.width, size.height]);
      let image = imageCache.get(source.id);
      if (!image) {
        image = await embedImageFile(out, source.file);
        imageCache.set(source.id, image);
      }
      const fit = containBox(size.width, size.height, image.width / image.height);
      pdfPage.drawImage(image, { x: fit.offsetX, y: fit.offsetY, width: fit.width, height: fit.height });
    }
    pdfPage.setRotation(degrees((page.baseRotation + page.rotation) % 360));
    if (page.annotations.length) await drawAnnotations(lib, out, pdfPage, box, page.annotations, cache);
    done += 1;
    options.onProgress?.(done, pages.length);
  }
  return { bytes: await out.save({ useObjectStreams: true }), rasterized: [...rasterized] };
}

/** Splits a PDF into single-page PDFs. */
export async function splitPdf(bytes: Uint8Array, name: string) {
  const { PDFDocument } = await import("pdf-lib");
  const document = await PDFDocument.load(bytes);
  const parts: Array<{ name: string; blob: Blob }> = [];
  const digits = String(document.getPageCount()).length;
  for (let index = 0; index < document.getPageCount(); index += 1) {
    const single = await PDFDocument.create();
    single.setProducer("EasyApply");
    const [page] = await single.copyPages(document, [index]);
    single.addPage(page);
    parts.push({ name: `${name}-page-${String(index + 1).padStart(digits, "0")}.pdf`, blob: bytesToBlob(await single.save({ useObjectStreams: true }), "application/pdf") });
  }
  return parts;
}

/** Renders every page of a PDF as a JPEG at the given resolution. */
export async function pdfToJpegs(bytes: Uint8Array, name: string, dpi: number, onProgress?: (done: number, total: number) => void) {
  const proxy = await openPdf(bytes);
  try {
    const images: Array<{ name: string; blob: Blob }> = [];
    const digits = String(proxy.numPages).length;
    for (let index = 0; index < proxy.numPages; index += 1) {
      const jpeg = await renderPageJpeg(proxy, index, dpi, 0.9);
      images.push({ name: `${name}-page-${String(index + 1).padStart(digits, "0")}.jpg`, blob: bytesToBlob(jpeg.bytes, "image/jpeg") });
      onProgress?.(index + 1, proxy.numPages);
    }
    return images;
  } finally {
    await closePdf(proxy);
  }
}
