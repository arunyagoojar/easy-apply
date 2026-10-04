import type { Quarter, Rect } from "../geometry";
import { cropAspect, fitCrop, orientedSize } from "../geometry";
import { toPixels, type Unit } from "../units";

export type ImageMode = "photo" | "signature" | "any";
export type OutputFormat = "original" | "jpeg" | "png" | "webp" | "pdf";
export type SizeMode = "original" | "exact" | "fit" | "scale";
export type BackgroundChoice = "keep" | "white" | "blue" | "gray" | "custom";
export type InkColor = "original" | "black" | "blue";

export type ImageSettings = {
  preset: string;
  sizeMode: SizeMode;
  width: number;
  height: number;
  unit: Unit;
  dpi: number;
  lockAspect: boolean;
  scale: number;
  cropShape: string;
  format: OutputFormat;
  quality: number;
  minKb: number | null;
  maxKb: number | null;
  background: BackgroundChoice;
  customColor: string;
  caption: boolean;
  captionName: string;
  captionDate: string;
  cleanup: boolean;
  cleanupStrength: number;
  ink: InkColor;
  transparent: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: boolean;
  combinePdf: boolean;
  faceGuide: boolean;
};

export type ImageEdits = { rotate: Quarter; flip: boolean; straighten: number; crop: Rect };

export type Preset = {
  id: string;
  label: { en: string; hi: string };
  sizeMode: SizeMode;
  width?: number;
  height?: number;
  unit?: Unit;
  dpi?: number;
  minKb?: number | null;
  maxKb?: number | null;
  format?: OutputFormat;
};

// Only long-standing, widely published requirements. The UI reminds people
// to double-check their own form.
export const PHOTO_PRESETS: Preset[] = [
  { id: "passport", label: { en: "Passport size · 35 × 45 mm", hi: "पासपोर्ट साइज़ · 35 × 45 mm" }, sizeMode: "exact", width: 35, height: 45, unit: "mm", dpi: 300 },
  { id: "us-2x2", label: { en: "US passport / visa · 2 × 2 in, max 240 KB", hi: "US पासपोर्ट / वीज़ा · 2 × 2 इंच, अधिकतम 240 KB" }, sizeMode: "exact", width: 2, height: 2, unit: "in", dpi: 300, maxKb: 240 },
  { id: "bank-photo", label: { en: "Bank exams (IBPS, SBI) · 200 × 230 px, 20–50 KB", hi: "बैंक परीक्षा (IBPS, SBI) · 200 × 230 px, 20–50 KB" }, sizeMode: "exact", width: 200, height: 230, unit: "px", dpi: 200, minKb: 20, maxKb: 50 },
  { id: "stamp", label: { en: "Stamp size · 20 × 25 mm", hi: "स्टैम्प साइज़ · 20 × 25 mm" }, sizeMode: "exact", width: 20, height: 25, unit: "mm", dpi: 300 },
  { id: "square", label: { en: "Square · 600 × 600 px", hi: "वर्गाकार · 600 × 600 px" }, sizeMode: "exact", width: 600, height: 600, unit: "px", dpi: 300 },
];

export const SIGNATURE_PRESETS: Preset[] = [
  { id: "sign-crop", label: { en: "Same as cropped area", hi: "क्रॉप किए हिस्से जितना" }, sizeMode: "original" },
  { id: "bank-sign", label: { en: "Bank exams (IBPS, SBI) · 140 × 60 px, 10–20 KB", hi: "बैंक परीक्षा (IBPS, SBI) · 140 × 60 px, 10–20 KB" }, sizeMode: "exact", width: 140, height: 60, unit: "px", dpi: 200, minKb: 10, maxKb: 20 },
  { id: "sign-wide", label: { en: "Wide · 300 × 100 px", hi: "चौड़ा · 300 × 100 px" }, sizeMode: "exact", width: 300, height: 100, unit: "px", dpi: 200 },
];

export const CUSTOM_PRESET = "custom";

export const CROP_SHAPES: Array<{ id: string; ratio: number | null }> = [
  { id: "free", ratio: null },
  { id: "original", ratio: null },
  { id: "1:1", ratio: 1 },
  { id: "4:3", ratio: 4 / 3 },
  { id: "3:4", ratio: 3 / 4 },
  { id: "3:2", ratio: 3 / 2 },
  { id: "2:3", ratio: 2 / 3 },
  { id: "16:9", ratio: 16 / 9 },
  { id: "9:16", ratio: 9 / 16 },
];

