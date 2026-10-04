// Pure geometry used by the image cropper and the PDF page editor.
// Covered by tests/geometry.test.mjs.

export type Rect = { x: number; y: number; w: number; h: number };
export type Quarter = 0 | 90 | 180 | 270;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeQuarter(value: number): Quarter {
  return ((((Math.round(value / 90) * 90) % 360) + 360) % 360) as Quarter;
}

/* ------------------------------ image cropping ----------------------------- */

/** Size of the working image after a quarter-turn rotation. */
export function orientedSize(width: number, height: number, rotate: Quarter) {
  return rotate % 180 === 0 ? { width, height } : { width: height, height: width };
}

/** Scale that keeps a straightened (rotated) image covering its frame. */
export function coverScale(width: number, height: number, angleDegrees: number) {
  const angle = (angleDegrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  return Math.max((width * cos + height * sin) / width, (width * sin + height * cos) / height);
}

/**
 * Largest crop with the given pixel aspect ratio (width / height) that fits
 * the image, centred on `center` where possible. Coordinates are normalised
 * to the image (0–1).
 */
export function fitCrop(aspect: number, imageWidth: number, imageHeight: number, center = { x: 0.5, y: 0.5 }, scale = 1): Rect {
  const normalized = (aspect * imageHeight) / Math.max(1e-6, imageWidth);
  let w = normalized >= 1 ? 1 : normalized;
  let h = normalized >= 1 ? 1 / normalized : 1;
  w *= scale;
  h *= scale;
  return { x: clamp(center.x - w / 2, 0, 1 - w), y: clamp(center.y - h / 2, 0, 1 - h), w, h };
}

export function cropAspect(rect: Rect, imageWidth: number, imageHeight: number) {
  return (rect.w * imageWidth) / Math.max(1e-6, rect.h * imageHeight);
}

/** Moves a normalised crop when the image is turned 90° (clockwise when `clockwise`). */
export function rotateCrop(rect: Rect, clockwise: boolean): Rect {
  return clockwise
    ? { x: 1 - rect.y - rect.h, y: rect.x, w: rect.h, h: rect.w }
    : { x: rect.y, y: 1 - rect.x - rect.w, w: rect.h, h: rect.w };
}

export function flipCrop(rect: Rect, axis: "horizontal" | "vertical"): Rect {
  return axis === "horizontal" ? { ...rect, x: 1 - rect.x - rect.w } : { ...rect, y: 1 - rect.y - rect.h };
}

/**
 * Orientation edits are stored as "flip first, then rotate". Flipping what
 * the user sees therefore has to be translated back into that order.
 */
export function flipOrientation(rotate: Quarter, flip: boolean, axis: "horizontal" | "vertical") {
  return { rotate: normalizeQuarter(axis === "horizontal" ? -rotate : 180 - rotate), flip: !flip };
}

/* ------------------------------- PDF pages -------------------------------- */
// "Raw" space is the page as stored in the file: its visible box, origin at
// the top-left, y pointing down, before any /Rotate is applied. "View" space
// is the page as shown on screen after turning it clockwise by `rotation`.

export function viewSize(width: number, height: number, rotation: Quarter) {
  return rotation % 180 === 0 ? { width, height } : { width: height, height: width };
}

export function rawBoxToView(box: Rect, width: number, height: number, rotation: Quarter): Rect {
  switch (rotation) {
    case 90: return { x: height - box.y - box.h, y: box.x, w: box.h, h: box.w };
    case 180: return { x: width - box.x - box.w, y: height - box.y - box.h, w: box.w, h: box.h };
    case 270: return { x: box.y, y: width - box.x - box.w, w: box.h, h: box.w };
    default: return { ...box };
  }
}

export function viewBoxToRaw(box: Rect, width: number, height: number, rotation: Quarter): Rect {
  switch (rotation) {
    case 90: return { x: box.y, y: height - box.x - box.w, w: box.h, h: box.w };
    case 180: return { x: width - box.x - box.w, y: height - box.y - box.h, w: box.w, h: box.h };
    case 270: return { x: width - box.y - box.h, y: box.x, w: box.h, h: box.w };
    default: return { ...box };
  }
}

export function viewDeltaToRaw(dx: number, dy: number, rotation: Quarter) {
  switch (rotation) {
    case 90: return { dx: dy, dy: -dx };
    case 180: return { dx: -dx, dy: -dy };
    case 270: return { dx: -dy, dy: dx };
    default: return { dx, dy };
  }
}

/**
 * PDF drawing frame for content rotated clockwise by `rotation` inside a
 * footprint. The footprint is given in PDF user space (y up). Returns the
 * frame origin and axes: a point (lx, ly) of the upright content, measured
 * from its bottom-left corner, lands at origin + lx * ex + ly * ey. `angle`
 * is the counter-clockwise rotation to pass to pdf-lib.
 */
export function contentFrame(footprint: { left: number; bottom: number; width: number; height: number }, rotation: Quarter) {
  const { left, bottom, width, height } = footprint;
  switch (rotation) {
    case 90: return { origin: { x: left, y: bottom + height }, ex: { x: 0, y: -1 }, ey: { x: 1, y: 0 }, angle: -90, contentWidth: height, contentHeight: width };
    case 180: return { origin: { x: left + width, y: bottom + height }, ex: { x: -1, y: 0 }, ey: { x: 0, y: -1 }, angle: -180, contentWidth: width, contentHeight: height };
    case 270: return { origin: { x: left + width, y: bottom }, ex: { x: 0, y: 1 }, ey: { x: -1, y: 0 }, angle: -270, contentWidth: height, contentHeight: width };
    default: return { origin: { x: left, y: bottom }, ex: { x: 1, y: 0 }, ey: { x: 0, y: 1 }, angle: 0, contentWidth: width, contentHeight: height };
  }
}

export function framePoint(frame: ReturnType<typeof contentFrame>, lx: number, ly: number) {
  return { x: frame.origin.x + lx * frame.ex.x + ly * frame.ey.x, y: frame.origin.y + lx * frame.ex.y + ly * frame.ey.y };
}

/** Fits a box of the given aspect ratio inside another, centred. */
export function containBox(boxWidth: number, boxHeight: number, aspect: number) {
  let width = boxWidth;
  let height = width / aspect;
  if (height > boxHeight) {
    height = boxHeight;
    width = height * aspect;
  }
  return { width, height, offsetX: (boxWidth - width) / 2, offsetY: (boxHeight - height) / 2 };
}
