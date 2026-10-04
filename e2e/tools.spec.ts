import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { expect, test, type Page } from "@playwright/test";
import { jpegInfo, readJpegDpi } from "../app/lib/bytes";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "fixtures");
const fixture = (name: string) => join(FIXTURES, name);

const MAGIC = {
  jpeg: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8,
  png: (b: Buffer) => b[0] === 0x89 && b[1] === 0x50,
  webp: (b: Buffer) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  pdf: (b: Buffer) => b.subarray(0, 4).toString("ascii") === "%PDF",
  zip: (b: Buffer) => b[0] === 0x50 && b[1] === 0x4b,
};

async function goto(page: Page, path: string) {
  await page.goto(path);
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 30_000 });
}

async function upload(page: Page, files: string | string[]) {
  const paths = (Array.isArray(files) ? files : [files]).map((name) => (name.startsWith("/") ? name : fixture(name)));
  await page.locator('input[type="file"]').first().setInputFiles(paths);
}

async function download(page: Page, trigger: () => Promise<unknown>) {
  const pending = page.waitForEvent("download", { timeout: 60_000 });
  await trigger();
  const file = await pending;
  const dir = mkdtempSync(join(tmpdir(), "easyapply-e2e-"));
  const path = join(dir, file.suggestedFilename());
  await file.saveAs(path);
  return { path, name: file.suggestedFilename(), bytes: readFileSync(path) };
}

const pngSize = (bytes: Buffer) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colourType: bytes[25] });

/** Waits until the image result matches, then returns the footer text. */
async function result(page: Page, ...patterns: RegExp[]) {
  const footer = page.locator(".side-footer .checks");
  await expect(footer.locator("b").first()).toHaveText("Result", { timeout: 60_000 });
  for (const pattern of patterns) await expect(footer).toContainText(pattern, { timeout: 60_000 });
  return footer.innerText();
}

const downloadImage = (page: Page) => download(page, () => page.getByRole("button", { name: "Download", exact: true }).click());
const downloadPdf = (page: Page) => download(page, () => page.getByRole("button", { name: "Download PDF", exact: true }).click());

async function pdfText(bytes: Buffer) {
  const task = getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/" });
  const document = await task.promise;
  const pages: Array<{ text: string; rotate: number; items: Array<{ str: string; transform: number[] }> }> = [];
  for (let index = 1; index <= document.numPages; index += 1) {
    const page = await document.getPage(index);
    const content = await page.getTextContent();
    const items = content.items.filter((item): item is typeof item & { str: string; transform: number[] } => "str" in item);
    pages.push({ text: items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim(), rotate: page.rotate, items });
  }
  await task.destroy();
  return pages;
}

/** Positions (in PDF points) where images are painted on a page. */
async function imagePlacements(bytes: Buffer, pageNumber = 1) {
  const task = getDocument({ data: new Uint8Array(bytes) });
  const document = await task.promise;
  const page = await document.getPage(pageNumber);
  const ops = await page.getOperatorList();
  const stack: number[][] = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  const multiply = (m: number[], n: number[]) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  const placements: Array<{ x: number; y: number; width: number; height: number }> = [];
  ops.fnArray.forEach((fn, index) => {
    if (fn === OPS.save) stack.push(matrix);
    else if (fn === OPS.restore) matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) matrix = multiply(matrix, ops.argsArray[index] as number[]);
    else if (fn === OPS.paintImageXObject) placements.push({ x: matrix[4], y: matrix[5], width: Math.hypot(matrix[0], matrix[1]), height: Math.hypot(matrix[2], matrix[3]) });
  });
  await task.destroy();
  return placements;
}

async function zipEntries(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes);
  return Promise.all(Object.values(zip.files).map(async (entry) => ({ name: entry.name, bytes: Buffer.from(await entry.async("uint8array")) })));
}