const base: ImageSettings = {
  preset: CUSTOM_PRESET,
  sizeMode: "original",
  width: 600,
  height: 600,
  unit: "px",
  dpi: 300,
  lockAspect: true,
  scale: 50,
  cropShape: "free",
  format: "jpeg",
  quality: 92,
  minKb: null,
  maxKb: null,
  background: "keep",
  customColor: "#dbe8ff",
  caption: false,
  captionName: "",
  captionDate: "",
  cleanup: false,
  cleanupStrength: 50,
  ink: "original",
  transparent: false,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: false,
  combinePdf: true,
  faceGuide: true,
};

export function applyPreset(settings: ImageSettings, preset: Preset): ImageSettings {
  return {
    ...settings,
    preset: preset.id,
    sizeMode: preset.sizeMode,
    width: preset.width ?? settings.width,
    height: preset.height ?? settings.height,
    unit: preset.unit ?? settings.unit,
    dpi: preset.dpi ?? settings.dpi,
    minKb: preset.minKb === undefined ? null : preset.minKb,
    maxKb: preset.maxKb === undefined ? null : preset.maxKb,
    format: preset.format ?? (settings.format === "original" || settings.format === "webp" ? "jpeg" : settings.format),
  };
}

export function defaultSettings(mode: ImageMode): ImageSettings {
  if (mode === "photo") return applyPreset({ ...base, cropShape: "free" }, PHOTO_PRESETS[0]);
  if (mode === "signature") return applyPreset({ ...base, cleanup: true, faceGuide: false }, SIGNATURE_PRESETS[0]);
  return { ...base, format: "original", quality: 90, faceGuide: false };
}

export function presetsFor(mode: ImageMode) {
  return mode === "photo" ? PHOTO_PRESETS : mode === "signature" ? SIGNATURE_PRESETS : [];
}

/* --------------------------------------------------------------- persistence */
// Requirements (size, KB, format) are remembered per mode. Personal details
// such as the caption name are deliberately never stored.

const SETTINGS_KEY = "easyapply-image-settings-v2";
const NOT_STORED: Array<keyof ImageSettings> = ["captionName", "captionDate"];

export function loadAllSettings(): Record<ImageMode, ImageSettings> {
  const all = { photo: defaultSettings("photo"), signature: defaultSettings("signature"), any: defaultSettings("any") };
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<Record<ImageMode, Partial<ImageSettings>>> | null;
    if (!raw) return all;
    for (const mode of Object.keys(all) as ImageMode[]) {
      const stored = raw[mode];
      if (!stored || typeof stored !== "object") continue;
      const merged = { ...all[mode] } as Record<string, unknown>;
      for (const key of Object.keys(merged) as Array<keyof ImageSettings>) {
        const value = (stored as Record<string, unknown>)[key];
        if (value === undefined || NOT_STORED.includes(key)) continue;
        const nullableNumber = key === "minKb" || key === "maxKb";
        if (nullableNumber ? value === null || typeof value === "number" : typeof value === typeof merged[key]) merged[key] = value;
      }
      all[mode] = sanitizeSettings(merged as ImageSettings);
    }
  } catch { /* Corrupt or blocked storage: fall back to defaults. */ }
  return all;
}

export function saveAllSettings(all: Record<ImageMode, ImageSettings>) {
  try {
    const stripped = Object.fromEntries(Object.entries(all).map(([mode, settings]) => {
      const copy: Partial<ImageSettings> = { ...settings };
      for (const key of NOT_STORED) delete copy[key];
      return [mode, copy];
    }));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(stripped));
  } catch { /* Ignore: settings then last for this visit only. */ }
}

