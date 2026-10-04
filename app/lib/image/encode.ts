"use client";

import { padJpeg, padPng, setJpegDpi, setPngDpi } from "../bytes";

export type RasterFormat = "jpeg" | "png" | "webp";

export type EncodeOptions = {
  format: RasterFormat;
  /** 1–100. Upper bound when a size limit applies. */
  quality: number;
  /** Lowest quality the size search may use (default 1). */
  minQuality?: number;
  minBytes?: number | null;
  maxBytes?: number | null;
  dpi?: number | null;
};

export type Encoded = {
  bytes: Uint8Array;
  format: RasterFormat;
  quality: number | null;
  padded: boolean;
  overMax: boolean;
  webpFallback: boolean;
};

let webpSupport: Promise<boolean> | undefined;

export function canEncodeWebp() {
  webpSupport ??= new Promise<boolean>((resolve) => {
    try {
      const probe = document.createElement("canvas");
      probe.width = 2;
      probe.height = 2;
      probe.toBlob((blob) => resolve(!!blob && blob.type === "image/webp"), "image/webp", 0.8);
    } catch {
      resolve(false);
    }
  });
  return webpSupport;
}

export async function canvasBytes(canvas: HTMLCanvasElement, format: RasterFormat, quality?: number) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, `image/${format}`, quality));
  if (!blob) throw new Error("The browser couldn't create the image file. The image may be too large.");
  return new Uint8Array(await blob.arrayBuffer());
}

function withDpi(bytes: Uint8Array, format: RasterFormat, dpi?: number | null) {
  if (!dpi) return bytes;
  if (format === "jpeg") return setJpegDpi(bytes, dpi);
  if (format === "png") return setPngDpi(bytes, dpi);
  return bytes;
}

function pad(bytes: Uint8Array, format: RasterFormat, minBytes: number) {
  if (format === "jpeg") return padJpeg(bytes, minBytes);
  if (format === "png") return padPng(bytes, minBytes);
  return bytes;
}

/**
 * Encodes a canvas, choosing the highest quality that fits `maxBytes` and
 * raising quality (or padding) to reach `minBytes`. Pixel dimensions are never
 * changed here; callers decide whether shrinking the image is acceptable.
 */
export async function encodeCanvas(canvas: HTMLCanvasElement, options: EncodeOptions): Promise<Encoded> {
  let format = options.format;
  let webpFallback = false;
  if (format === "webp" && !(await canEncodeWebp())) {
    format = "png";
    webpFallback = true;
  }
  const maxBytes = options.maxBytes && options.maxBytes > 0 ? options.maxBytes : null;
  const minBytes = options.minBytes && options.minBytes > 0 ? Math.min(options.minBytes, maxBytes ?? Infinity) : null;

  if (format === "png") {
    let bytes = withDpi(await canvasBytes(canvas, "png"), "png", options.dpi);
    const overMax = !!maxBytes && bytes.length > maxBytes;
    let padded = false;
    if (minBytes && bytes.length < minBytes) {
      bytes = pad(bytes, "png", minBytes);
      padded = true;
    }
    return { bytes, format, quality: null, padded, overMax, webpFallback };
  }

  const cache = new Map<number, Uint8Array>();
  const at = async (quality: number) => {
    let bytes = cache.get(quality);
    if (!bytes) {
      bytes = withDpi(await canvasBytes(canvas, format, quality / 100), format, options.dpi);
      cache.set(quality, bytes);
    }
    return bytes;
  };

  let quality = Math.round(Math.min(100, Math.max(1, options.quality)));
  let bytes = await at(quality);
  let overMax = false;

  if (maxBytes && bytes.length > maxBytes) {
    const floor = Math.min(quality, Math.max(1, Math.round(options.minQuality ?? 1)));
    let low = floor;
    let high = quality - 1;
    let best: number | null = null;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if ((await at(middle)).length <= maxBytes) {
        best = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    quality = best ?? floor;
    bytes = await at(quality);
    overMax = bytes.length > maxBytes;
  }

  let padded = false;
  if (minBytes && bytes.length < minBytes && !overMax) {
    // Prefer real quality over padding: find the lowest quality that reaches
    // the minimum while still respecting the maximum.
    if ((await at(100)).length < minBytes) {
      quality = 100;
      bytes = await at(100);
    } else {
      let low = quality + 1;
      let high = 100;
      while (low < high) {
        const middle = (low + high) >> 1;
        if ((await at(middle)).length >= minBytes) high = middle;
        else low = middle + 1;
      }
      const candidate = await at(low);
      if (!maxBytes || candidate.length <= maxBytes) {
        quality = low;
        bytes = candidate;
      }
    }
    if (bytes.length < minBytes) {
      bytes = pad(bytes, format, minBytes);
      padded = format !== "webp";
    }
  }
  return { bytes, format, quality, padded, overMax, webpFallback };
}

export type PdfPage = { bytes: Uint8Array; format: "jpeg" | "png"; width: number; height: number; dpi: number };

/** Wraps encoded images into a PDF, one page per image at its physical size. */
export async function imagesToPdf(pages: PdfPage[], title?: string) {
  const { PDFDocument } = await import("pdf-lib");
  const document = await PDFDocument.create();
  if (title) document.setTitle(title);
  document.setProducer("EasyApply");
  document.setCreator("EasyApply");
  for (const page of pages) {
    const image = page.format === "png" ? await document.embedPng(page.bytes) : await document.embedJpg(page.bytes);
    const width = (page.width / page.dpi) * 72;
    const height = (page.height / page.dpi) * 72;
    document.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
  }
  return document.save({ useObjectStreams: true });
}

export function bytesToBlob(bytes: Uint8Array, type: string) {
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type });
}