/** A PDF with text and a large, high-quality JPEG photo on it. */
async function heavyPdf(page: Page) {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2400;
    canvas.height = 1800;
    const context = canvas.getContext("2d")!;
    const image = context.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < image.data.length; i += 4) {
      const p = i / 4;
      const x = p % canvas.width;
      const y = Math.floor(p / canvas.width);
      image.data[i] = (x * 0.1 + Math.sin(y / 9) * 40 + (p * 2654435761 % 37)) & 255;
      image.data[i + 1] = (y * 0.12 + (p * 40503 % 29)) & 255;
      image.data[i + 2] = (120 + Math.cos(x / 13) * 60) & 255;
      image.data[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/jpeg", 0.97));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const jpeg = await pdf.embedJpg(Buffer.from(base64, "base64"));
  for (let index = 0; index < 2; index += 1) {
    const pdfPage = pdf.addPage([595, 842]);
    pdfPage.drawText(`Certificate page ${index + 1}`, { x: 60, y: 780, size: 20, font });
    pdfPage.drawImage(jpeg, { x: 60, y: 300, width: 475, height: 356 });
  }
  const path = join(mkdtempSync(join(tmpdir(), "easyapply-heavy-")), "scan.pdf");
  writeFileSync(path, await pdf.save());
  return path;
}

/* ------------------------------------------------------------------ site */

test.describe("tools page", () => {
  test("lists every task and sends a dropped photo to the image tool", async ({ page }) => {
    await goto(page, "/");
    await expect(page).toHaveTitle(/Free Photo, Signature & PDF Tools for Online Forms \| EasyApply/);
    await expect(page.getByRole("heading", { name: /Get your documents ready/ })).toBeVisible();
    await expect(page.locator(".task-card")).toHaveCount(8);
    await upload(page, "photo.png");
    await page.waitForURL("**/tools/image");
    await result(page, /1200 × 900 px/);
  });

  test("sends a PDF to the PDF tool", async ({ page }) => {
    await goto(page, "/");
    await upload(page, "doc-a.pdf");
    await page.waitForURL("**/tools/pdf");
    await expect(page.locator(".page-card")).toHaveCount(2);
  });

  test("task cards open the right tools", async ({ page }) => {
    await goto(page, "/");
    await page.getByRole("link", { name: /Sign PDF/ }).click();
    await page.waitForURL("**/tools/sign-pdf");
    await expect(page.getByRole("heading", { name: "Add the PDF you want to sign" })).toBeVisible();
    await page.getByRole("link", { name: /Image/ }).first().click();
    await page.waitForURL("**/tools/image");
  });

  test("the old directory redirects to the tools page", async ({ page }) => {
    await page.goto("/tools");
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.getByRole("heading", { name: /Get your documents ready/ })).toBeVisible();
  });

  test("theme and language are remembered", async ({ page }) => {
    await goto(page, "/");
    const root = page.locator("html");
    const before = await root.getAttribute("data-theme");
    await page.getByLabel(/Switch to (light|dark) mode/).click();
    const after = await root.getAttribute("data-theme");
    expect(after).not.toBe(before);
    await page.getByRole("button", { name: "Switch to Hindi" }).click();
    await expect(page.getByRole("heading", { name: "ऑनलाइन फ़ॉर्म के लिए अपने दस्तावेज़ तैयार करें" })).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
    await expect(page.getByRole("heading", { name: "ऑनलाइन फ़ॉर्म के लिए अपने दस्तावेज़ तैयार करें" })).toBeVisible();
    expect(await root.getAttribute("data-theme")).toBe(after);
    expect(await root.getAttribute("lang")).toBe("hi");
  });

  test("help page and 404", async ({ page }) => {
    await goto(page, "/privacy-faq");
    await expect(page.getByRole("heading", { name: "Help & privacy" })).toBeVisible();
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
  });
});

/* ----------------------------------------------------------------- photo */

