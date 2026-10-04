"use client";

import { jpegInfo, stripJpegExif } from "../bytes";
import { canvasBytes } from "../image/encode";
import { context2d, createCanvas, releaseCanvas } from "../image/render";
import { closePdf, openPdf, renderPage } from "./pdfjs";

/**
 * Re-compresses the JPEG photos and scans stored inside a PDF (downscaling
 * very large ones). Text, vector graphics and everything else are untouched,
 * so the document stays sharp and searchable. Only images whose colour
 * handling we can reproduce exactly are touched; an image is replaced only
 * when the new version is clearly smaller.
 */
export async function shrinkImages(bytes: Uint8Array, maxSide = 2000, quality = 0.72): Promise<Uint8Array> {
  const lib = await import("pdf-lib");
  const { PDFDocument, PDFName, PDFRawStream, PDFArray, PDFNumber, PDFRef, PDFDict } = lib;
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const context = document.context;
  const name = (value: string) => PDFName.of(value);
  let changed = false;

  for (const [ref, object] of context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const dict = object.dict;
    if (dict.get(name("Subtype")) !== name("Image")) continue;
    const filter = dict.get(name("Filter"));
    const dct = filter === name("DCTDecode") || (filter instanceof PDFArray && filter.size() === 1 && filter.get(0) === name("DCTDecode"));
    if (!dct || dict.has(name("Mask")) || dict.has(name("Decode")) || dict.has(name("ImageMask"))) continue;
    const bpc = dict.get(name("BitsPerComponent"));
    if (bpc instanceof PDFNumber && bpc.asNumber() !== 8) continue;

    // Colour space must be plain RGB or grey (or an ICC profile with 1 or 3 channels).
    let colorSpace = dict.get(name("ColorSpace"));
    if (colorSpace instanceof PDFRef) colorSpace = context.lookup(colorSpace);
    let channels = 0;
    if (colorSpace === name("DeviceRGB")) channels = 3;
    else if (colorSpace === name("DeviceGray")) channels = 1;
    else if (colorSpace instanceof PDFArray && colorSpace.get(0) === name("ICCBased")) {
      const profile = context.lookup(colorSpace.get(1));
      const count = profile instanceof PDFRawStream || profile instanceof PDFDict ? (profile instanceof PDFRawStream ? profile.dict : profile).get(name("N")) : undefined;
      channels = count instanceof PDFNumber ? count.asNumber() : 0;
    }
    if (channels !== 1 && channels !== 3) continue;

    const original = object.contents;
    if (original.length < 40_000) continue;
    const info = jpegInfo(original);
    if (!info || info.components !== channels) continue;

    try {
      const bitmap = await createImageBitmap(new Blob([stripJpegExif(original) as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), { colorSpaceConversion: "none" });
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = createCanvas(bitmap.width * scale, bitmap.height * scale);
      context2d(canvas).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const smaller = await canvasBytes(canvas, "jpeg", quality);
      const { width, height } = canvas;
      releaseCanvas(canvas);
      if (smaller.length > original.length * 0.9) continue;
      const nextDict = dict.clone(context);
      nextDict.set(name("Width"), PDFNumber.of(width));
      nextDict.set(name("Height"), PDFNumber.of(height));
      nextDict.set(name("Filter"), name("DCTDecode"));
      nextDict.delete(name("DecodeParms"));
      // Browsers always write 3-channel JPEGs.
      if (channels === 1) nextDict.set(name("ColorSpace"), name("DeviceRGB"));
      context.assign(ref, PDFRawStream.of(nextDict, smaller));
      changed = true;
    } catch {
      // Leave images the browser cannot decode exactly as they were.
    }
  }
  return changed ? document.save({ useObjectStreams: true }) : bytes;
}

const LADDER: Array<{ dpi: number; quality: number }> = [
  { dpi: 150, quality: 0.8 },
  { dpi: 150, quality: 0.65 },
  { dpi: 125, quality: 0.6 },
  { dpi: 110, quality: 0.55 },
  { dpi: 96, quality: 0.5 },
  { dpi: 84, quality: 0.45 },
  { dpi: 72, quality: 0.4 },
  { dpi: 60, quality: 0.35 },
  { dpi: 50, quality: 0.3 },
];

/**
 * Makes a PDF fit under `maxBytes` by turning each page into a JPEG, trying
 * progressively smaller settings (binary search over the ladder above).
 * Returns the best attempt that fits, or the smallest one if none does.
 */
export async function rasterizeToFit(bytes: Uint8Array, maxBytes: number, onStep?: (step: number) => void): Promise<{ bytes: Uint8Array; fits: boolean }> {
  const { PDFDocument } = await import("pdf-lib");
  const proxy = await openPdf(bytes);
  try {
    // Render every page once at the highest resolution, then derive smaller versions from it.
    const masters: Array<{ blob: Blob; widthPt: number; heightPt: number }> = [];
    for (let index = 0; index < proxy.numPages; index += 1) {
      const page = await proxy.getPage(index + 1);
      const viewport = page.getViewport({ scale: 1 });
      const canvas = await renderPage(proxy, index, LADDER[0].dpi / 72);
      const blob = new Blob([await canvasBytes(canvas, "jpeg", 0.95) as Uint8Array<ArrayBuffer>], { type: "image/jpeg" });
      releaseCanvas(canvas);
      masters.push({ blob, widthPt: viewport.width, heightPt: viewport.height });
    }

    const attempt = async (rung: { dpi: number; quality: number }) => {
      const document = await PDFDocument.create();
      document.setProducer("EasyApply");
      for (const master of masters) {
        const bitmap = await createImageBitmap(master.blob);
        const scale = rung.dpi / LADDER[0].dpi;
        const canvas = createCanvas(bitmap.width * scale, bitmap.height * scale);
        context2d(canvas).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const image = await document.embedJpg(await canvasBytes(canvas, "jpeg", rung.quality));
        releaseCanvas(canvas);
        document.addPage([master.widthPt, master.heightPt]).drawImage(image, { x: 0, y: 0, width: master.widthPt, height: master.heightPt });
      }
      return document.save({ useObjectStreams: true });
    };

    let low = 0;
    let high = LADDER.length - 1;
    let best: Uint8Array | null = null;
    let smallest: Uint8Array | null = null;
    let step = 0;
    while (low <= high) {
      const middle = (low + high) >> 1;
      step += 1;
      onStep?.(step);
      const result = await attempt(LADDER[middle]);
      if (!smallest || result.length < smallest.length) smallest = result;
      if (result.length <= maxBytes) {
        best = result;
        high = middle - 1;
      } else {
        low = middle + 1;
      }
    }
    return best ? { bytes: best, fits: true } : { bytes: smallest!, fits: false };
  } finally {
    await closePdf(proxy);
  }
}
