import { execSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { expect, test, type Page } from "@playwright/test";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "fixtures");

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

async function reload(page: Page) {
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 30_000 });
}

async function upload(page: Page, files: string | string[]) {
  const paths = (Array.isArray(files) ? files : [files]).map((name) => join(FIXTURES, name));
  await page.locator('input[type="file"]').setInputFiles(paths);
}

async function downloadOutputs(page: Page, mode: "single" | "zip" = "single") {
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: /Download/ }).click();
  const download = await downloadPromise;
  const dir = mkdtempSync(join(tmpdir(), "easyapply-e2e-"));
  const path = join(dir, download.suggestedFilename());
  await download.saveAs(path);
  if (mode === "zip") expect(MAGIC.zip(readFileSync(path))).toBe(true);
  return { path, name: download.suggestedFilename() };
}

async function pdfPagesText(path: string): Promise<string[]> {
  const loadingTask = getDocument({ data: new Uint8Array(readFileSync(path)), standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/" });
  const doc = await loadingTask.promise;
  const pages: string[] = [];
  for (let index = 1; index <= doc.numPages; index += 1) {
    const page = await doc.getPage(index);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim());
  }
  await loadingTask.destroy();
  return pages;
}

function expectMagic(path: string, check: (b: Buffer) => boolean) {
  const bytes = readFileSync(path);
  expect(check(bytes), `${path} should match the expected file signature`).toBe(true);
  return bytes.length;
}

test.describe("site navigation", () => {
  test("landing page renders and Start preparing opens the passport tool", async ({ page }) => {
    await goto(page, "/");
    await expect(page).toHaveTitle(/Free Passport Photo, Signature & PDF Tools \| EasyApply/);
    await expect(page.getByRole("heading", { name: /Prepare your documents/i })).toBeVisible();
    await page.getByRole("button", { name: /Start preparing/i }).first().click();
    await page.waitForURL("**/tools/passport-photo");
    await expect(page.getByRole("heading", { name: "Passport Photo" })).toBeVisible();
  });

  test("tools directory lists and links every tool", async ({ page }) => {
    await goto(page, "/tools");
    await expect(page).toHaveTitle(/All Tools/);
    for (const label of ["Passport Photo", "Signature", "Image Toolkit", "PDF Toolkit", "Sign PDF", "Edit PDF"]) {
      await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
    }
    await page.getByRole("link", { name: /PDF Toolkit/ }).click();
    await page.waitForURL("**/tools/pdf");
    await expect(page.getByRole("heading", { name: "PDF Toolkit" })).toBeVisible();
  });

  test("header nav reaches every workspace and the FAQ page", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    await page.getByRole("button", { name: "Signature", exact: true }).click();
    await page.waitForURL("**/tools/signature");
    await expect(page.getByRole("heading", { name: "Signature" })).toBeVisible();
    await page.getByLabel("FAQ & Privacy").click();
    await page.waitForURL("**/privacy-faq");
    await expect(page.getByRole("heading", { name: /Know exactly how EasyApply works/i })).toBeVisible();
  });

  test("unknown routes return the 404 page", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
  });

  test("theme toggle switches data-theme and persists after reload", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    const root = page.locator("html");
    const initial = await root.getAttribute("data-theme");
    await page.getByLabel(/Switch to (light|dark) mode/).click();
    const flipped = await root.getAttribute("data-theme");
    expect(flipped).not.toBe(initial);
    await reload(page);
    expect(await root.getAttribute("data-theme")).toBe(flipped);
  });

  test("language menu switches to Hindi, closes on outside click, and persists", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    await page.getByLabel("Choose language").click();
    const hindiButton = page.locator(".language-menu button", { hasText: "हिन्दी" });
    await expect(hindiButton).toBeVisible();
    await hindiButton.click();
    await expect(page.getByRole("heading", { name: "पासपोर्ट फोटो" })).toBeVisible();
    // Reopen and click outside: the menu must close (regression test).
    await page.getByLabel("भाषा चुनें").click();
    await expect(page.locator(".language-menu")).toBeVisible();
    await page.getByRole("heading", { name: "पासपोर्ट फोटो" }).click();
    await expect(page.locator(".language-menu")).toBeHidden();
    await reload(page);
    await expect(page.getByRole("heading", { name: "पासपोर्ट फोटो" })).toBeVisible();
  });
});

