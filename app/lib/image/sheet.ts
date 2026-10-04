"use client";

import { setJpegDpi } from "../bytes";
import { canvasBytes, bytesToBlob } from "./encode";
import { context2d, createCanvas, releaseCanvas } from "./render";

export type SheetPaper = "4x6" | "a4";

const PAPER_MM: Record<SheetPaper, [number, number]> = { "4x6": [152.4, 101.6], a4: [210, 297] };
const MARGIN_MM = 4;
const GAP_MM = 3;

/** Lays out as many copies as fit, trying both paper orientations. */
export function sheetLayout(paper: SheetPaper, widthMm: number, heightMm: number) {
  const fit = (paperWidth: number, paperHeight: number) => ({
    cols: Math.max(0, Math.floor((paperWidth - 2 * MARGIN_MM + GAP_MM) / (widthMm + GAP_MM))),
    rows: Math.max(0, Math.floor((paperHeight - 2 * MARGIN_MM + GAP_MM) / (heightMm + GAP_MM))),
  });
  const [a, b] = PAPER_MM[paper];
  const normal = fit(a, b);
  const turned = fit(b, a);
  const useTurned = turned.cols * turned.rows > normal.cols * normal.rows;
  const [paperWidth, paperHeight] = useTurned ? [b, a] : [a, b];
  const { cols, rows } = useTurned ? turned : normal;
  const gridWidth = cols * widthMm + Math.max(0, cols - 1) * GAP_MM;
  const gridHeight = rows * heightMm + Math.max(0, rows - 1) * GAP_MM;
  const left = (paperWidth - gridWidth) / 2;
  const top = (paperHeight - gridHeight) / 2;
  const positions: Array<{ x: number; y: number }> = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) positions.push({ x: left + col * (widthMm + GAP_MM), y: top + row * (heightMm + GAP_MM) });
  }
  return { paperWidth, paperHeight, positions, count: positions.length };
}

/** A 4 × 6 in photo-paper sheet as a 300 DPI JPEG. */
export async function printSheetJpg(photo: Blob, widthMm: number, heightMm: number) {
  const dpi = 300;
  const layout = sheetLayout("4x6", widthMm, heightMm);
  if (!layout.count) throw new Error("The photo is larger than the paper.");
  const px = (mm: number) => Math.round((mm / 25.4) * dpi);
  const canvas = createCanvas(px(layout.paperWidth), px(layout.paperHeight));
  const context = context2d(canvas);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const image = await createImageBitmap(photo);
  context.strokeStyle = "#c8c8cc";
  context.lineWidth = 1;
  for (const { x, y } of layout.positions) {
    context.drawImage(image, px(x), px(y), px(widthMm), px(heightMm));
    context.strokeRect(px(x) - 0.5, px(y) - 0.5, px(widthMm) + 1, px(heightMm) + 1);
  }
  image.close();
  const bytes = setJpegDpi(await canvasBytes(canvas, "jpeg", 0.95), dpi);
  releaseCanvas(canvas);
  return { blob: bytesToBlob(bytes, "image/jpeg"), count: layout.count };
}

/** An A4 PDF with copies at their exact physical size and cutting guides. */
export async function printSheetPdf(photo: Uint8Array, format: "jpeg" | "png", widthMm: number, heightMm: number) {
  const layout = sheetLayout("a4", widthMm, heightMm);
  if (!layout.count) throw new Error("The photo is larger than the paper.");
  const { PDFDocument, rgb } = await import("pdf-lib");
  const document = await PDFDocument.create();
  document.setProducer("EasyApply");
  const pt = (mm: number) => (mm / 25.4) * 72;
  const page = document.addPage([pt(layout.paperWidth), pt(layout.paperHeight)]);
  const image = format === "png" ? await document.embedPng(photo) : await document.embedJpg(photo);
  for (const { x, y } of layout.positions) {
    const bottom = pt(layout.paperHeight - y - heightMm);
    page.drawImage(image, { x: pt(x), y: bottom, width: pt(widthMm), height: pt(heightMm) });
    page.drawRectangle({ x: pt(x), y: bottom, width: pt(widthMm), height: pt(heightMm), borderColor: rgb(0.78, 0.78, 0.8), borderWidth: 0.4 });
  }
  return { bytes: await document.save(), count: layout.count };
}