function finite(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function sanitizeSettings(settings: ImageSettings): ImageSettings {
  return {
    ...settings,
    width: finite(settings.width, 600, 0.01, 20000),
    height: finite(settings.height, 600, 0.01, 20000),
    dpi: finite(settings.dpi, 300, 10, 2400),
    scale: finite(settings.scale, 50, 1, 100),
    quality: finite(settings.quality, 90, 10, 100),
    minKb: settings.minKb === null ? null : finite(settings.minKb, 0, 0, 100000) || null,
    maxKb: settings.maxKb === null ? null : finite(settings.maxKb, 0, 0, 100000) || null,
    cleanupStrength: finite(settings.cleanupStrength, 50, 0, 100),
    brightness: finite(settings.brightness, 100, 0, 200),
    contrast: finite(settings.contrast, 100, 0, 200),
    saturation: finite(settings.saturation, 100, 0, 200),
  };
}

/* ------------------------------------------------------------------ sizing */

export const MAX_OUTPUT_PIXELS = 16_777_216; // 4096², the canvas limit on iPhones

export function targetPixels(settings: ImageSettings) {
  return { width: toPixels(settings.width, settings.unit, settings.dpi), height: toPixels(settings.height, settings.unit, settings.dpi) };
}

/** Pixel aspect ratio the crop box must keep, or null for a free crop. */
export function lockedAspect(settings: ImageSettings, mode: ImageMode, sourceAspect: number): number | null {
  if (settings.sizeMode === "exact" && (mode !== "any" || !settings.lockAspect)) {
    const { width, height } = targetPixels(settings);
    return width > 0 && height > 0 ? width / height : null;
  }
  if (mode !== "any") return null;
  if (settings.cropShape === "original") return sourceAspect;
  return CROP_SHAPES.find((shape) => shape.id === settings.cropShape)?.ratio ?? null;
}

/** Final output size in pixels for a crop of `cropWidth` × `cropHeight` source pixels. */
export function outputSize(settings: ImageSettings, mode: ImageMode, cropWidth: number, cropHeight: number) {
  let width = cropWidth;
  let height = cropHeight;
  if (settings.sizeMode === "exact") {
    const target = targetPixels(settings);
    width = target.width;
    height = mode === "any" && settings.lockAspect ? (target.width * cropHeight) / Math.max(1, cropWidth) : target.height;
  } else if (settings.sizeMode === "fit") {
    const target = targetPixels(settings);
    const scale = Math.min(1, target.width / Math.max(1, cropWidth), target.height / Math.max(1, cropHeight));
    width = cropWidth * scale;
    height = cropHeight * scale;
  } else if (settings.sizeMode === "scale") {
    width = (cropWidth * settings.scale) / 100;
    height = (cropHeight * settings.scale) / 100;
  }
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  let scaledDown = false;
  if (width * height > MAX_OUTPUT_PIXELS) {
    const factor = Math.sqrt(MAX_OUTPUT_PIXELS / (width * height));
    width = Math.max(1, Math.floor(width * factor));
    height = Math.max(1, Math.floor(height * factor));
    scaledDown = true;
  }
  return { width, height, scaledDown };
}

/** True when the user asked for exact pixel dimensions that must not change. */
export function dimensionsAreFixed(settings: ImageSettings) {
  return settings.sizeMode === "exact";
}

export function initialEdits(width: number, height: number, aspect: number | null): ImageEdits {
  return { rotate: 0, flip: false, straighten: 0, crop: aspect ? fitCrop(aspect, width, height) : { x: 0, y: 0, w: 1, h: 1 } };
}

/**
 * Re-fits an existing crop to a new aspect ratio, keeping its centre and
 * roughly its size so the user's framing survives a preset change.
 */
export function refitCrop(edits: ImageEdits, sourceWidth: number, sourceHeight: number, aspect: number | null): ImageEdits {
  const { width, height } = orientedSize(sourceWidth, sourceHeight, edits.rotate);
  if (!aspect) return edits;
  const current = edits.crop;
  if (Math.abs(cropAspect(current, width, height) - aspect) < 0.002) return edits;
  const center = { x: current.x + current.w / 2, y: current.y + current.h / 2 };
  const fitted = fitCrop(aspect, width, height, center);
  // Keep the user's zoom: scale towards the previous crop height when it is smaller.
  const scale = Math.min(1, Math.max(0.2, (current.h * height) / Math.max(1, fitted.h * height)));
  return { ...edits, crop: fitCrop(aspect, width, height, center, scale) };
}

export function resolveFormat(settings: ImageSettings, file: File, mode: ImageMode): "jpeg" | "png" | "webp" | "pdf" {
  if (mode === "signature" && settings.transparent) return settings.format === "pdf" ? "pdf" : "png";
  if (settings.format !== "original") return settings.format;
  if (/png/i.test(file.type) || /\.png$/i.test(file.name)) return "png";
  if (/webp/i.test(file.type) || /\.webp$/i.test(file.name)) return "webp";
  if (/gif/i.test(file.type) || /\.gif$/i.test(file.name)) return "png";
  return "jpeg";
}

export function extensionFor(format: "jpeg" | "png" | "webp" | "pdf") {
  return format === "jpeg" ? "jpg" : format;
}

export function backgroundColor(settings: ImageSettings): string | null {
  switch (settings.background) {
    case "white": return "#ffffff";
    case "blue": return "#dbe8ff";
    case "gray": return "#e6e7ea";
    case "custom": return settings.customColor;
    default: return null;
  }
}
