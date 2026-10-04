"use client";

import { containBox, type Quarter } from "../geometry";
import { decodeImage, type DecodedSource } from "../image/decode";
import { context2d, createCanvas, releaseCanvas } from "../image/render";
import { imagePageSize, type ImageDoc, type ImagePageSize, type PageItem, type SourceDoc } from "./model";
import { renderPage, type PdfProxy } from "./pdfjs";

// Decoded images for image pages, kept small: they are re-decoded on demand.
const decoded = new Map<string, Promise<DecodedSource>>();
const order: string[] = [];

async function imageFor(source: ImageDoc) {
  let entry = decoded.get(source.id);
  if (!entry) {
    entry = decodeImage(source.file);
    decoded.set(source.id, entry);
    order.push(source.id);
    while (order.length > 4) {
      const victim = order.shift()!;
      decoded.get(victim)?.then((image) => image.close(), () => undefined);
      decoded.delete(victim);
    }
  }
  return entry;
}

export function forgetImage(sourceId: string) {
  decoded.get(sourceId)?.then((image) => image.close(), () => undefined);
  decoded.delete(sourceId);
}

function rotateCanvas(canvas: HTMLCanvasElement, rotation: Quarter) {
  if (!rotation) return canvas;
  const turned = createCanvas(rotation % 180 ? canvas.height : canvas.width, rotation % 180 ? canvas.width : canvas.height);
  const context = context2d(turned);
  context.translate(turned.width / 2, turned.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  releaseCanvas(canvas);
  return turned;
}

/**
 * Renders a page as shown on screen. `scale` is pixels per PDF point and
 * `rotation` the absolute clockwise rotation to show it at.
 */
export async function renderPageView(page: PageItem, source: SourceDoc, proxy: PdfProxy | undefined, size: ImagePageSize, scale: number, rotation: Quarter) {
  if (source.kind === "pdf") {
    if (!proxy) throw new Error("The document is still opening.");
    return renderPage(proxy, page.pageIndex, scale, rotation);
  }
  const image = await imageFor(source);
  const pageSize = imagePageSize(source.width, source.height, size);
  const canvas = createCanvas(pageSize.width * scale, pageSize.height * scale);
  const context = context2d(canvas);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const fit = containBox(canvas.width, canvas.height, image.width / image.height);
  context.drawImage(image.image, fit.offsetX, fit.offsetY, fit.width, fit.height);
  return rotateCanvas(canvas, rotation);
}
