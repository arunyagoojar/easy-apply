"use client";

import { context2d, createCanvas, type Source } from "./render";

// Passport-style photos never need more than this for the mask.
const MAX_SIDE = 2048;

/**
 * Cuts the subject out of a photo with the on-device IMG.LY model. The model
 * (about 40 MB) downloads from IMG.LY's CDN on first use; the photo itself
 * never leaves the browser. `onProgress` receives the download fraction, or
 * null while the model is running.
 */
export async function removeBackground(source: Source, onProgress: (fraction: number | null) => void): Promise<Source> {
  const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height));
  const canvas = createCanvas(source.width * scale, source.height * scale);
  const context = context2d(canvas, { willReadFrequently: true });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source.image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  // Raw RGBA avoids a lossy encode and any EXIF-orientation ambiguity.
  const input = new Blob([pixels.data.buffer as ArrayBuffer], { type: `image/x-rgba8;width=${canvas.width};height=${canvas.height}` });

  const downloads = new Map<string, [number, number]>();
  const { removeBackground: run } = await import("@imgly/background-removal");
  const output = await run(input, {
    model: "isnet_fp16",
    output: { format: "image/x-rgba8" },
    progress: (key, current, total) => {
      if (!key.startsWith("fetch:")) { onProgress(null); return; }
      downloads.set(key, [current, total]);
      let done = 0;
      let all = 0;
      downloads.forEach(([value, size]) => { done += value; all += size; });
      onProgress(all ? done / all : null);
    },
  });
  onProgress(null);

  const data = new Uint8ClampedArray(await output.arrayBuffer());
  const result = createCanvas(canvas.width, canvas.height);
  context2d(result).putImageData(new ImageData(data, canvas.width, canvas.height), 0, 0);
  return { image: result, width: result.width, height: result.height };
}