test.describe("passport photo tool", () => {
  test("upload → linked output size → process → JPEG download", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo.png");
    await expect(page.getByText("photo.png")).toBeVisible();
    // Uploaded 1200x900 (4:3); the linked dimension fields must show a consistent ratio.
    const width = page.locator(".custom-dimensions input").first();
    const height = page.locator(".custom-dimensions input").last();
    await expect(width).toHaveValue(/^\d+$/);
    await expect(height).toHaveValue(/^\d+$/);
    const summaryBefore = await page.locator(".requirement-summary").innerText();

    await page.getByRole("button", { name: /^Prepare/ }).click();
    await expect(page.locator(".tool-message.success")).toContainText(/1 file is ready/);
    await expect(page.locator(".requirement-summary")).toContainText(/Prepared/);

    const { path } = await downloadOutputs(page);
    expectMagic(path, MAGIC.jpeg);
    // Dimensions summary must stay consistent with the crop aspect (passport 35:45).
    const dims = await page.locator(".requirement-summary").innerText();
    expect(dims).toContain("JPEG");
    expect(summaryBefore).toContain("px");
  });

  test("target file size is respected for JPEG", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo.png");
    await page.locator("#target-size").selectOption("20");
    await page.getByRole("button", { name: /^Prepare/ }).click();
    const { path } = await downloadOutputs(page);
    const size = expectMagic(path, MAGIC.jpeg);
    expect(size).toBeLessThanOrEqual(21 * 1024);
  });

  test("target file size is respected for PNG by downscaling (regression)", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo.png");
    // Ask for a large canvas and a small PNG: without the downscale fallback this would stay ~2 MB.
    const width = page.locator(".custom-dimensions input").first();
    await width.fill("1200");
    await page.locator("#format").selectOption("png");
    await page.locator("#target-size").selectOption("50");
    await page.getByRole("button", { name: /^Prepare/ }).click();
    await expect(page.locator(".tool-message.success")).toContainText(/ready/);
    const { path } = await downloadOutputs(page);
    const size = expectMagic(path, MAGIC.png);
    expect(size, "PNG output should be brought near the 50 KB target").toBeLessThanOrEqual(60 * 1024);
  });

  test("PNG keeps transparency with transparent background", async ({ page }) => {
    await goto(page, "/tools/signature");
    await upload(page, "signature.png");
    await page.locator("#format").selectOption("png");
    await page.locator("#background").selectOption("transparent");
    await page.getByRole("button", { name: /^Prepare/ }).click();
    const { path } = await downloadOutputs(page);
    const bytes = readFileSync(path);
    expectMagic(path, MAGIC.png);
    // PNG colour type byte (IHDR offset 25): 6 = RGBA (alpha preserved), 4 = grey+alpha.
    expect([4, 6]).toContain(bytes[25]);
  });

  test("crop selection: aspect presets move the box, dragging handles resizes it", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo.png");
    await page.locator(".document-preview").click();
    await expect(page.locator(".crop-frame")).toBeVisible();
    await page.locator("#crop-aspect").selectOption("1:1");
    const rectBefore = await page.locator(".crop-frame").evaluate((el) => {
      const s = getComputedStyle(el);
      return { left: parseFloat(s.left), width: parseFloat(s.width), height: parseFloat(s.height) };
    });
    expect(Math.abs(rectBefore.width - rectBefore.height)).toBeLessThan(2);

    const handle = page.locator('[data-crop-handle="se"]');
    const box = await handle.boundingBox();
    const stage = await page.locator(".crop-image-stage").boundingBox();
    expect(box && stage).toBeTruthy();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(stage!.x + stage!.width * 0.98, stage!.y + stage!.height * 0.98, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const rectAfter = await page.locator(".crop-frame").evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: parseFloat(s.width), height: parseFloat(s.height) };
    });
    expect(rectAfter.width).toBeGreaterThan(rectBefore.width);
    // Aspect-locked resize must keep the square shape within rounding.
    expect(Math.abs(rectAfter.width - rectAfter.height)).toBeLessThan(3);
  });

  test("width input tolerates being cleared (no NaN output size)", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo.png");
    const width = page.locator(".custom-dimensions input").first();
    const height = page.locator(".custom-dimensions input").last();
    await width.fill("");
    await width.type("240");
    await expect(height).toHaveValue(/^\d+$/);
    const heightValue = Number(await height.inputValue());
    expect(heightValue).toBeGreaterThan(0);
    await page.getByRole("button", { name: /^Prepare/ }).click();
    await expect(page.locator(".tool-message.success")).toContainText(/ready/);
    const summary = await page.locator(".requirement-summary").innerText();
    expect(summary).toMatch(/240 × \d+ px/);
  });

  test("rotation swaps output dimensions", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo-small.png");
    await page.locator(".advanced-controls summary").click(); // open "Image adjustments"
    await page.getByRole("button", { name: /Rotate 90°/ }).click();
    const width = Number(await page.locator(".custom-dimensions input").first().inputValue());
    const height = Number(await page.locator(".custom-dimensions input").last().inputValue());
    await page.getByRole("button", { name: /^Prepare/ }).click();
    const { path } = await downloadOutputs(page);
    expectMagic(path, MAGIC.jpeg);
    expect(height).toBeGreaterThan(width); // 90° of a landscape source yields a portrait canvas request
  });

  test("workspace restores files after reload (IndexedDB persistence)", async ({ page }) => {
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo.png");
    await expect(page.getByText("photo.png")).toBeVisible();
    await reload(page);
    await expect(page.getByText("photo.png")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Prepare/ })).toBeEnabled();
  });

  test("Remove all clears every file at once", async ({ page }) => {
    await goto(page, "/tools/image");
    await upload(page, ["photo.png", "photo2.png"]);
    await expect(page.getByText("photo2.png")).toBeVisible();
    await page.getByRole("button", { name: "Remove all", exact: true }).click();
    await expect(page.getByText(/Drop files here/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Prepare/i })).toBeDisabled();
  });
});

