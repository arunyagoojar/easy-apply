"use client";

import { isJpeg, isPng, padJpeg, padPng } from "../bytes";
import { baseName } from "../files";
import { bytesToBlob, encodeCanvas, imagesToPdf, type Encoded, type PdfPage, type RasterFormat } from "./encode";
import { releaseCanvas, renderImage, workingSize, type Look, type Source } from "./render";
import {
  backgroundColor,
  dimensionsAreFixed,
  extensionFor,
  outputSize,
  resolveFormat,
  type ImageEdits,
  type ImageMode,
  type ImageSettings,
} from "./settings";

export type ProduceInput = {
  file: File;
  source: Source;
  /** True when `source` is the background-removed cut-out. */
  cutout: boolean;
  edits: ImageEdits;
  settings: ImageSettings;
  mode: ImageMode;
};

export type Produced = {
  blob: Blob;
  name: string;
  format: "jpeg" | "png" | "webp" | "pdf";
  raster: RasterFormat;
  width: number;
  height: number;
  size: number;
  quality: number | null;
  padded: boolean;
  overMax: boolean;
  scaledDown: boolean;
  resizedForSize: boolean;
  webpFallback: boolean;
  /** DPI written into the file, or null when none was set. */
  dpi: number | null;
  /** The encoded image inside a PDF, kept for print sheets and combined PDFs. */
  page: PdfPage;
};

const PDF_OVERHEAD = 1400;
// When dimensions are free, shrink the picture rather than dropping JPEG
// quality below this point: it looks far better at the same file size.
const QUALITY_FLOOR = 45;

export function lookFor(settings: ImageSettings, mode: ImageMode, raster: RasterFormat): Look {
  const signatureAlpha = mode === "signature" && settings.transparent && raster !== "jpeg";
  return {
    brightness: settings.brightness,
    contrast: settings.contrast,
    saturation: settings.saturation,
    grayscale: settings.grayscale,
    cleanup: mode === "signature" && (settings.cleanup || signatureAlpha)
      ? { strength: settings.cleanupStrength, ink: settings.ink, transparent: signatureAlpha }
      : null,
  };
}

/**
 * "Any image" with nothing to change: hand back the original bytes (padded
 * when a minimum size is set) instead of re-encoding, which would only add
 * generation loss and often make the file bigger.
 */
async function passthrough(input: ProduceInput): Promise<Produced | null> {
  const { file, source, edits, settings, mode } = input;
  if (mode !== "any" || input.cutout) return null;
  if (settings.sizeMode !== "original" && !(settings.sizeMode === "scale" && settings.scale === 100)) return null;
  const { crop } = edits;
  if (edits.rotate || edits.flip || edits.straighten || crop.x > 0.0005 || crop.y > 0.0005 || crop.w < 0.9995 || crop.h < 0.9995) return null;
  if (settings.brightness !== 100 || settings.contrast !== 100 || settings.saturation !== 100 || settings.grayscale) return null;
  if (settings.maxKb && file.size > settings.maxKb * 1024) return null;
  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
  const kind = isJpeg(bytes) ? "jpeg" : isPng(bytes) ? "png" : null;
  if (!kind || resolveFormat(settings, file, mode) !== kind) return null;
  let padded = false;
  if (settings.minKb && bytes.length < settings.minKb * 1024) {
    const target = Math.min(Math.round(settings.minKb * 1024), settings.maxKb ? Math.round(settings.maxKb * 1024) : Infinity);
    bytes = kind === "jpeg" ? padJpeg(bytes, target) : padPng(bytes, target);
    padded = true;
  }
  return {
    blob: bytesToBlob(bytes, `image/${kind}`),
    name: `${baseName(file.name)}-${source.width}x${source.height}.${extensionFor(kind)}`,
    format: kind,
    raster: kind,
    width: source.width,
    height: source.height,
    size: bytes.length,
    quality: null,
    padded,
    overMax: false,
    scaledDown: false,
    resizedForSize: false,
    webpFallback: false,
    dpi: null,
    page: { bytes, format: kind, width: source.width, height: source.height, dpi: 96 },
  };
}

