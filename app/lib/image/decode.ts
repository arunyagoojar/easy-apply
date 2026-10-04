"use client";

import { isHeicFile } from "../files";
import { context2d, createCanvas, releaseCanvas, type Source } from "./render";

// Bigger photos (e.g. 48 MP phone shots) are scaled down once when opened so
// they fit comfortably in memory on phones. Forms never need more.
const MAX_SOURCE_PIXELS = 24_000_000;

export type DecodedSource = Source & { close: () => void; scaled: boolean };

export class HeicError extends Error {}

function loadElement(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    image.src = url;
  });
}

/** Decodes an image file with its EXIF orientation applied (as phones expect). */
export async function decodeImage(file: Blob): Promise<DecodedSource> {
  let image: ImageBitmap | HTMLImageElement;
  try {
    image = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      image = await loadElement(file);
    } catch {
      if (file instanceof File && isHeicFile(file)) throw new HeicError(file.name);
      throw new Error("decode");
    }
  }
  const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  if (!width || !height) throw new Error("decode");

  if (width * height > MAX_SOURCE_PIXELS) {
    const scale = Math.sqrt(MAX_SOURCE_PIXELS / (width * height));
    const canvas = createCanvas(width * scale, height * scale);
    context2d(canvas).drawImage(image, 0, 0, canvas.width, canvas.height);
    if ("close" in image) image.close();
    return { image: canvas, width: canvas.width, height: canvas.height, scaled: true, close: () => releaseCanvas(canvas) };
  }
  return { image, width, height, scaled: false, close: () => { if ("close" in image) image.close(); } };
}