test.describe("photo", () => {
  test("passport preset makes a 413 × 531 JPEG at 300 DPI", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo.png");
    await result(page, /413 × 531 px · 35 × 45 mm/, /JPG · 300 DPI/);
    const { bytes, name } = await downloadImage(page);
    expect(MAGIC.jpeg(bytes)).toBe(true);
    expect(jpegInfo(bytes)).toMatchObject({ width: 413, height: 531 });
    expect(readJpegDpi(bytes)).toBe(300);
    expect(name).toMatch(/413x531\.jpg$/);
  });

  test("a maximum size is met without changing the dimensions", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo.png");
    await page.getByLabel("Max KB").fill("12");
    await result(page, /Under 12 KB/);
    const { bytes } = await downloadImage(page);
    expect(bytes.length).toBeLessThanOrEqual(12 * 1024);
    expect(jpegInfo(bytes)).toMatchObject({ width: 413, height: 531 });
  });

  test("a minimum size is reached without changing the picture", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo.png");
    await page.getByLabel("Min KB").fill("180");
    await page.getByLabel("Max KB").fill("200");
    await result(page, /Under 200 KB/);
    const { bytes } = await downloadImage(page);
    expect(bytes.length).toBeGreaterThanOrEqual(180 * 1024);
    expect(bytes.length).toBeLessThanOrEqual(200 * 1024);
    expect(jpegInfo(bytes)).toMatchObject({ width: 413, height: 531 });
    // The padded file still decodes in the browser.
    const decoded = await page.evaluate(async (data) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: "image/jpeg" }));
      return [bitmap.width, bitmap.height];
    }, [...bytes]);
    expect(decoded).toEqual([413, 531]);
  });

  test("bank exam preset gives 200 × 230 px within 20–50 KB", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo.png");
    await page.getByLabel("Size").selectOption("bank-photo");
    await result(page, /200 × 230 px/);
    const { bytes } = await downloadImage(page);
    expect(jpegInfo(bytes)).toMatchObject({ width: 200, height: 230 });
    expect(bytes.length).toBeGreaterThanOrEqual(20 * 1024);
    expect(bytes.length).toBeLessThanOrEqual(50 * 1024);
  });

  test("custom size in centimetres follows the DPI", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo.png");
    await page.getByLabel("Size").selectOption("custom");
    await page.getByLabel("Unit").selectOption("cm");
    await page.getByLabel("Width").fill("2.5");
    await page.getByLabel("Height").fill("3.5");
    await page.getByLabel("DPI").fill("200");
    await result(page, /197 × 276 px/);
    const { bytes } = await downloadImage(page);
    expect(jpegInfo(bytes)).toMatchObject({ width: 197, height: 276 });
    expect(readJpegDpi(bytes)).toBe(200);
  });

  test("PDF output has the real photo size", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo.png");
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await result(page, /PDF · 300 DPI/);
    const { bytes } = await downloadImage(page);
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    const { width, height } = document.getPage(0).getSize();
    expect(width).toBeCloseTo((35 / 25.4) * 72, 0);
    expect(height).toBeCloseTo((45 / 25.4) * 72, 0);
  });

  test("print sheet on 4 × 6 in photo paper", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo.png");
    await result(page, /413 × 531 px/);
    await page.getByRole("button", { name: "More download options" }).click();
    const { bytes } = await download(page, () => page.getByRole("menuitem", { name: /4 × 6 in/ }).click());
    const info = jpegInfo(bytes)!;
    expect([info.width, info.height].sort()).toEqual([1200, 1800]);
    expect(readJpegDpi(bytes)).toBe(300);
  });

  test("dragging a corner keeps the passport shape", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo.png");
    const frame = page.locator(".crop-frame");
    await expect(frame).toBeVisible();
    const before = (await frame.boundingBox())!;
    expect(before.width / before.height).toBeCloseTo(35 / 45, 1);
    const handle = (await page.locator('[data-handle="nw"]').boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 100, handle.y + 100, { steps: 8 });
    await page.mouse.up();
    const after = (await frame.boundingBox())!;
    expect(after.width).toBeLessThan(before.width - 20);
    expect(after.width / after.height).toBeCloseTo(35 / 45, 1);
    await result(page, /413 × 531 px/);
  });
});

/* ------------------------------------------------------------- signature */

