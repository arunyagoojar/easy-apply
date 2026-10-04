"use client";

export function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

export function isPdfFile(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|tiff?)$/i.test(file.name);
}

export function isHeicFile(file: File) {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

/** File name without extension, made safe for every operating system. */
export function baseName(name: string) {
  const cleaned = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 80) || "file";
}

/** Adds -2, -3… to repeated names so nothing is overwritten inside a ZIP. */
export function uniqueNames(names: string[]) {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name.toLowerCase()) ?? 0;
    seen.set(name.toLowerCase(), count + 1);
    if (!count) return name;
    const dot = name.lastIndexOf(".");
    return dot > 0 ? `${name.slice(0, dot)}-${count + 1}${name.slice(dot)}` : `${name}-${count + 1}`;
  });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke later: some browsers start the download asynchronously.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function zipBlobs(entries: Array<{ name: string; blob: Blob }>) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const names = uniqueNames(entries.map((entry) => entry.name));
  entries.forEach((entry, index) => zip.file(names[index], entry.blob));
  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

// Files dropped on the tools page are handed to the workspace that opens next.
let pendingHandOff: { target: "image" | "pdf"; files: File[] } | null = null;

export function handOffFiles(target: "image" | "pdf", files: File[]) {
  pendingHandOff = { target, files };
}

export function takeHandOff(target: "image" | "pdf"): File[] {
  if (!pendingHandOff || pendingHandOff.target !== target) return [];
  const handOff = pendingHandOff;
  // Cleared shortly after, so React's development double-render sees the same files.
  window.setTimeout(() => { if (pendingHandOff === handOff) pendingHandOff = null; }, 1000);
  return handOff.files;
}
