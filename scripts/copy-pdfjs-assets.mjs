// Copies the pdf.js runtime assets (character maps, standard fonts, JPEG 2000
// decoder and colour profiles) into public/ so they are served as static
// files. Without them pdf.js cannot render scans that use JPEG 2000, or PDFs
// that rely on non-embedded fonts and CJK character maps.
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "pdfjs-dist");
const target = join(root, "public", "pdfjs");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  await cp(join(source, folder), join(target, folder), { recursive: true });
}
console.log("pdf.js assets copied to public/pdfjs");