test.describe("signature", () => {
  test("transparent PNG keeps the alpha channel", async ({ page }) => {
    await goto(page, "/tools/signature");
    await upload(page, "signature.png");
    await page.getByRole("switch", { name: /Transparent background/ }).click();
    await result(page, /PNG/);
    const { bytes } = await downloadImage(page);
    expect(MAGIC.png(bytes)).toBe(true);
    expect(pngSize(bytes).colourType).toBe(6);
  });

  test("bank exam preset gives 140 × 60 px within 10–20 KB", async ({ page }) => {
    await goto(page, "/tools/signature");
    await upload(page, "signature.png");
    await page.getByLabel("Size").selectOption("bank-sign");
    await result(page, /140 × 60 px/);
    const { bytes } = await downloadImage(page);
    expect(jpegInfo(bytes)).toMatchObject({ width: 140, height: 60 });
    expect(bytes.length).toBeGreaterThanOrEqual(10 * 1024);
    expect(bytes.length).toBeLessThanOrEqual(20 * 1024);
  });
});

/* ------------------------------------------------------------- any image */

test.describe("any image", () => {
  test("an unchanged image is returned byte for byte", async ({ page }) => {
    await goto(page, "/tools/image");
    await upload(page, "photo.jpg");
    await result(page, /1200 × 900 px/);
    const { bytes } = await downloadImage(page);
    expect(bytes.equals(readFileSync(fixture("photo.jpg")))).toBe(true);
  });

  test("increase image size: a 22 KB JPEG reaches 40 KB without re-encoding", async ({ page }) => {
    await goto(page, "/tools/increase-image-size");
    await upload(page, "photo2.jpg");
    await page.getByLabel("Min KB").fill("40");
    await result(page, /Above 40 KB/);
    const { bytes } = await downloadImage(page);
    const original = readFileSync(fixture("photo2.jpg"));
    expect(bytes.length).toBeGreaterThanOrEqual(40 * 1024);
    expect(jpegInfo(bytes)).toEqual(jpegInfo(original));
    // Same compressed picture data: the original scan data is still at the end.
    expect(bytes.subarray(bytes.length - 4096).equals(original.subarray(original.length - 4096))).toBe(true);
  });

  test("a batch downloads as a ZIP with one file per image", async ({ page }) => {
    await goto(page, "/tools/image");
    await upload(page, ["photo.png", "photo2.png"]);
    await expect(page.locator(".film-item")).toHaveCount(2);
    await page.getByLabel("Format").selectOption("jpeg");
    await result(page, /JPG/);
    const { bytes } = await download(page, () => page.getByRole("button", { name: /Download all \(2\)/ }).click());
    const entries = await zipEntries(bytes);
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.name.endsWith(".jpg") && MAGIC.jpeg(entry.bytes))).toBe(true);
  });

  test("several images become one PDF", async ({ page }) => {
    await goto(page, "/tools/image");
    await upload(page, ["photo.png", "photo2.png"]);
    await expect(page.locator(".film-item")).toHaveCount(2);
    await page.getByLabel("Format").selectOption("pdf");
    await result(page, /PDF/);
    const { bytes } = await download(page, () => page.getByRole("button", { name: "Download PDF" }).click());
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  test("WebP conversion and fit within", async ({ page }) => {
    await goto(page, "/tools/image");
    await upload(page, "photo2.png");
    await page.getByLabel("Format").selectOption("webp");
    await page.getByLabel("Size").selectOption("fit");
    await page.getByLabel("Width").fill("400");
    await page.getByLabel("Height").fill("400");
    await result(page, /400 × 300 px/, /WEBP/);
    const { bytes, name } = await downloadImage(page);
    expect(MAGIC.webp(bytes)).toBe(true);
    expect(name).toMatch(/400x300\.webp$/);
  });
});

/* ------------------------------------------------------------------- pdf */

