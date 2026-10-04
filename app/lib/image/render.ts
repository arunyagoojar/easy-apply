"use client";

import { coverScale, orientedSize, type Rect } from "../geometry";
import type { ImageEdits, InkColor } from "./settings";

export type Source = { image: CanvasImageSource; width: number; height: number };

export type Look = {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: boolean;
  cleanup: null | { strength: number; ink: InkColor; transparent: boolean };
};

export const CAPTION_RATIO = 0.17;

export function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function context2d(canvas: HTMLCanvasElement, settings?: CanvasRenderingContext2DSettings) {
  const context = canvas.getContext("2d", settings);
  if (!context) throw new Error("Image processing isn't available in this browser.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return context;
}

export function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

export function workingSize(source: { width: number; height: number }, edits: Pick<ImageEdits, "rotate">) {
  return orientedSize(source.width, source.height, edits.rotate);
}

/**
 * Draws `region` (in working-image pixels: after flip, quarter turns and
 * straightening) onto a new width × height canvas in a single resampling
 * pass, halving in steps when shrinking a lot so small outputs stay sharp.
 */
export function drawRegion(source: Source, edits: Pick<ImageEdits, "rotate" | "flip" | "straighten">, region: Rect, width: number, height: number) {
  const outWidth = Math.max(1, Math.round(width));
  const outHeight = Math.max(1, Math.round(height));
  const scale = Math.max(outWidth / region.w, outHeight / region.h);
  const steps = scale < 0.5 ? Math.min(6, Math.floor(Math.log2(1 / scale))) : 0;
  const factor = 2 ** steps;
  const working = workingSize(source, edits);

  let canvas = createCanvas(outWidth * factor, outHeight * factor);
  const context = context2d(canvas);
  const sx = canvas.width / region.w;
  const sy = canvas.height / region.h;
  context.setTransform(sx, 0, 0, sy, -region.x * sx, -region.y * sy);
  context.translate(working.width / 2, working.height / 2);
  if (edits.straighten) {
    context.rotate((edits.straighten * Math.PI) / 180);
    const cover = coverScale(working.width, working.height, edits.straighten);
    context.scale(cover, cover);
  }
  context.rotate((edits.rotate * Math.PI) / 180);
  if (edits.flip) context.scale(-1, 1);
  context.drawImage(source.image, -source.width / 2, -source.height / 2, source.width, source.height);

  for (let step = steps - 1; step >= 0; step -= 1) {
    const next = createCanvas(step === 0 ? outWidth : Math.round(outWidth * 2 ** step), step === 0 ? outHeight : Math.round(outHeight * 2 ** step));
    context2d(next).drawImage(canvas, 0, 0, next.width, next.height);
    releaseCanvas(canvas);
    canvas = next;
  }
  return canvas;
}

function otsuThreshold(histogram: Uint32Array, total: number) {
  let sum = 0;
  for (let value = 0; value < 256; value += 1) sum += value * histogram[value];
  let backgroundSum = 0;
  let backgroundWeight = 0;
  let best = 0;
  let threshold = 128;
  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += value * histogram[value];
    const meanBackground = backgroundSum / backgroundWeight;
    const meanForeground = (sum - backgroundSum) / foregroundWeight;
    const between = backgroundWeight * foregroundWeight * (meanBackground - meanForeground) ** 2;
    if (between > best) {
      best = between;
      threshold = value;
    }
  }
  return threshold;
}

const INK: Record<Exclude<InkColor, "original">, [number, number, number]> = {
  black: [18, 18, 24],
  blue: [20, 52, 160],
};

/**
 * Brightness / contrast / saturation applied directly to pixels (canvas
 * filters are not supported by Safari), plus signature clean-up.
 */
