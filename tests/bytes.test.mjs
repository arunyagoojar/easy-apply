import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import zlib from "node:zlib";
import {
  crc32,
  isJpeg,
  isPng,
  jpegInfo,
  jpegOrientation,
  padJpeg,
  padPng,
  pngHasAlpha,
  readJpegDpi,
  readPngDpi,
  setJpegDpi,
  setPngDpi,
  stripJpegExif,
} from "../app/lib/bytes.ts";

const fixture = (name) => new Uint8Array(readFileSync(new URL(`../scripts/fixtures/${name}`, import.meta.url)));

// SOI, quantisation table, frame header (8×4, 3 components), EOI.
function minimalJpeg(extraSegments = []) {
  const parts = [[0xff, 0xd8], ...extraSegments, [0xff, 0xdb, 0x00, 0x04, 0x00, 0x00], [0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x04, 0x00, 0x08, 0x03, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1], [0xff, 0xd9]];
  return Uint8Array.from(parts.flat());
}

function exifSegment(orientation, littleEndian) {
  const tiff = littleEndian
    ? [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    : [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const length = body.length + 2;
  return [0xff, 0xe1, length >> 8, length & 0xff, ...body];
}

function pngChunks(bytes) {
  const chunks = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 8; offset < bytes.length;) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const storedCrc = view.getUint32(offset + 8 + length);
    chunks.push({ type, length, crcOk: storedCrc === zlib.crc32(bytes.subarray(offset + 4, offset + 8 + length)) });
    offset += 12 + length;
  }
  return chunks;
}

test("crc32 matches zlib", () => {
  const data = Uint8Array.from({ length: 5000 }, (_, index) => (index * 7919) % 256);
  assert.equal(crc32(data), zlib.crc32(data));
  assert.equal(crc32(new Uint8Array()), 0);
});

test("sets and reads JPEG DPI in an existing JFIF header without changing the size", () => {
  const jpeg = fixture("photo.jpg");
  assert.ok(isJpeg(jpeg));
  const updated = setJpegDpi(jpeg, 300);
  assert.equal(readJpegDpi(updated), 300);
  assert.equal(updated.length, jpeg.length);
  assert.deepEqual(jpegInfo(updated), jpegInfo(jpeg));
  assert.equal(readJpegDpi(setJpegDpi(updated, 200)), 200);
});

test("adds a JFIF header when a JPEG has none", () => {
  const jpeg = minimalJpeg();
  assert.equal(readJpegDpi(jpeg), null);
  const updated = setJpegDpi(jpeg, 600);
  assert.equal(readJpegDpi(updated), 600);
  assert.deepEqual(jpegInfo(updated), { width: 8, height: 4, components: 3 });
});

test("pads a JPEG to the minimum size with comment segments and keeps it readable", () => {
  const jpeg = setJpegDpi(fixture("photo.jpg"), 300);
  for (const extra of [1, 3, 10, 70_000, 200_000]) {
    const target = jpeg.length + extra;
    const padded = padJpeg(jpeg, target);
    assert.ok(padded.length >= target && padded.length <= target + 3, `padding by ${extra}`);
    assert.deepEqual(jpegInfo(padded), jpegInfo(jpeg));
    assert.equal(readJpegDpi(padded), 300, "JFIF stays the first segment");
    assert.deepEqual(padded.subarray(padded.length - 2), Uint8Array.from([0xff, 0xd9]));
  }
  assert.equal(padJpeg(jpeg, 10), jpeg, "already big enough");
});

test("reads EXIF orientation in both byte orders and strips it", () => {
  for (const little of [true, false]) {
    const jpeg = minimalJpeg([exifSegment(6, little)]);
    assert.equal(jpegOrientation(jpeg), 6);
    const stripped = stripJpegExif(jpeg);
    assert.equal(jpegOrientation(stripped), 1);
    assert.deepEqual(jpegInfo(stripped), { width: 8, height: 4, components: 3 });
  }
  assert.equal(jpegOrientation(fixture("photo.jpg")), 1);
});

test("sets PNG DPI with a valid pHYs chunk before the image data", () => {
  const png = fixture("photo.png");
  assert.ok(isPng(png));
  const updated = setPngDpi(png, 300);
  assert.equal(readPngDpi(updated), 300);
  const chunks = pngChunks(updated);
  assert.ok(chunks.every((chunk) => chunk.crcOk), "every chunk CRC is valid");
  assert.ok(chunks.findIndex((chunk) => chunk.type === "pHYs") < chunks.findIndex((chunk) => chunk.type === "IDAT"));
  const again = setPngDpi(updated, 150);
  assert.equal(readPngDpi(again), 150);
  assert.equal(pngChunks(again).filter((chunk) => chunk.type === "pHYs").length, 1, "replaces instead of duplicating");
});

test("pads a PNG with a text chunk and keeps IEND last", () => {
  const png = fixture("photo-small.png");
  const target = png.length + 25_000;
  const padded = padPng(png, target);
  assert.ok(padded.length >= target && padded.length <= target + 12);
  const chunks = pngChunks(padded);
  assert.equal(chunks.at(-1).type, "IEND");
  assert.ok(chunks.some((chunk) => chunk.type === "tEXt"));
  assert.ok(chunks.every((chunk) => chunk.crcOk));
  assert.equal(pngHasAlpha(png), false);
});
