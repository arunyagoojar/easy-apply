import assert from "node:assert/strict";
import test from "node:test";
import { formatBytes, fromPixels, toPixels } from "../app/lib/units.ts";

test("converts physical sizes to pixels at a DPI", () => {
  assert.equal(toPixels(35, "mm", 300), 413);
  assert.equal(toPixels(45, "mm", 300), 531);
  assert.equal(toPixels(3.5, "cm", 300), 413);
  assert.equal(toPixels(2, "in", 300), 600);
  assert.equal(toPixels(200, "px", 72), 200);
  assert.equal(toPixels(0, "mm", 300), 0);
  assert.equal(toPixels(Number.NaN, "px", 300), 0);
});

test("converts pixels back to readable physical sizes", () => {
  assert.equal(fromPixels(413, "mm", 300), 35);
  assert.equal(fromPixels(531, "mm", 300), 45);
  assert.equal(fromPixels(600, "in", 300), 2);
  assert.equal(fromPixels(413, "cm", 300), 3.5);
});

test("formats file sizes", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(20 * 1024), "20 KB");
  assert.equal(formatBytes(5.25 * 1024), "5.3 KB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3.00 MB");
  assert.equal(formatBytes(undefined), "—");
});