test.describe("pdf", () => {
  test("merges PDFs and images in order, with images on A4 pages", async ({ page }) => {
    await goto(page, "/tools/pdf");
    await upload(page, ["doc-a.pdf", "doc-b.pdf", "photo.png"]);
    await expect(page.locator(".page-card")).toHaveCount(4);
    const { bytes } = await downloadPdf(page);
    const pages = await pdfText(bytes);
    expect(pages.map((item) => item.text)).toEqual(["Alpha p1", "Alpha p2", "Beta p1", ""]);
    const document = await PDFDocument.load(bytes);
    const size = document.getPage(3).getSize();
    expect([Math.round(size.width), Math.round(size.height)]).toEqual([842, 595]);
  });

  test("reorders with the keyboard, deletes and undoes", async ({ page }) => {
    await goto(page, "/tools/pdf");
    await upload(page, ["doc-a.pdf", "doc-b.pdf"]);
    await expect(page.locator(".page-card img")).toHaveCount(3);
    await page.locator(".page-card").nth(2).focus();
    await page.keyboard.press("Alt+ArrowLeft");
    await page.keyboard.press("Alt+ArrowLeft");
    await page.getByRole("button", { name: "Delete page 2" }).click();
    await expect(page.locator(".page-card")).toHaveCount(2);
    await page.getByRole("button", { name: /Undo/ }).click();
    await expect(page.locator(".page-card")).toHaveCount(3);
    const { bytes } = await downloadPdf(page);
    expect((await pdfText(bytes)).map((item) => item.text)).toEqual(["Beta p1", "Alpha p1", "Alpha p2"]);
  });

  test("drag and drop moves a page", async ({ page }) => {
    await goto(page, "/tools/pdf");
    await upload(page, ["doc-a.pdf", "doc-b.pdf"]);
    await expect(page.locator(".page-card img")).toHaveCount(3);
    const first = (await page.locator(".page-card").nth(0).boundingBox())!;
    const last = (await page.locator(".page-card").nth(2).boundingBox())!;
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 3);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width * 0.85, last.y + last.height / 3, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator(".editor")).toHaveCount(0);
    const { bytes } = await downloadPdf(page);
    expect((await pdfText(bytes)).map((item) => item.text)).toEqual(["Alpha p2", "Beta p1", "Alpha p1"]);
  });

  test("rotates a page", async ({ page }) => {
    await goto(page, "/tools/pdf");
    await upload(page, "doc-a.pdf");
    await page.getByRole("button", { name: "Rotate page 1" }).click();
    const { bytes } = await downloadPdf(page);
    const document = await PDFDocument.load(bytes);
    expect(document.getPage(0).getRotation().angle).toBe(90);
    expect(document.getPage(1).getRotation().angle).toBe(0);
  });

  test("splits into single pages and saves pages as JPG", async ({ page }) => {
    await goto(page, "/tools/pdf");
    await upload(page, ["doc-a.pdf", "doc-b.pdf"]);
    await expect(page.locator(".page-card img")).toHaveCount(3);
    await page.getByRole("button", { name: "Other downloads" }).click();
    const split = await download(page, () => page.getByRole("menuitem", { name: /Each page as a separate PDF/ }).click());
    const parts = await zipEntries(split.bytes);
    expect(parts).toHaveLength(3);
    for (const part of parts) expect((await PDFDocument.load(part.bytes)).getPageCount()).toBe(1);

    await page.getByRole("button", { name: "Other downloads" }).click();
    const images = await download(page, () => page.getByRole("menuitem", { name: /Pages as JPG images/ }).click());
    const jpgs = await zipEntries(images.bytes);
    expect(jpgs).toHaveLength(3);
    expect(jpgs.every((entry) => MAGIC.jpeg(entry.bytes))).toBe(true);
  });

  test("downloads only the selected pages", async ({ page }) => {
    await goto(page, "/tools/pdf");
    await upload(page, ["doc-a.pdf", "doc-b.pdf"]);
    await expect(page.locator(".page-card img")).toHaveCount(3);
    await page.getByRole("checkbox", { name: "Select page 3" }).click();
    await page.getByRole("checkbox", { name: "Select page 1" }).click();
    await page.getByRole("button", { name: "Other downloads" }).click();
    const { bytes } = await download(page, () => page.getByRole("menuitem", { name: /Download selected pages/ }).click());
    expect((await pdfText(bytes)).map((item) => item.text)).toEqual(["Alpha p1", "Beta p1"]);
  });

  test("increase PDF size: a 1 KB PDF reaches 60 KB with its pages untouched", async ({ page }) => {
    await goto(page, "/tools/increase-pdf-size");
    await upload(page, "doc-a.pdf");
    await expect(page.locator(".page-card")).toHaveCount(2);
    await page.getByLabel("Min KB").fill("60");
    const { bytes } = await downloadPdf(page);
    expect(bytes.length).toBeGreaterThanOrEqual(60 * 1024);
    expect(bytes.length).toBeLessThan(64 * 1024);
    expect((await pdfText(bytes)).map((item) => item.text)).toEqual(["Alpha p1", "Alpha p2"]);
    await expect(page.locator(".side-footer")).toContainText(/Padded to reach the minimum size/);
  });

  test("a size limit gets a heavy scan under the maximum", async ({ page }) => {
    test.setTimeout(120_000);
    await goto(page, "/tools/compress-pdf");
    const path = await heavyPdf(page);
    const original = readFileSync(path).length;
    await upload(page, path);
    await expect(page.locator(".page-card")).toHaveCount(2);
    await page.getByRole("radio", { name: /Set a size range/ }).click();
    await page.getByLabel("Max KB").fill("150");
    const { bytes } = await downloadPdf(page);
    expect(original).toBeGreaterThan(400 * 1024);
    expect(bytes.length).toBeLessThanOrEqual(150 * 1024);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  test("smaller file keeps the text selectable", async ({ page }) => {
    test.setTimeout(120_000);
    await goto(page, "/tools/compress-pdf");
    const path = await heavyPdf(page);
    const original = readFileSync(path).length;
    await upload(page, path);
    await expect(page.locator(".page-card")).toHaveCount(2);
    const { bytes } = await downloadPdf(page);
    expect(bytes.length).toBeLessThan(original * 0.7);
    expect((await pdfText(bytes)).map((item) => item.text)).toEqual(["Certificate page 1", "Certificate page 2"]);
  });
});

