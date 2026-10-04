// Byte-level helpers for JPEG and PNG files: DPI metadata, minimum-size
// padding and EXIF orientation. Everything here is pure (no DOM), so it is
// covered by tests/bytes.test.mjs.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let crc = 0xffffffff;
  for (let i = start; i < end; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  let text = "";
  for (let i = start; i < start + length && i < bytes.length; i += 1) text += String.fromCharCode(bytes[i]);
  return text;
}

function asciiBytes(text: string) {
  return Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);
}

function readU32(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function writeU32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

export function isJpeg(bytes: Uint8Array) {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function isPng(bytes: Uint8Array) {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

/* ---------------------------------- JPEG ---------------------------------- */

type JpegSegment = { marker: number; start: number; end: number };

// Lists the header segments that precede the image data (stops at SOS/EOI).
function jpegSegments(bytes: Uint8Array): JpegSegment[] {
  const segments: JpegSegment[] = [];
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    let marker = bytes[i + 1];
    while (marker === 0xff && i + 2 < bytes.length) {
      i += 1;
      marker = bytes[i + 1];
    }
    if (marker === 0xda || marker === 0xd9) break;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const end = i + 2 + length;
    if (length < 2 || end > bytes.length) break;
    segments.push({ marker, start: i, end });
    i = end;
  }
  return segments;
}

function isJfifSegment(bytes: Uint8Array, segment: JpegSegment) {
  return segment.marker === 0xe0 && segment.end - segment.start >= 18 && ascii(bytes, segment.start + 4, 5) === "JFIF\0";
}

/** Writes the resolution (dots per inch) into the JFIF header. */
export function setJpegDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  if (!isJpeg(bytes)) return bytes;
  const density = Math.max(1, Math.min(65535, Math.round(dpi)));
  const jfif = jpegSegments(bytes).find((segment) => isJfifSegment(bytes, segment));
  if (jfif) {
    const out = bytes.slice();
    const offset = jfif.start + 4;
    out[offset + 7] = 1; // units: dots per inch
    out[offset + 8] = density >> 8;
    out[offset + 9] = density & 0xff;
    out[offset + 10] = density >> 8;
    out[offset + 11] = density & 0xff;
    return out;
  }
  const app0 = new Uint8Array([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, density >> 8, density & 0xff, density >> 8, density & 0xff, 0x00, 0x00]);
  return concatBytes(bytes.subarray(0, 2), app0, bytes.subarray(2));
}

export function readJpegDpi(bytes: Uint8Array): number | null {
  if (!isJpeg(bytes)) return null;
  const jfif = jpegSegments(bytes).find((segment) => isJfifSegment(bytes, segment));
  if (!jfif) return null;
  const offset = jfif.start + 4;
  if (bytes[offset + 7] !== 1) return null;
  return (bytes[offset + 8] << 8) | bytes[offset + 9];
}

/**
 * Grows a JPEG to at least `minSize` bytes by inserting comment (COM)
 * segments. Decoders ignore comments, so the picture is unchanged.
 */
export function padJpeg(bytes: Uint8Array, minSize: number): Uint8Array {
  if (!isJpeg(bytes) || bytes.length >= minSize) return bytes;
  const segments = jpegSegments(bytes);
  const insertAt = segments[0] && isJfifSegment(bytes, segments[0]) ? segments[0].end : 2;
  const parts: Uint8Array[] = [];
  let needed = minSize - bytes.length;
  while (needed > 0) {
    const total = Math.min(65537, Math.max(4, needed));
    const segment = new Uint8Array(total);
    segment[0] = 0xff;
    segment[1] = 0xfe;
    segment[2] = ((total - 2) >> 8) & 0xff;
    segment[3] = (total - 2) & 0xff;
    segment.fill(0x20, 4);
    parts.push(segment);
    needed -= total;
  }
  return concatBytes(bytes.subarray(0, insertAt), ...parts, bytes.subarray(insertAt));
}

/** Reads the EXIF orientation (1–8) of a JPEG; 1 means "as stored". */
export function jpegOrientation(bytes: Uint8Array): number {
  if (!isJpeg(bytes)) return 1;
  for (const segment of jpegSegments(bytes)) {
    if (segment.marker !== 0xe1 || ascii(bytes, segment.start + 4, 6) !== "Exif\0\0") continue;
    const tiff = segment.start + 10;
    if (tiff + 8 > segment.end) return 1;
    const little = bytes[tiff] === 0x49;
    const u16 = (at: number) => (little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1]);
    const u32 = (at: number) => (little
      ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
      : ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0);
    if (u16(tiff + 2) !== 42) return 1;
    const ifd = tiff + u32(tiff + 4);
    if (ifd + 2 > segment.end) return 1;
    const count = u16(ifd);
    for (let index = 0; index < count; index += 1) {
      const entry = ifd + 2 + index * 12;
      if (entry + 12 > segment.end) break;
      if (u16(entry) === 0x0112) {
        const value = u16(entry + 8);
        return value >= 1 && value <= 8 ? value : 1;
      }
    }
    return 1;
  }
  return 1;
}

