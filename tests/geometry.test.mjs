import assert from "node:assert/strict";
import test from "node:test";
import {
  containBox,
  contentFrame,
  coverScale,
  cropAspect,
  fitCrop,
  flipCrop,
  flipOrientation,
  framePoint,
  normalizeQuarter,
  rawBoxToView,
  rotateCrop,
  viewBoxToRaw,
  viewDeltaToRaw,
  viewSize,
} from "../app/lib/geometry.ts";

const ROTATIONS = [0, 90, 180, 270];
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, `${message ?? ""} ${a} ≈ ${b}`);
const closeBox = (a, b) => ["x", "y", "w", "h"].forEach((key) => close(a[key], b[key], key));

function* boxes() {
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let index = 0; index < 50; index += 1) {
    const w = 10 + random() * 200;
    const h = 10 + random() * 200;
    yield { x: random() * (600 - w), y: random() * (800 - h), w, h };
  }
}

test("page boxes convert from raw to view space and back", () => {
  for (const rotation of ROTATIONS) {
    const size = viewSize(600, 800, rotation);
    for (const box of boxes()) {
      const view = rawBoxToView(box, 600, 800, rotation);
      assert.ok(view.x >= -1e-9 && view.y >= -1e-9 && view.x + view.w <= size.width + 1e-9 && view.y + view.h <= size.height + 1e-9, "stays on the page");
      closeBox(viewBoxToRaw(view, 600, 800, rotation), box);
    }
  }
});

test("a drag on screen moves the stored box consistently", () => {
  for (const rotation of ROTATIONS) {
    for (const box of boxes()) {
      const view = rawBoxToView(box, 600, 800, rotation);
      const moved = viewBoxToRaw({ ...view, x: view.x + 13, y: view.y - 7 }, 600, 800, rotation);
      const delta = viewDeltaToRaw(13, -7, rotation);
      closeBox(moved, { ...box, x: box.x + delta.dx, y: box.y + delta.dy });
    }
  }
});

test("rotated content fills exactly its footprint in PDF space", () => {
  const footprint = { left: 100, bottom: 200, width: 80, height: 30 };
  for (const rotation of ROTATIONS) {
    const frame = contentFrame(footprint, rotation);
    const corners = [[0, 0], [frame.contentWidth, 0], [0, frame.contentHeight], [frame.contentWidth, frame.contentHeight]]
      .map(([x, y]) => framePoint(frame, x, y))
      .map(({ x, y }) => `${x.toFixed(6)},${y.toFixed(6)}`)
      .sort();
    const expected = [[100, 200], [180, 200], [100, 230], [180, 230]].map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).sort();
    assert.deepEqual(corners, expected, `rotation ${rotation}`);
    // The content's "up" direction turns clockwise with the rotation.
    const up = framePoint(frame, 0, 1);
    const origin = framePoint(frame, 0, 0);
    const expectedUp = { 0: [0, 1], 90: [1, 0], 180: [0, -1], 270: [-1, 0] }[rotation];
    close(up.x - origin.x, expectedUp[0]);
    close(up.y - origin.y, expectedUp[1]);
  }
});

test("crop boxes keep the requested pixel aspect and stay inside the image", () => {
  for (const [width, height] of [[1200, 900], [900, 1200], [4000, 500]]) {
    for (const aspect of [35 / 45, 1, 140 / 60, 2]) {
      const crop = fitCrop(aspect, width, height);
      close(cropAspect(crop, width, height), aspect);
      assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.w <= 1 + 1e-9 && crop.y + crop.h <= 1 + 1e-9);
      assert.ok(Math.abs(crop.w - 1) < 1e-9 || Math.abs(crop.h - 1) < 1e-9, "largest possible");
    }
  }
  const offCentre = fitCrop(1, 1000, 1000, { x: 0.95, y: 0.5 }, 0.5);
  close(offCentre.x + offCentre.w, 1, "clamped to the edge");
});

test("turning or flipping a crop four or two times returns it unchanged", () => {
  const crop = { x: 0.1, y: 0.2, w: 0.3, h: 0.5 };
  let turned = crop;
  for (let step = 0; step < 4; step += 1) turned = rotateCrop(turned, true);
  closeBox(turned, crop);
  closeBox(rotateCrop(rotateCrop(crop, true), false), crop);
  closeBox(flipCrop(flipCrop(crop, "horizontal"), "horizontal"), crop);
  closeBox(flipCrop(flipCrop(crop, "vertical"), "vertical"), crop);
});

test("flipping what the user sees maps back to flip-then-rotate", () => {
  for (const rotate of ROTATIONS) {
    for (const flip of [false, true]) {
      const once = flipOrientation(rotate, flip, "horizontal");
      const twice = flipOrientation(once.rotate, once.flip, "horizontal");
      assert.deepEqual(twice, { rotate, flip });
      const vertical = flipOrientation(rotate, flip, "vertical");
      assert.deepEqual(flipOrientation(vertical.rotate, vertical.flip, "vertical"), { rotate, flip });
    }
  }
  assert.equal(normalizeQuarter(-90), 270);
  assert.equal(normalizeQuarter(450), 90);
});

test("straightening scales the image just enough to cover the frame", () => {
  close(coverScale(800, 600, 0), 1);
  assert.ok(coverScale(800, 600, 5) > 1);
  assert.ok(coverScale(800, 600, 5) < coverScale(800, 600, 10));
  close(coverScale(500, 500, 45), Math.SQRT2);
  const fit = containBox(100, 50, 1);
  assert.deepEqual(fit, { width: 50, height: 50, offsetX: 25, offsetY: 0 });
});
