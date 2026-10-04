"use client";

// Lazily loads pdf.js in the browser so server rendering never touches it.
type PdfJs = typeof import("pdfjs-dist");
type PdfDocument = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;

let pdfjsPromise: Promise<PdfJs> | undefined;

export async function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= (async () => {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  return pdfjsPromise;
}

async function openDocument(data: ArrayBuffer): Promise<{ document: PdfDocument; close: () => Promise<void> }> {
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data });
  return { document: await loadingTask.promise, close: () => loadingTask.destroy() };
}

export type RenderedPage = { dataUrl: string; width: number; height: number };

// Renders one page to a data URL sized to roughly `targetWidth` CSS pixels,
// which is enough for picker thumbnails and annotation previews.
export async function renderPageToDataUrl(buffer: ArrayBuffer, pageIndex: number, targetWidth = 220): Promise<RenderedPage> {
  const { document: pdf, close } = await openDocument(buffer.slice(0));
  try {
    const page = await pdf.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.max(.2, targetWidth / base.width) });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot render PDF pages.");
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    return { dataUrl: canvas.toDataURL("image/png"), width: base.width, height: base.height };
  } finally { await close(); }
}

export async function getPdfPageCount(buffer: ArrayBuffer): Promise<number> {
  const { document: pdf, close } = await openDocument(buffer.slice(0));
  try { return pdf.numPages; } finally { await close(); }
}