/** Removes EXIF segments so decoders cannot apply an orientation flag. */
export function stripJpegExif(bytes: Uint8Array): Uint8Array {
  if (!isJpeg(bytes)) return bytes;
  const exif = jpegSegments(bytes).filter((segment) => segment.marker === 0xe1 && ascii(bytes, segment.start + 4, 6) === "Exif\0\0");
  if (!exif.length) return bytes;
  const parts: Uint8Array[] = [];
  let cursor = 0;
  for (const segment of exif) {
    parts.push(bytes.subarray(cursor, segment.start));
    cursor = segment.end;
  }
  parts.push(bytes.subarray(cursor));
  return concatBytes(...parts);
}

/** Reads width, height and colour components from the JPEG frame header. */
export function jpegInfo(bytes: Uint8Array): { width: number; height: number; components: number } | null {
  if (!isJpeg(bytes)) return null;
  let i = 2;
  while (i + 9 < bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1];
    if (marker === 0xff) { i += 1; continue; }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8], components: bytes[i + 9] };
    }
    i += 2 + length;
  }
  return null;
}

/* ----------------------------------- PNG ---------------------------------- */

type PngChunk = { type: string; start: number; end: number };

function pngChunks(bytes: Uint8Array): PngChunk[] {
  const chunks: PngChunk[] = [];
  let i = 8;
  while (i + 12 <= bytes.length) {
    const length = readU32(bytes, i);
    const type = ascii(bytes, i + 4, 4);
    const end = i + 12 + length;
    if (end > bytes.length) break;
    chunks.push({ type, start: i, end });
    i = end;
    if (type === "IEND") break;
  }
  return chunks;
}

function makePngChunk(type: string, data: Uint8Array) {
  const chunk = new Uint8Array(12 + data.length);
  writeU32(chunk, 0, data.length);
  chunk.set(asciiBytes(type), 4);
  chunk.set(data, 8);
  writeU32(chunk, 8 + data.length, crc32(chunk, 4, 8 + data.length));
  return chunk;
}

/** Writes the physical resolution (pHYs chunk) into a PNG. */
export function setPngDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  if (!isPng(bytes)) return bytes;
  const pixelsPerMetre = Math.round(dpi / 0.0254);
  const data = new Uint8Array(9);
  writeU32(data, 0, pixelsPerMetre);
  writeU32(data, 4, pixelsPerMetre);
  data[8] = 1;
  const chunk = makePngChunk("pHYs", data);
  const chunks = pngChunks(bytes);
  const existing = chunks.find((item) => item.type === "pHYs");
  if (existing) return concatBytes(bytes.subarray(0, existing.start), chunk, bytes.subarray(existing.end));
  const header = chunks.find((item) => item.type === "IHDR");
  if (!header) return bytes;
  return concatBytes(bytes.subarray(0, header.end), chunk, bytes.subarray(header.end));
}

export function readPngDpi(bytes: Uint8Array): number | null {
  if (!isPng(bytes)) return null;
  const chunk = pngChunks(bytes).find((item) => item.type === "pHYs");
  if (!chunk || bytes[chunk.start + 16] !== 1) return null;
  return Math.round(readU32(bytes, chunk.start + 8) * 0.0254);
}

/** Grows a PNG to at least `minSize` bytes with a text comment chunk. */
export function padPng(bytes: Uint8Array, minSize: number): Uint8Array {
  if (!isPng(bytes) || bytes.length >= minSize) return bytes;
  const end = pngChunks(bytes).find((item) => item.type === "IEND");
  if (!end) return bytes;
  const keyword = asciiBytes("Comment\0");
  const fill = Math.max(0, minSize - bytes.length - 12 - keyword.length);
  const data = new Uint8Array(keyword.length + fill);
  data.set(keyword, 0);
  data.fill(0x20, keyword.length);
  return concatBytes(bytes.subarray(0, end.start), makePngChunk("tEXt", data), bytes.subarray(end.start));
}

/** True when the PNG declares an alpha channel or transparency chunk. */
export function pngHasAlpha(bytes: Uint8Array): boolean {
  if (!isPng(bytes)) return false;
  const colourType = bytes[25];
  if (colourType === 4 || colourType === 6) return true;
  return pngChunks(bytes).some((item) => item.type === "tRNS");
}