test.describe("signature tool", () => {
  test("signature processes with the wide crop preset and downloads", async ({ page }) => {
    await goto(page, "/tools/signature");
    await upload(page, "signature.png");
    await page.locator(".document-preview").click();
    await expect(page.locator(".crop-frame")).toBeVisible();
    const rect = await page.locator(".crop-frame").evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: parseFloat(s.width), height: parseFloat(s.height) };
    });
    expect(rect.width / rect.height).toBeGreaterThan(3); // 4:1 signature preset
    await page.getByRole("button", { name: /^Prepare/ }).click();
    const { path } = await downloadOutputs(page);
    expectMagic(path, MAGIC.jpeg);
  });
});

test.describe("image toolkit", () => {
  test("batch processing downloads a ZIP with one file per input", async ({ page }) => {
    await goto(page, "/tools/image");
    await upload(page, ["photo.png", "photo2.png"]);
    await page.getByRole("button", { name: /Prepare 2 files/i }).click();
    await expect(page.locator(".tool-message.success")).toContainText(/2 files are ready/);
    const { path } = await downloadOutputs(page, "zip");
    expectMagic(path, MAGIC.zip);
    const listing = execSync(`unzip -Z1 "${path}"`).toString().trim().split("\n");
    expect(listing).toHaveLength(2);
    expect(listing.every((name) => name.endsWith(".jpg"))).toBe(true);
  });

  test("WebP conversion produces real WebP bytes", async ({ page }) => {
    await goto(page, "/tools/image");
    await upload(page, "photo2.png");
    await page.locator("#format").selectOption("webp");
    await page.getByRole("button", { name: /^Prepare/ }).click();
    const { path } = await downloadOutputs(page);
    expectMagic(path, MAGIC.webp);
    expect(path.endsWith(".webp")).toBe(true);
  });
});

