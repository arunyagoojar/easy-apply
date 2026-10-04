// Generates deterministic test fixtures for GUI testing: a photo-like PNG,
// a JPEG via sips, a signature-like PNG and two multi-page PDFs.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const outDir = new URL("./fixtures/", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function writePng(path, width, height, pixelAt) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    raw[y * (1 + width * 3)] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixelAt(x, y);
      const offset = y * (1 + width * 3) + 1 + x * 3;
      raw[offset] = r; raw[offset + 1] = g; raw[offset + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  return png;
}

// Photo-like portrait: gradient sky, shoulders, head — busy pixels so
// compression behaves realistically.
function photoPixel(x, y, w, h) {
  const faceX = w / 2, faceY = h * 0.36, faceR = w * 0.18;
  const dFace = Math.hypot(x - faceX, y - faceY);
  const shirtTop = h * 0.62;
  if (y > shirtTop) {
    const shade = 150 + Math.floor(60 * Math.sin((x + y) / 9));
    return [40, shade % 256, 190];
  }
  if (dFace < faceR) {
    const shade = 205 + Math.floor(35 * Math.sin(x / 4) * Math.cos(y / 5));
    return [shade, (shade * 0.82) | 0, (shade * 0.7) | 0];
  }
  const sky = 90 + Math.floor((y / h) * 130);
  return [sky, (sky * 0.9) | 0, 235 - Math.floor((y / h) * 80)];
}

writePng(`${outDir}photo.png`, 1200, 900, (x, y) => photoPixel(x, y, 1200, 900));
writePng(`${outDir}photo-small.png`, 640, 480, (x, y) => photoPixel(x, y, 640, 480));

// Signature-like: white paper with a dark looping stroke.
writePng(`${outDir}signature.png`, 1400, 500, (x, y) => {
  const base = Math.sin(x / 90) * 60 + Math.sin(x / 23) * 18;
  const d = Math.abs(y - (250 + base));
  const wobble = 6 + Math.sin(x / 40) * 2.5;
  if (d < wobble) return [20, 24, 60];
  const paper = 245 + ((x * 7 + y * 13) % 9);
  return [paper, paper, paper];
});

// Second photo variant (different colours) for batch + merge-order tests.
writePng(`${outDir}photo2.png`, 800, 600, (x, y) => [200 - Math.floor((x / 800) * 120), 90 + Math.floor((y / 600) * 100), 60]);

async function makePdf(path, title, pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let index = 0; index < pages; index += 1) {
    const page = doc.addPage([420, 300]);
    page.drawRectangle({ x: 20, y: 20, width: 380, height: 260, borderColor: rgb(0.2, 0.3, 0.8), borderWidth: 2 });
    page.drawText(`${title} p${index + 1}`, { x: 40, y: 150, size: 24, font });
  }
  writeFileSync(path, await doc.save());
}

await makePdf(`${outDir}doc-a.pdf`, "Alpha", 2);
await makePdf(`${outDir}doc-b.pdf`, "Beta", 1);
console.log("fixtures written to", outDir);