export function applyLook(canvas: HTMLCanvasElement, look: Look) {
  const neutral = look.brightness === 100 && look.contrast === 100 && look.saturation === 100 && !look.grayscale && !look.cleanup;
  if (neutral) return;
  const context = context2d(canvas, { willReadFrequently: true });
  const { width, height } = canvas;
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;

  const brightness = look.brightness / 100;
  const contrast = look.contrast / 100;
  const saturation = look.grayscale ? 0 : look.saturation / 100;
  if (brightness !== 1 || contrast !== 1 || saturation !== 1) {
    const table = new Uint8ClampedArray(256);
    for (let value = 0; value < 256; value += 1) table[value] = (value * brightness - 128) * contrast + 128;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      let r = table[data[i]];
      let g = table[data[i + 1]];
      let b = table[data[i + 2]];
      if (saturation !== 1) {
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = luma + (r - luma) * saturation;
        g = luma + (g - luma) * saturation;
        b = luma + (b - luma) * saturation;
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }

  if (look.cleanup) cleanSignature(data, width, height, look.cleanup);
  context.putImageData(image, 0, 0);
}

/**
 * Separates ink from paper with an adaptive (local-mean) threshold so shadows
 * and uneven lighting from phone photos don't turn into grey smudges.
 */
function cleanSignature(data: Uint8ClampedArray, width: number, height: number, options: NonNullable<Look["cleanup"]>) {
  const count = width * height;
  const luma = new Float32Array(count);
  const histogram = new Uint32Array(256);
  for (let p = 0, i = 0; p < count; p += 1, i += 4) {
    // Transparent pixels count as paper.
    const alpha = data[i + 3] / 255;
    const value = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * alpha + 255 * (1 - alpha);
    luma[p] = value;
    histogram[Math.min(255, Math.round(value))] += 1;
  }
  const globalThreshold = otsuThreshold(histogram, count);

  const stride = width + 1;
  const integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += luma[y * width + x];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowSum;
    }
  }

  const half = Math.max(4, Math.round(Math.max(width, height) / 16));
  const strength = options.strength / 100;
  const threshold = 0.05 + strength * 0.17;
  const soft = 0.07 - strength * 0.04;
  const ink = options.ink === "original" ? null : INK[options.ink];

  for (let y = 0; y < height; y += 1) {
    const y1 = Math.max(0, y - half);
    const y2 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x += 1) {
      const x1 = Math.max(0, x - half);
      const x2 = Math.min(width - 1, x + half);
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum = integral[(y2 + 1) * stride + x2 + 1] - integral[y1 * stride + x2 + 1] - integral[(y2 + 1) * stride + x1] + integral[y1 * stride + x1];
      const mean = sum / area;
      const p = y * width + x;
      const value = luma[p];
      const darkness = (mean - value) / Math.max(mean, 1);
      let amount = Math.min(1, Math.max(0, (darkness - (threshold - soft)) / (2 * soft)));
      if (value < globalThreshold * 0.55) amount = 1;
      // Bright paper next to a glare spot is never ink.
      if (value > Math.max(globalThreshold, 200)) amount *= 0.15;

      const i = p * 4;
      let r: number;
      let g: number;
      let b: number;
      if (ink) {
        [r, g, b] = ink;
      } else {
        const factor = Math.min(1, 70 / Math.max(value, 1));
        r = data[i] * factor;
        g = data[i + 1] * factor;
        b = data[i + 2] * factor;
      }
      if (options.transparent) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = Math.round(amount * data[i + 3]);
      } else {
        data[i] = amount * r + (1 - amount) * 255;
        data[i + 1] = amount * g + (1 - amount) * 255;
        data[i + 2] = amount * b + (1 - amount) * 255;
        data[i + 3] = 255;
      }
    }
  }
}

/** Puts a layer on a solid background (required for formats without transparency). */
export function composite(layer: HTMLCanvasElement, background: string | null, opaque: boolean) {
  if (!background && !opaque) return layer;
  const out = createCanvas(layer.width, layer.height);
  const context = context2d(out);
  context.fillStyle = background ?? "#ffffff";
  context.fillRect(0, 0, out.width, out.height);
  context.drawImage(layer, 0, 0);
  releaseCanvas(layer);
  return out;
}

/** Prints a name and date on a white band at the bottom of a photo. */
export function drawCaption(canvas: HTMLCanvasElement, name: string, date: string) {
  const context = context2d(canvas);
  const band = Math.max(8, Math.round(canvas.height * CAPTION_RATIO));
  const top = canvas.height - band;
  context.fillStyle = "#ffffff";
  context.fillRect(0, top, canvas.width, band);
  const lines = [name.trim(), date.trim()].filter(Boolean);
  if (!lines.length) return;
  context.fillStyle = "#111111";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const maxWidth = canvas.width * 0.94;
  lines.forEach((line, index) => {
    let size = band / (lines.length === 2 ? 2.6 : 1.7);
    context.font = `700 ${size}px Arial, Helvetica, sans-serif`;
    while (context.measureText(line).width > maxWidth && size > 5) {
      size *= 0.92;
      context.font = `700 ${size}px Arial, Helvetica, sans-serif`;
    }
    const y = lines.length === 2 ? top + band * (index === 0 ? 0.31 : 0.71) : top + band / 2;
    context.fillText(line, canvas.width / 2, y);
  });
}

export type RenderRequest = {
  source: Source;
  edits: Pick<ImageEdits, "rotate" | "flip" | "straighten">;
  region: Rect;
  width: number;
  height: number;
  look: Look;
  background: string | null;
  opaque: boolean;
  caption?: { name: string; date: string } | null;
};

export function renderImage(request: RenderRequest) {
  const layer = drawRegion(request.source, request.edits, request.region, request.width, request.height);
  applyLook(layer, request.look);
  const out = composite(layer, request.background, request.opaque);
  if (request.caption) drawCaption(out, request.caption.name, request.caption.date);
  return out;
}