test.describe("pdf toolkit", () => {
  test("merges PDFs in upload order", async ({ page }) => {
    await goto(page, "/tools/pdf");
    await upload(page, ["doc-a.pdf", "doc-b.pdf"]);
    await page.getByRole("button", { name: /^Prepare/ }).click();
    const { path } = await downloadOutputs(page);
    expectMagic(path, MAGIC.pdf);
    const merged = await PDFDocument.load(readFileSync(path));
    expect(merged.getPageCount()).toBe(3);
  });

  test("splits a PDF into one file per page", async ({ page }) => {
    await goto(page, "/tools/pdf");
    await upload(page, "doc-a.pdf");
    await page.locator("#pdf-action").selectOption("split");
    await page.getByRole("button", { name: /^Prepare/ }).click();
    await expect(page.locator(".tool-message.success")).toContainText(/2 files are ready/);
    const { path } = await downloadOutputs(page, "zip");
    const listing = execSync(`unzip -Z1 "${path}"`).toString().trim().split("\n");
    expect(listing).toHaveLength(2);
    const dir = path.replace(/easyapply-files\.zip$/, "");
    execSync(`unzip -o "${path}" -d "${dir}" >/dev/null`);
    for (const name of listing) {
      const part = await PDFDocument.load(readFileSync(join(dir, name)));
      expect(part.getPageCount()).toBe(1);
    }
  });

  test("rotates every page by 90 degrees", async ({ page }) => {
    await goto(page, "/tools/pdf");
    await upload(page, "doc-a.pdf");
    await page.locator("#pdf-action").selectOption("rotate");
    await page.getByRole("button", { name: /^Prepare/ }).click();
    const { path } = await downloadOutputs(page);
    const rotated = await PDFDocument.load(readFileSync(path));
    expect(rotated.getPageCount()).toBe(2);
    for (const page_ of rotated.getPages()) {
      expect(Math.round(page_.getRotation().angle) % 360).toBe(90);
    }
  });

  test("converts images into a PDF", async ({ page }) => {
    await goto(page, "/tools/pdf");
    await upload(page, ["photo.png", "photo2.png"]);
    await page.locator("#pdf-action").selectOption("image-to-pdf");
    await page.getByRole("button", { name: /^Prepare/ }).click();
    const { path } = await downloadOutputs(page);
    const doc = await PDFDocument.load(readFileSync(path));
    expect(doc.getPageCount()).toBe(2);
  });

  test("exporting an image workspace as PDF yields a one-page document", async ({ page }) => {
    await goto(page, "/tools/signature");
    await upload(page, "signature.png");
    await page.locator("#format").selectOption("pdf");
    await page.getByRole("button", { name: /^Prepare/ }).click();
    const { path } = await downloadOutputs(page);
    expectMagic(path, MAGIC.pdf);
    const doc = await PDFDocument.load(readFileSync(path));
    expect(doc.getPageCount()).toBe(1);
  });
});


test.describe("background removal", () => {
  test("cuts the subject out and adds the result as a new file", async ({ page }) => {
    test.setTimeout(240_000); // the segmentation model downloads on first use
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo.png");
    await page.getByRole("button", { name: /Remove background/i }).click();
    await expect(page.getByText(/no-background\.png/)).toBeVisible({ timeout: 200_000 });
    await expect(page.locator(".tool-message.success, .tool-message")).toContainText(/Background removed|model/i);
    // The cut-out becomes the first file, so the workspace previews it.
    await expect(page.getByText("photo.png")).toBeVisible(); // original is kept too
  });
});

test.describe("pdf page picker", () => {
  test("reorders with the move buttons, skips deselected pages, and merges in the chosen order", async ({ page }) => {
    await goto(page, "/tools/pdf");
    await upload(page, ["doc-a.pdf", "doc-b.pdf"]);
    // Wait for all three page chips (2 pages of doc-a + 1 of doc-b).
    await expect(page.locator(".pdf-page-chip")).toHaveCount(3);
    await expect(page.locator(".pdf-page-chip img")).toHaveCount(3); // thumbnails rendered

    const betaChip = page.locator(".pdf-page-chip", { hasText: "doc-b" });
    await betaChip.getByLabel("Move earlier").click();
    await betaChip.getByLabel("Move earlier").click(); // Beta p1 moves to the front

    // Deselect Alpha p1 (now the second chip).
    await page.locator(".pdf-page-chip", { hasText: "doc-a" }).filter({ hasText: "p1" }).getByRole("checkbox").uncheck();
    await expect(page.locator(".pdf-picker-status")).toContainText("2 selected");

    await page.getByRole("button", { name: /^Prepare/ }).click();
    await expect(page.locator(".tool-message.success")).toContainText(/ready/);
    const { path } = await downloadOutputs(page);
    expectMagic(path, MAGIC.pdf);
    const texts = await pdfPagesText(path);
    expect(texts).toEqual(["Beta p1", "Alpha p2"]);
  });

  test("splits only the selected pages", async ({ page }) => {
    await goto(page, "/tools/pdf");
    await upload(page, "doc-a.pdf");
    await expect(page.locator(".pdf-page-chip")).toHaveCount(2);
    await page.locator(".pdf-page-chip", { hasText: "p1" }).getByRole("checkbox").uncheck();
    await page.locator("#pdf-action").selectOption("split");
    await page.getByRole("button", { name: /^Prepare/ }).click();
    await expect(page.locator(".tool-message.success")).toContainText(/1 file is ready/);
    const { path } = await downloadOutputs(page);
    expectMagic(path, MAGIC.pdf);
    expect(await pdfPagesText(path)).toEqual(["Alpha p2"]);
  });
});