/* -------------------------------------------------------- sign and edit */

async function drawSignature(page: Page) {
  const pad = (await page.locator(".sig-pad").boundingBox())!;
  await page.mouse.move(pad.x + 40, pad.y + 110);
  await page.mouse.down();
  for (let step = 0; step <= 30; step += 1) await page.mouse.move(pad.x + 40 + step * 9, pad.y + 110 - Math.sin(step / 3) * 35, { steps: 2 });
  await page.mouse.up();
}

test.describe("sign and edit", () => {
  test("sign PDF: draw, place where clicked and download", async ({ page }) => {
    await goto(page, "/tools/sign-pdf");
    await upload(page, "doc-a.pdf");
    await expect(page.locator(".sig-pad")).toBeVisible({ timeout: 20_000 });
    await drawSignature(page);
    await page.getByRole("button", { name: "Use this signature" }).click();
    const surface = (await page.locator(".editor-page").boundingBox())!;
    await page.mouse.click(surface.x + surface.width * 0.7, surface.y + surface.height * 0.75);
    await expect(page.locator(".ann img")).toHaveCount(1);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.locator(".edit-badge")).toHaveText(/1/);
    const { bytes } = await downloadPdf(page);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
    const [placement] = await imagePlacements(bytes, 1);
    // doc-a pages are 420 × 300 pt; the signature is centred where we clicked.
    expect(placement.x + placement.width / 2).toBeCloseTo(420 * 0.7, -1);
    expect(placement.y + placement.height / 2).toBeCloseTo(300 * 0.25, -1);
    expect(await imagePlacements(bytes, 2)).toHaveLength(0);
  });

  test("typed signature", async ({ page }) => {
    await goto(page, "/tools/sign-pdf");
    await upload(page, "doc-b.pdf");
    await expect(page.locator(".sig-pad")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Type", exact: true }).click();
    await page.getByLabel("Type your name").fill("Arunya");
    await page.getByRole("button", { name: "Use this signature" }).click();
    const surface = (await page.locator(".editor-page").boundingBox())!;
    await page.mouse.click(surface.x + surface.width * 0.5, surface.y + surface.height * 0.5);
    await page.getByRole("button", { name: "Done" }).click();
    const { bytes } = await downloadPdf(page);
    expect(await imagePlacements(bytes, 1)).toHaveLength(1);
  });

  test("fill in: text, tick and white-out", async ({ page }) => {
    await goto(page, "/tools/edit-pdf");
    await upload(page, "doc-a.pdf");
    await expect(page.locator(".editor-page canvas")).toBeVisible({ timeout: 20_000 });
    const surface = (await page.locator(".editor-page").boundingBox())!;
    await page.mouse.click(surface.x + surface.width * 0.15, surface.y + surface.height * 0.2);
    await page.keyboard.type("Fixed by E2E");
    await page.getByRole("button", { name: "Tick", exact: true }).click();
    await page.mouse.click(surface.x + surface.width * 0.8, surface.y + surface.height * 0.2);
    await page.getByRole("button", { name: "White-out", exact: true }).click();
    await page.mouse.move(surface.x + surface.width * 0.5, surface.y + surface.height * 0.85);
    await page.mouse.down();
    await page.mouse.move(surface.x + surface.width * 0.9, surface.y + surface.height * 0.95, { steps: 5 });
    await page.mouse.up();
    await page.getByRole("button", { name: "Done" }).click();
    const { bytes } = await downloadPdf(page);
    const [first] = await pdfText(bytes);
    expect(first.text).toContain("Alpha p1");
    expect(first.text).toContain("Fixed by E2E");
    const item = first.items.find((entry) => entry.str === "Fixed by E2E")!;
    expect(item.transform[4]).toBeCloseTo(420 * 0.15, -1);
  });

  test("text added to a rotated page stays upright", async ({ page }) => {
    await goto(page, "/tools/pdf");
    await upload(page, "doc-a.pdf");
    await page.getByRole("button", { name: "Rotate page 1" }).click();
    await page.getByRole("button", { name: "Sign or edit page 1" }).click();
    await page.getByRole("button", { name: "Text", exact: true }).click();
    const surface = (await page.locator(".editor-page").boundingBox())!;
    expect(surface.height).toBeGreaterThan(surface.width);
    await page.mouse.click(surface.x + surface.width * 0.2, surface.y + surface.height * 0.3);
    await page.keyboard.type("Upright");
    await page.getByRole("button", { name: "Done" }).click();
    const { bytes } = await downloadPdf(page);
    const [first] = await pdfText(bytes);
    expect(first.rotate).toBe(90);
    const item = first.items.find((entry) => entry.str === "Upright")!;
    // Drawn turned 90° in the page's own space, so it reads upright once the page is rotated.
    expect(Math.abs(item.transform[0])).toBeLessThan(0.01);
    expect(item.transform[1]).toBeGreaterThan(0);
  });

  test("Hindi text is kept by saving it as an image", async ({ page }) => {
    await goto(page, "/tools/edit-pdf");
    await upload(page, "doc-b.pdf");
    await expect(page.locator(".editor-page canvas")).toBeVisible({ timeout: 20_000 });
    const surface = (await page.locator(".editor-page").boundingBox())!;
    await page.mouse.click(surface.x + surface.width * 0.3, surface.y + surface.height * 0.3);
    await page.keyboard.insertText("नमस्ते");
    await page.getByRole("button", { name: "Done" }).click();
    const { bytes } = await downloadPdf(page);
    expect(await imagePlacements(bytes, 1)).toHaveLength(1);
  });
});

test.describe("global health", () => {
  test("no uncaught errors across the main flows", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await goto(page, "/");
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo.png");
    await result(page, /413 × 531 px/);
    await goto(page, "/tools/pdf");
    await upload(page, ["doc-a.pdf", "photo.png"]);
    await expect(page.locator(".page-card img")).toHaveCount(3);
    await downloadPdf(page);
    expect(errors, errors.join(" | ")).toHaveLength(0);
  });
});