export async function produceImage(input: ProduceInput): Promise<Produced> {
  const unchanged = await passthrough(input);
  if (unchanged) return unchanged;
  const { file, source, edits, settings, mode } = input;
  const working = workingSize(source, edits);
  const region = { x: edits.crop.x * working.width, y: edits.crop.y * working.height, w: edits.crop.w * working.width, h: edits.crop.h * working.height };
  const size = outputSize(settings, mode, region.w, region.h);
  const format = resolveFormat(settings, file, mode);
  const raster: RasterFormat = format === "pdf" ? (mode === "signature" && settings.transparent ? "png" : "jpeg") : format;
  const opaque = raster === "jpeg" || mode === "photo" || (mode === "signature" && !settings.transparent);
  const look = lookFor(settings, mode, raster);
  const background = mode === "photo" && input.cutout ? backgroundColor(settings) : null;
  const caption = mode === "photo" && settings.caption ? { name: settings.captionName, date: settings.captionDate } : null;
  // DPI only means something for physical sizes (photos, signatures, cm/mm/in).
  const dpi = mode !== "any" || (settings.sizeMode === "exact" && settings.unit !== "px") ? settings.dpi : null;
  const pageDpi = dpi ?? 96;

  const maxBytes = settings.maxKb ? Math.round(settings.maxKb * 1024) : null;
  const minBytes = settings.minKb ? Math.round(settings.minKb * 1024) : null;
  const fixed = dimensionsAreFixed(settings);

  const render = (width: number, height: number) => renderImage({ source, edits, region, width, height, look, background, opaque, caption });

  const encodeWithin = async (budget: number | null) => {
    let width = size.width;
    let height = size.height;
    let resizedForSize = false;
    const shrinkable = !fixed && !!budget;
    const options = (floor: boolean) => ({ format: raster, quality: settings.quality, maxBytes: budget, minBytes, dpi, minQuality: floor ? QUALITY_FLOOR : 1 });
    let canvas = render(width, height);
    let encoded: Encoded = await encodeCanvas(canvas, options(shrinkable));
    // Free dimensions: shrink the picture until it fits at a decent quality.
    for (let attempt = 0; shrinkable && encoded.overMax && attempt < 8; attempt += 1) {
      const factor = Math.max(0.3, Math.min(0.92, Math.sqrt(budget! / encoded.bytes.length) * 0.95));
      const nextWidth = Math.round(width * factor);
      const nextHeight = Math.round(height * factor);
      if (nextWidth < 16 || nextHeight < 16) break;
      width = nextWidth;
      height = nextHeight;
      resizedForSize = true;
      releaseCanvas(canvas);
      canvas = render(width, height);
      encoded = await encodeCanvas(canvas, options(true));
    }
    if (shrinkable && encoded.overMax) encoded = await encodeCanvas(canvas, options(false));
    releaseCanvas(canvas);
    return { encoded, width, height, resizedForSize };
  };

  let attempt = await encodeWithin(format === "pdf" && maxBytes ? Math.max(1024, maxBytes - PDF_OVERHEAD) : maxBytes);
  const page: PdfPage = { bytes: attempt.encoded.bytes, format: attempt.encoded.format === "png" ? "png" : "jpeg", width: attempt.width, height: attempt.height, dpi: pageDpi };
  let blob: Blob;
  let bytesLength: number;
  let overMax = attempt.encoded.overMax;

  if (format === "pdf") {
    let pdf = await imagesToPdf([page], baseName(file.name));
    // The PDF wrapper adds a little overhead; tighten the image budget if needed.
    for (let retry = 0; maxBytes && pdf.length > maxBytes && retry < 3 && !attempt.encoded.overMax; retry += 1) {
      const budget = Math.max(1024, attempt.encoded.bytes.length - (pdf.length - maxBytes) - 600);
      attempt = await encodeWithin(budget);
      page.bytes = attempt.encoded.bytes;
      page.format = attempt.encoded.format === "png" ? "png" : "jpeg";
      page.width = attempt.width;
      page.height = attempt.height;
      pdf = await imagesToPdf([page], baseName(file.name));
    }
    overMax = !!maxBytes && pdf.length > maxBytes;
    blob = bytesToBlob(pdf, "application/pdf");
    bytesLength = pdf.length;
  } else {
    blob = bytesToBlob(attempt.encoded.bytes, `image/${attempt.encoded.format}`);
    bytesLength = attempt.encoded.bytes.length;
  }

  const finalFormat = format === "pdf" ? "pdf" : attempt.encoded.format;
  return {
    blob,
    name: `${baseName(file.name)}-${attempt.width}x${attempt.height}.${extensionFor(finalFormat)}`,
    format: finalFormat,
    raster: attempt.encoded.format,
    width: attempt.width,
    height: attempt.height,
    size: bytesLength,
    quality: attempt.encoded.quality,
    padded: attempt.encoded.padded,
    overMax,
    scaledDown: size.scaledDown,
    resizedForSize: attempt.resizedForSize,
    webpFallback: attempt.encoded.webpFallback,
    dpi,
    page,
  };
}