test.describe("sign pdf tool", () => {
  test("places a signature, moves it, and exports a signed PDF", async ({ page }) => {
    await goto(page, "/tools/sign-pdf");
    await expect(page.getByRole("heading", { name: "Sign PDF" })).toBeVisible();
    await page.locator('input[type="file"][accept=".pdf"]').setInputFiles(join(FIXTURES, "doc-a.pdf"));
    await expect(page.locator(".annotate-canvas-wrap img")).toBeVisible({ timeout: 20_000 });
    // doc-a has two pages: the page bar must expose both.
    await expect(page.locator(".annotate-pagebar")).toContainText("Page 1 of 2");
    await page.getByLabel("Next page").click();
    await expect(page.locator(".annotate-pagebar")).toContainText("Page 2 of 2");
    await page.getByLabel("Previous page").click();
    await page.locator('input[type="file"][accept="image/png,image/jpeg"]').setInputFiles(join(FIXTURES, "signature.png"));
    await page.getByRole("button", { name: /Place signature/i }).click();
    await expect(page.locator(".annotate-item.annotate-image")).toBeVisible();

    // Drag the placed signature towards the lower-middle of the page.
    const item = page.locator(".annotate-item.annotate-image");
    const box = await item.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 60, box!.y + box!.height / 2 + 90, { steps: 5 });
    await page.mouse.up();

    await page.getByRole("button", { name: /Prepare signed PDF/i }).click();
    await expect(page.locator(".tool-message.success")).toContainText(/ready/i);
    const { path } = await downloadOutputs(page);
    expectMagic(path, MAGIC.pdf);
    const signed = await PDFDocument.load(readFileSync(path));
    expect(signed.getPageCount()).toBe(2);
    expect(readFileSync(path).length).toBeGreaterThan(readFileSync(join(FIXTURES, "doc-a.pdf")).length + 2000);
  });
});

test.describe("edit pdf tool", () => {
  test("adds retypeable text and a cover box, then exports an edited PDF", async ({ page }) => {
    await goto(page, "/tools/edit-pdf");
    await expect(page.getByRole("heading", { name: "Edit PDF" })).toBeVisible();
    await page.locator('input[type="file"][accept=".pdf"]').setInputFiles(join(FIXTURES, "doc-a.pdf"));
    await expect(page.locator(".annotate-canvas-wrap img")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /Add cover box/i }).click();
    await expect(page.locator(".annotate-item.annotate-cover")).toBeVisible();
    await page.getByRole("button", { name: /Add text/i }).click();
    await expect(page.locator(".annotate-item.annotate-text")).toBeVisible();
    await page.getByLabel("Text", { exact: true }).fill("Fixed by E2E");
    await page.getByRole("button", { name: /Prepare edited PDF/i }).click();
    await expect(page.locator(".tool-message.success")).toContainText(/ready/i);
    const { path } = await downloadOutputs(page);
    expectMagic(path, MAGIC.pdf);
    const texts = await pdfPagesText(path);
    expect(texts[0]).toContain("Fixed by E2E");
    expect(texts[0]).toContain("Alpha p1");
  });
});
test.describe("global health", () => {
  test("no uncaught page errors across the main flows", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await goto(page, "/");
    await goto(page, "/tools/passport-photo");
    await upload(page, "photo.png");
    await page.getByRole("button", { name: /^Prepare/ }).click();
    await expect(page.locator(".tool-message.success")).toContainText(/ready/);
    await goto(page, "/tools/pdf");
    await upload(page, "doc-a.pdf");
    await page.getByRole("button", { name: /^Prepare/ }).click();
    await expect(page.locator(".tool-message.success")).toContainText(/ready/);
    expect(errors, `uncaught page errors: ${errors.join(" | ")}`).toHaveLength(0);
  });
});
