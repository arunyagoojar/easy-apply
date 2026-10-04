import type { Quarter } from "../geometry";

export type ImagePageSize = "a4" | "letter" | "fit";
export type FontId = "sans" | "serif" | "mono";

export type PdfDoc = {
  id: string;
  kind: "pdf";
  name: string;
  file: File;
  bytes: Uint8Array;
  pageCount: number;
  /** Set when the file needed a password to open. Such pages export as images. */
  password?: string;
  color: string;
};

export type ImageDoc = { id: string; kind: "image"; name: string; file: File; width: number; height: number; color: string };

export type SourceDoc = PdfDoc | ImageDoc;

/** A transparent PNG placed on a page (signatures and pictures). */
export type Asset = { id: string; blob: Blob; url: string; width: number; height: number };

// Annotation boxes are normalised (0–1) to the page's visible box in its
// unrotated ("raw") orientation, origin top-left, y down. `rot` is the
// clockwise rotation of the content inside that box.
type Box = { id: string; x: number; y: number; w: number; h: number; rot: Quarter };
export type ImageAnnotation = Box & { kind: "image"; asset: Asset };
export type TextAnnotation = Box & { kind: "text"; text: string; size: number; font: FontId; bold: boolean; color: string };
export type RectAnnotation = Box & { kind: "rect"; color: string };
export type MarkAnnotation = Box & { kind: "mark"; mark: "check" | "cross"; color: string };
export type Annotation = ImageAnnotation | TextAnnotation | RectAnnotation | MarkAnnotation;

export type PageItem = {
  id: string;
  sourceId: string;
  pageIndex: number;
  /** Rotation stored in the file. */
  baseRotation: Quarter;
  /** Extra rotation chosen by the user. */
  rotation: Quarter;
  /** Visible box [x1, y1, x2, y2] in PDF units (pdf pages only). */
  view: [number, number, number, number];
  annotations: Annotation[];
};

export const LINE_HEIGHT = 1.2;

// Fonts shown in the editor are metric-compatible with the standard PDF
// fonts, and `baseline` is where the first line's baseline sits (in ems)
// inside a 1.2 line box, so on-screen text lands exactly where it is saved.
export const FONTS: Record<FontId, { css: string; baseline: number }> = {
  sans: { css: 'Arial, Helvetica, "Liberation Sans", "Noto Sans", "Noto Sans Devanagari", "Nirmala UI", sans-serif', baseline: 0.9465 },
  serif: { css: '"Times New Roman", Times, "Liberation Serif", "Noto Serif", "Noto Serif Devanagari", serif', baseline: 0.9375 },
  mono: { css: '"Courier New", Courier, "Liberation Mono", monospace', baseline: 0.8665 },
};

export const FILE_COLORS = ["#2459e0", "#d0312d", "#12804a", "#c26a00", "#7c3aed", "#0e7490", "#be185d", "#4d7c0f"];

const PAPER: Record<Exclude<ImagePageSize, "fit">, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };

/** Page size (in points) for an image page, oriented like the image. */
export function imagePageSize(imageWidth: number, imageHeight: number, size: ImagePageSize) {
  if (size === "fit") return { width: imageWidth * 0.75, height: imageHeight * 0.75 };
  const [short, long] = PAPER[size];
  return imageWidth > imageHeight ? { width: long, height: short } : { width: short, height: long };
}

/** The unrotated visible box of a page, in points. */
export function pageBox(page: PageItem, source: SourceDoc | undefined, size: ImagePageSize) {
  if (source?.kind === "image") {
    const { width, height } = imagePageSize(source.width, source.height, size);
    return { x1: 0, y1: 0, width, height };
  }
  const [x1, y1, x2, y2] = page.view;
  return { x1, y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1) };
}

export function totalRotation(page: PageItem): Quarter {
  return (((page.baseRotation + page.rotation) % 360) + 360) % 360 as Quarter;
}
