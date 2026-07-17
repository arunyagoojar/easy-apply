"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import { PDFDocument, degrees } from "pdf-lib";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Crop,
  Download,
  EyeOff,
  FileCheck2,
  FileImage,
  FileSignature,
  Files,
  HardDrive,
  Image as ImageIcon,
  Info,
  Lock,
  Languages,
  Menu,
  Merge,
  Moon,
  Plus,
  RotateCw,
  Scissors,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  UploadCloud,
  WandSparkles,
  X,
} from "lucide-react";
import { ChangeEvent, DragEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "./SiteHeader";
import { useLanguage } from "./LanguageProvider";

export type ToolKind = "passport" | "signature" | "pdf" | "image" | "faq";
type ImageFormat = "jpeg" | "png" | "webp" | "pdf";
type Uploaded = { file: File; url: string; width?: number; height?: number };
type Prepared = { blob: Blob; url: string; name: string; width?: number; height?: number };
type CropRect = { x: number; y: number; width: number; height: number };
type CropHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
type StoredWorkspace = {
  kind: ToolKind;
  inputs: Array<{ file: File; width?: number; height?: number }>;
  outputs: Array<{ blob: Blob; name: string; width?: number; height?: number }>;
};
type WorkspaceSettings = {
  resolution: string;
  width: number;
  height: number;
  format: ImageFormat;
  background: string;
  customColor: string;
  targetKb: number;
  customTarget: number;
  cropOpen: boolean;
  cropAspect: string;
  customRatioWidth: number;
  customRatioHeight: number;
  cropRect: CropRect;
  brightness: number;
  contrast: number;
  saturation: number;
  quality: number;
  rotation: number;
  pdfAction: string;
};

const WORKSPACE_DATABASE = "easyapply-workspaces";
const WORKSPACE_STORE = "tool-workspaces";
const WORKSPACE_SETTINGS_PREFIX = "easyapply-workspace-settings-v1-";

function openWorkspaceDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(WORKSPACE_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(WORKSPACE_STORE)) request.result.createObjectStore(WORKSPACE_STORE, { keyPath: "kind" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function loadStoredWorkspace(kind: ToolKind) {
  const database = await openWorkspaceDatabase();
  try {
    return await new Promise<StoredWorkspace | undefined>((resolve, reject) => {
      const request = database.transaction(WORKSPACE_STORE, "readonly").objectStore(WORKSPACE_STORE).get(kind);
      request.onsuccess = () => resolve(request.result as StoredWorkspace | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}

async function saveStoredWorkspace(workspace: StoredWorkspace) {
  const database = await openWorkspaceDatabase();
  try {
    const transaction = database.transaction(WORKSPACE_STORE, "readwrite");
    transaction.objectStore(WORKSPACE_STORE).put(workspace);
    await transactionComplete(transaction);
  } finally { database.close(); }
}

async function deleteStoredWorkspace(kind: ToolKind) {
  const database = await openWorkspaceDatabase();
  try {
    const transaction = database.transaction(WORKSPACE_STORE, "readwrite");
    transaction.objectStore(WORKSPACE_STORE).delete(kind);
    await transactionComplete(transaction);
  } finally { database.close(); }
}

const toolDetails = {
  passport: { title: "Passport Photo", hiTitle: "पासपोर्ट फोटो", description: "Crop, resize and compress a photo to the exact settings requested by an application portal.", hiDescription: "आवेदन पोर्टल के अनुसार फोटो को क्रॉप, रिसाइज़ और कम्प्रेस करें।", icon: FileImage, accept: "image/png,image/jpeg,image/webp,image/heic" },
  signature: { title: "Signature", hiTitle: "हस्ताक्षर", description: "Crop a signature from any image, improve legibility and export it in the format and size you need.", hiDescription: "किसी भी इमेज से हस्ताक्षर क्रॉप करें और आवश्यक फ़ॉर्मेट व आकार में तैयार करें।", icon: FileSignature, accept: "image/png,image/jpeg,image/webp,image/heic" },
  pdf: { title: "PDF Toolkit", hiTitle: "PDF टूलकिट", description: "Merge, split, rotate or create PDFs locally without uploading your documents.", hiDescription: "दस्तावेज़ अपलोड किए बिना PDF को मर्ज, स्प्लिट, रोटेट या बनाएँ।", icon: Files, accept: ".pdf,image/png,image/jpeg" },
  image: { title: "Image Tools", hiTitle: "इमेज टूलकिट", description: "Resize, convert and adjust one image or a whole batch with the same output settings.", hiDescription: "एक या कई इमेज को एक ही सेटिंग से रिसाइज़, कन्वर्ट और एडजस्ट करें।", icon: ImageIcon, accept: "image/png,image/jpeg,image/webp,image/heic" },
  faq: { title: "Privacy & FAQ", hiTitle: "गोपनीयता और FAQ", description: "Know exactly how EasyApply works.", hiDescription: "जानें कि EasyApply कैसे काम करता है।", icon: ShieldCheck, accept: "" },
};

const resolutionWidths = [100, 150, 200, 300, 400, 500, 600, 800, 1024];
const targetOptions = [[5, "5 KB"], [10, "10 KB"], [20, "20 KB"], [30, "30 KB"], [50, "50 KB"], [100, "100 KB"], [200, "200 KB"], [300, "300 KB"], [500, "500 KB"], [1024, "1 MB"], [2048, "2 MB"]] as const;

const cropRatios: Record<string, number> = {
  "1:1": 1,
  "3:4": 3 / 4,
  "4:5": 4 / 5,
  passport: 35 / 45,
  signature: 4,
};

function formatBytes(bytes?: number) {
  if (bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function safeName(name: string, extension: string) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]+/g, "-");
  return `${base || "easyapply"}-prepared.${extension}`;
}

async function loadImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("This image format is not supported by your browser."));
      image.src = url;
    });
    return image;
  } finally { URL.revokeObjectURL(url); }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality = .9) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create the output file.")), type, quality));
}

export function ToolWorkspace({ kind }: { kind: ToolKind }) {
  return <ToolWorkspaceInner key={kind} kind={kind} />;
}

function ToolWorkspaceInner({ kind }: { kind: ToolKind }) {
  const details = toolDetails[kind];
  const defaultCropAspect = kind === "passport" ? "passport" : kind === "signature" ? "signature" : "free";
  const router = useRouter();
  const { language, setLanguage } = useLanguage();
  const hi = language === "hi";
  const [dark, setDark] = useState(true);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const displayTitle = hi ? details.hiTitle : details.title;
  const displayDescription = hi ? details.hiDescription : details.description;
  const ToolIcon = details.icon;
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Uploaded[]>([]);
  const [prepared, setPrepared] = useState<Prepared[]>([]);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [resolution, setResolution] = useState("300x300");
  const [width, setWidth] = useState(300);
  const [height, setHeight] = useState(300);
  const [format, setFormat] = useState<ImageFormat>("jpeg");
  const [background, setBackground] = useState("white");
  const [customColor, setCustomColor] = useState("#eaf1ff");
  const [targetKb, setTargetKb] = useState(50);
  const [customTarget, setCustomTarget] = useState(50);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropDragging, setCropDragging] = useState(false);
  const [cropAspect, setCropAspect] = useState(defaultCropAspect);
  const [customRatioWidth, setCustomRatioWidth] = useState(4);
  const [customRatioHeight, setCustomRatioHeight] = useState(1);
  const [cropRect, setCropRect] = useState<CropRect>({ x: 8, y: 8, width: 84, height: 84 });
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [quality, setQuality] = useState(88);
  const [rotation, setRotation] = useState(0);
  const [pdfAction, setPdfAction] = useState("merge");
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const filesRef = useRef<Uploaded[]>([]);
  const preparedRef = useRef<Prepared[]>([]);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const cropDragRef = useRef<{
    mode: "move" | "resize";
    handle: CropHandle | null;
    clientX: number;
    clientY: number;
    rect: CropRect;
    stage: DOMRect;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const restoreWorkspace = async () => {
      try {
        const rawSettings = localStorage.getItem(`${WORKSPACE_SETTINGS_PREFIX}${kind}`);
        if (rawSettings) {
          const settings = JSON.parse(rawSettings) as Partial<WorkspaceSettings>;
          if (typeof settings.resolution === "string") setResolution(settings.resolution);
          if (typeof settings.width === "number") setWidth(settings.width);
          if (typeof settings.height === "number") setHeight(settings.height);
          if (settings.format && ["jpeg", "png", "webp", "pdf"].includes(settings.format)) setFormat(settings.format);
          if (typeof settings.background === "string") setBackground(settings.background);
          if (typeof settings.customColor === "string") setCustomColor(settings.customColor);
          if (typeof settings.targetKb === "number") setTargetKb(settings.targetKb);
          if (typeof settings.customTarget === "number") setCustomTarget(settings.customTarget);
          if (typeof settings.cropOpen === "boolean") setCropOpen(settings.cropOpen);
          if (typeof settings.cropAspect === "string") setCropAspect(settings.cropAspect);
          if (typeof settings.customRatioWidth === "number") setCustomRatioWidth(settings.customRatioWidth);
          if (typeof settings.customRatioHeight === "number") setCustomRatioHeight(settings.customRatioHeight);
          if (settings.cropRect && [settings.cropRect.x, settings.cropRect.y, settings.cropRect.width, settings.cropRect.height].every((value) => typeof value === "number")) setCropRect(settings.cropRect);
          if (typeof settings.brightness === "number") setBrightness(settings.brightness);
          if (typeof settings.contrast === "number") setContrast(settings.contrast);
          if (typeof settings.saturation === "number") setSaturation(settings.saturation);
          if (typeof settings.quality === "number") setQuality(settings.quality);
          if (typeof settings.rotation === "number") setRotation(settings.rotation);
          if (typeof settings.pdfAction === "string") setPdfAction(settings.pdfAction);
        }

        if (typeof indexedDB !== "undefined") {
          const stored = await loadStoredWorkspace(kind);
          if (stored) {
            const restoredFiles = stored.inputs.map((item) => ({ ...item, url: URL.createObjectURL(item.file) }));
            const restoredOutputs = stored.outputs.map((item) => ({ ...item, url: URL.createObjectURL(item.blob) }));
            if (cancelled) {
              restoredFiles.forEach((item) => URL.revokeObjectURL(item.url));
              restoredOutputs.forEach((item) => URL.revokeObjectURL(item.url));
              return;
            }
            setFiles(restoredFiles);
            setPrepared(restoredOutputs);
          }
        }
      } catch {
        // Storage can be unavailable in strict privacy modes; the tools still work for this tab.
      } finally {
        if (!cancelled) setWorkspaceReady(true);
      }
    };
    restoreWorkspace();
    return () => { cancelled = true; };
  }, [kind]);

  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => { preparedRef.current = prepared; }, [prepared]);

  useEffect(() => () => {
    filesRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    preparedRef.current.forEach((item) => URL.revokeObjectURL(item.url));
  }, []);

  useEffect(() => {
    if (!workspaceReady) return;
    const settings: WorkspaceSettings = { resolution, width, height, format, background, customColor, targetKb, customTarget, cropOpen, cropAspect, customRatioWidth, customRatioHeight, cropRect, brightness, contrast, saturation, quality, rotation, pdfAction };
    try { localStorage.setItem(`${WORKSPACE_SETTINGS_PREFIX}${kind}`, JSON.stringify(settings)); } catch { /* Keep working when browser storage is unavailable. */ }
  }, [workspaceReady, kind, resolution, width, height, format, background, customColor, targetKb, customTarget, cropOpen, cropAspect, customRatioWidth, customRatioHeight, cropRect, brightness, contrast, saturation, quality, rotation, pdfAction]);

  useEffect(() => {
    if (!workspaceReady || typeof indexedDB === "undefined") return;
    const workspace: StoredWorkspace = {
      kind,
      inputs: files.map(({ file, width: itemWidth, height: itemHeight }) => ({ file, width: itemWidth, height: itemHeight })),
      outputs: prepared.map(({ blob, name, width: itemWidth, height: itemHeight }) => ({ blob, name, width: itemWidth, height: itemHeight })),
    };
    saveQueueRef.current = saveQueueRef.current
      .then(() => workspace.inputs.length || workspace.outputs.length ? saveStoredWorkspace(workspace) : deleteStoredWorkspace(kind))
      .catch(() => undefined);
  }, [workspaceReady, kind, files, prepared]);

  useEffect(() => {
    const next = localStorage.getItem("easyapply-theme") !== "light";
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("easyapply-theme", next ? "dark" : "light");
  };

  const addFiles = useCallback(async (incoming: File[]) => {
    if (!incoming.length) return;
    const additions = await Promise.all(incoming.map(async (file) => {
      const item: Uploaded = { file, url: URL.createObjectURL(file) };
      if (file.type.startsWith("image/")) {
        try { const image = await loadImage(file); item.width = image.naturalWidth; item.height = image.naturalHeight; } catch { /* Surface the format issue during processing. */ }
      }
      return item;
    }));
    setFiles((current) => [...current, ...additions]);
    if (!files.length && additions[0]?.width && additions[0]?.height) {
      const sourceRatio = additions[0].width / additions[0].height;
      const defaultRatio = cropRatios[defaultCropAspect];
      if (defaultRatio) {
        const percentRatio = defaultRatio / sourceRatio;
        let cropWidth = 84;
        let cropHeight = cropWidth / percentRatio;
        if (cropHeight > 84) { cropHeight = 84; cropWidth = cropHeight * percentRatio; }
        setCropRect({ x: (100 - cropWidth) / 2, y: (100 - cropHeight) / 2, width: cropWidth, height: cropHeight });
        setHeight(Math.max(1, Math.round(width / defaultRatio)));
      } else {
        setCropRect({ x: 8, y: 8, width: 84, height: 84 });
        setHeight(Math.max(1, Math.round(width / sourceRatio)));
      }
      setResolution("custom");
      setCropAspect(defaultCropAspect);
    }
    setPrepared((current) => { current.forEach((item) => URL.revokeObjectURL(item.url)); return []; });
    setMessage("");
  }, [defaultCropAspect, files.length, width]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const incoming = Array.from(event.clipboardData?.files ?? []);
      if (incoming.length) addFiles(incoming);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addFiles]);

  const changeResolution = (value: string) => {
    setResolution(value);
    if (value !== "custom") {
      const [nextWidth, nextHeight] = value.split("x").map(Number);
      setWidth(nextWidth); setHeight(nextHeight);
    }
  };

  const getCropRatio = (rect = cropRect) => {
    const item = files[0];
    const sourceWidth = item?.width || 1;
    const sourceHeight = item?.height || 1;
    return Math.max(.01, (rect.width * sourceWidth) / (rect.height * sourceHeight));
  };

  const syncOutputRatio = (ratio: number, preferredWidth = width) => {
    setWidth(Math.max(1, Math.round(preferredWidth)));
    setHeight(Math.max(1, Math.round(preferredWidth / Math.max(.01, ratio))));
    setResolution("custom");
  };

  const changeWidth = (next: number) => syncOutputRatio(getCropRatio(), next);
  const changeHeight = (next: number) => {
    const ratio = getCropRatio();
    setHeight(next);
    setWidth(Math.max(1, Math.round(next * ratio)));
    setResolution("custom");
  };

  const fitCropToRatio = (ratio: number) => {
    const item = files[0];
    const sourceRatio = (item?.width || 1) / (item?.height || 1);
    const percentRatio = ratio / sourceRatio;
    let nextWidth = 84;
    let nextHeight = nextWidth / percentRatio;
    if (nextHeight > 84) { nextHeight = 84; nextWidth = nextHeight * percentRatio; }
    const next = { x: (100 - nextWidth) / 2, y: (100 - nextHeight) / 2, width: nextWidth, height: nextHeight };
    setCropRect(next);
    syncOutputRatio(ratio);
  };

  const getSelectedRatio = (value = cropAspect) => value === "custom" ? Math.max(.01, customRatioWidth / Math.max(.01, customRatioHeight)) : cropRatios[value];

  const changeCropAspect = (value: string) => {
    setCropAspect(value);
    if (value === "free") { syncOutputRatio(getCropRatio()); return; }
    const ratio = getSelectedRatio(value);
    if (ratio) fitCropToRatio(ratio);
  };

  const updateCustomRatio = (nextWidth: number, nextHeight: number) => {
    const safeWidth = Math.max(1, nextWidth);
    const safeHeight = Math.max(1, nextHeight);
    setCustomRatioWidth(safeWidth);
    setCustomRatioHeight(safeHeight);
    fitCropToRatio(safeWidth / safeHeight);
  };

  const removeFile = (index: number) => {
    setFiles((current) => { URL.revokeObjectURL(current[index].url); return current.filter((_, itemIndex) => itemIndex !== index); });
    setPrepared((current) => { current.forEach((item) => URL.revokeObjectURL(item.url)); return []; });
  };

  const beginCropDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!cropOpen || !stage) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const handle = (event.target as HTMLElement).dataset.cropHandle as CropHandle | undefined;
    cropDragRef.current = { mode: handle ? "resize" : "move", handle: handle || null, clientX: event.clientX, clientY: event.clientY, rect: cropRect, stage };
    setCropDragging(true);
  };

  const moveCrop = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = cropDragRef.current;
    if (!cropDragging || !interaction) return;
    event.preventDefault();
    const dx = (event.clientX - interaction.clientX) / Math.max(1, interaction.stage.width) * 100;
    const dy = (event.clientY - interaction.clientY) / Math.max(1, interaction.stage.height) * 100;
    const start = interaction.rect;
    let next = { ...start };

    if (interaction.mode === "move") {
      next.x = Math.max(0, Math.min(100 - start.width, start.x + dx));
      next.y = Math.max(0, Math.min(100 - start.height, start.y + dy));
    } else if (interaction.handle) {
      const handle = interaction.handle;
      const minSize = 4;
      const right = start.x + start.width;
      const bottom = start.y + start.height;
      if (cropAspect === "free") {
        if (handle.includes("w")) { next.x = Math.max(0, Math.min(right - minSize, start.x + dx)); next.width = right - next.x; }
        if (handle.includes("e")) next.width = Math.max(minSize, Math.min(100 - start.x, start.width + dx));
        if (handle.includes("n")) { next.y = Math.max(0, Math.min(bottom - minSize, start.y + dy)); next.height = bottom - next.y; }
        if (handle.includes("s")) next.height = Math.max(minSize, Math.min(100 - start.y, start.height + dy));
      } else {
        const ratio = getSelectedRatio();
        const percentRatio = ratio * interaction.stage.height / interaction.stage.width;
        const west = handle.includes("w");
        const north = handle.includes("n");
        const anchorX = west ? right : start.x;
        const anchorY = north ? bottom : start.y;
        let pointerX = Math.max(0, Math.min(100, start.x + (west ? dx : start.width + dx)));
        let pointerY = Math.max(0, Math.min(100, start.y + (north ? dy : start.height + dy)));
        pointerX = west ? Math.min(anchorX - minSize, pointerX) : Math.max(anchorX + minSize, pointerX);
        pointerY = north ? Math.min(anchorY - minSize, pointerY) : Math.max(anchorY + minSize, pointerY);
        let nextWidth = Math.abs(anchorX - pointerX);
        let nextHeight = Math.abs(anchorY - pointerY);
        if (nextWidth / nextHeight > percentRatio) nextWidth = nextHeight * percentRatio;
        else nextHeight = nextWidth / percentRatio;
        next = { x: west ? anchorX - nextWidth : anchorX, y: north ? anchorY - nextHeight : anchorY, width: nextWidth, height: nextHeight };
      }
    }

    setCropRect(next);
    syncOutputRatio(getCropRatio(next));
  };

  const endCropDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!cropDragging) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    cropDragRef.current = null;
    setCropDragging(false);
  };

  const prepareImage = async (item: Uploaded): Promise<Prepared> => {
    const image = await loadImage(item.file);
    const canvas = document.createElement("canvas");
    const rotated = rotation % 180 !== 0;
    canvas.width = Math.max(1, rotated ? height : width);
    canvas.height = Math.max(1, rotated ? width : height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this browser.");
    const activeBackground = background === "custom" ? customColor : background;
    if (activeBackground === "white" || format === "jpeg" || format === "pdf") { context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); }
    else if (activeBackground === "original") { context.fillStyle = "#f7f7f7"; context.fillRect(0, 0, canvas.width, canvas.height); }
    else if (activeBackground.startsWith("#")) { context.fillStyle = activeBackground; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(rotation * Math.PI / 180);
    context.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    const targetWidth = rotated ? canvas.height : canvas.width;
    const targetHeight = rotated ? canvas.width : canvas.height;
    if (cropOpen) {
      const sourceX = image.naturalWidth * cropRect.x / 100;
      const sourceY = image.naturalHeight * cropRect.y / 100;
      const sourceWidth = Math.max(1, image.naturalWidth * cropRect.width / 100);
      const sourceHeight = Math.max(1, image.naturalHeight * cropRect.height / 100);
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
    } else {
      const coverScale = Math.max(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight);
      const drawWidth = image.naturalWidth * coverScale;
      const drawHeight = image.naturalHeight * coverScale;
      context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    }
    context.restore();

    const rasterFormat = format === "png" ? "png" : format === "webp" ? "webp" : "jpeg";
    let outputQuality = quality / 100;
    let blob = await toBlob(canvas, `image/${rasterFormat}`, outputQuality);
    const target = (customTarget || targetKb) * 1024;
    if (rasterFormat !== "png" && target > 0 && blob.size > target) {
      let low = .06, high = outputQuality;
      for (let attempt = 0; attempt < 9; attempt += 1) {
        const candidateQuality = (low + high) / 2;
        const candidate = await toBlob(canvas, `image/${rasterFormat}`, candidateQuality);
        if (candidate.size > target) high = candidateQuality; else { blob = candidate; low = candidateQuality; }
      }
    }

    if (format === "pdf") {
      const document = await PDFDocument.create();
      const bytes = await blob.arrayBuffer();
      const embedded = rasterFormat === "png" ? await document.embedPng(bytes) : await document.embedJpg(bytes);
      const page = document.addPage([canvas.width, canvas.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: canvas.width, height: canvas.height });
      const pdfBytes = await document.save();
      blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
    }
    const extension = format === "jpeg" ? "jpg" : format;
    return { blob, url: URL.createObjectURL(blob), name: safeName(item.file.name, extension), width: canvas.width, height: canvas.height };
  };

  const preparePdf = async (): Promise<Prepared[]> => {
    if (pdfAction === "image-to-pdf") {
      const document = await PDFDocument.create();
      for (const item of files) {
        if (!item.file.type.startsWith("image/")) continue;
        const bytes = await item.file.arrayBuffer();
        const embedded = item.file.type.includes("png") ? await document.embedPng(bytes) : await document.embedJpg(bytes);
        const page = document.addPage([embedded.width, embedded.height]);
        page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
      }
      if (!document.getPageCount()) throw new Error("Add at least one PNG or JPEG image.");
      const bytes = await document.save();
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      return [{ blob, url: URL.createObjectURL(blob), name: "easyapply-images.pdf" }];
    }
    const pdfFiles = files.filter((item) => item.file.type === "application/pdf");
    if (!pdfFiles.length) throw new Error("Add at least one PDF file.");
    if (pdfAction === "split") {
      const source = await PDFDocument.load(await pdfFiles[0].file.arrayBuffer());
      const outputs: Prepared[] = [];
      for (let index = 0; index < source.getPageCount(); index += 1) {
        const document = await PDFDocument.create();
        const [page] = await document.copyPages(source, [index]); document.addPage(page);
        const bytes = await document.save(); const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
        outputs.push({ blob, url: URL.createObjectURL(blob), name: `easyapply-page-${index + 1}.pdf` });
      }
      return outputs;
    }
    const output = await PDFDocument.create();
    for (const item of pdfFiles) {
      const source = await PDFDocument.load(await item.file.arrayBuffer());
      const pages = await output.copyPages(source, source.getPageIndices());
      pages.forEach((page) => { if (pdfAction === "rotate") page.setRotation(degrees((page.getRotation().angle + 90) % 360)); output.addPage(page); });
    }
    const bytes = await output.save(); const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
    return [{ blob, url: URL.createObjectURL(blob), name: pdfAction === "rotate" ? "easyapply-rotated.pdf" : "easyapply-merged.pdf" }];
  };

  const process = async () => {
    if (!files.length) { setMessage("Choose at least one file first."); return; }
    setProcessing(true); setMessage("");
    try {
      prepared.forEach((item) => URL.revokeObjectURL(item.url));
      const outputs = kind === "pdf" ? await preparePdf() : await Promise.all(files.map(prepareImage));
      setPrepared(outputs); setMessage(`${outputs.length} ${outputs.length === 1 ? "file is" : "files are"} ready.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The file could not be prepared."); }
    finally { setProcessing(false); }
  };

  const downloadOne = (item: Prepared) => { const anchor = document.createElement("a"); anchor.href = item.url; anchor.download = item.name; anchor.click(); };
  const downloadAll = async () => {
    if (prepared.length === 1) return downloadOne(prepared[0]);
    const zip = new JSZip(); prepared.forEach((item) => zip.file(item.name, item.blob));
    const blob = await zip.generateAsync({ type: "blob" }); const url = URL.createObjectURL(blob);
    downloadOne({ blob, url, name: "easyapply-files.zip" }); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const original = files[0];
  const output = prepared[0];
  const outputTarget = customTarget || targetKb;
  const currentCropRatio = getCropRatio();
  const resolutionOptions = resolutionWidths.map((itemWidth) => {
    const itemHeight = Math.max(1, Math.round(itemWidth / currentCropRatio));
    return [`${itemWidth}x${itemHeight}`, `${itemWidth} × ${itemHeight} px`] as const;
  });
  const resolutionValue = resolutionOptions.some(([value]) => value === resolution) ? resolution : "custom";
  const cropHandles: CropHandle[] = cropAspect === "free" ? ["n", "ne", "e", "se", "s", "sw", "w", "nw"] : ["ne", "se", "sw", "nw"];
  const switchTool = (item: ToolKind, href: string) => {
    if (item === kind) return;
    router.push(href);
  };

  return (
    <motion.div className="tool-app-shell" initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .32, ease: [0.22, 1, 0.36, 1] }}>
      <header className="app-topbar">
        <button className="icon-button app-mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label={hi ? "टूल मेनू खोलें" : "Open tools menu"}><Menu size={20} /></button>
        <Link className="brand app-brand" href="/" aria-label="Return to EasyApply home"><BrandMark /><span>EasyApply</span></Link>
        <nav className="app-tool-tabs" aria-label="Switch tool">
          {(["passport", "signature", "pdf", "image"] as ToolKind[]).map((item) => {
            const itemDetails = toolDetails[item]; const Icon = itemDetails.icon;
            const href = item === "passport" ? "/tools/passport-photo" : `/tools/${item}`;
            return <button key={item} className={kind === item ? "active" : ""} onClick={() => switchTool(item, href)}><Icon size={18} /><span>{hi ? itemDetails.hiTitle : itemDetails.title}</span></button>;
          })}
        </nav>
        <div className="app-toolbar-actions">
          <div className="language-menu-wrap">
            <button className="icon-button" onClick={() => setLanguageOpen((value) => !value)} aria-label={hi ? "भाषा चुनें" : "Choose language"} aria-expanded={languageOpen}><Languages size={18} /></button>
            {languageOpen && <div className="language-menu app-language-menu"><button className={language === "en" ? "active" : ""} onClick={() => { setLanguage("en"); setLanguageOpen(false); }}><span>EN</span><div><b>English</b><small>English</small></div>{language === "en" && <Check size={15} />}</button><button className={language === "hi" ? "active" : ""} onClick={() => { setLanguage("hi"); setLanguageOpen(false); }}><span>हि</span><div><b>हिन्दी</b><small>Hindi</small></div>{language === "hi" && <Check size={15} />}</button></div>}
          </div>
          <button className="icon-button" onClick={toggleTheme} aria-label={hi ? dark ? "लाइट मोड पर जाएँ" : "डार्क मोड पर जाएँ" : `Switch to ${dark ? "light" : "dark"} mode`} title={hi ? dark ? "लाइट मोड" : "डार्क मोड" : dark ? "Light mode" : "Dark mode"}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
          <Link href="/privacy-faq" className="icon-button" aria-label={hi ? "FAQ और गोपनीयता" : "FAQ & Privacy"} title={hi ? "FAQ और गोपनीयता" : "FAQ & Privacy"}><Info size={18} /></Link>
        </div>
        <AnimatePresence>{mobileMenuOpen && <><motion.button className="app-mobile-menu-backdrop" aria-label={hi ? "मेनू बंद करें" : "Close menu"} onClick={() => setMobileMenuOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /><motion.aside className="app-mobile-drawer" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ duration: .24, ease: [0.22, 1, 0.36, 1] }}><div className="app-mobile-drawer-head"><Link className="brand" href="/" onClick={() => setMobileMenuOpen(false)}><BrandMark /><span>EasyApply</span></Link><button className="icon-button" onClick={() => setMobileMenuOpen(false)} aria-label={hi ? "मेनू बंद करें" : "Close menu"}><X size={19} /></button></div><div className="app-mobile-drawer-section"><small>{hi ? "टूल चुनें" : "CHOOSE A TOOL"}</small>{(["passport", "signature", "pdf", "image"] as ToolKind[]).map((item) => { const itemDetails = toolDetails[item]; const Icon = itemDetails.icon; const href = item === "passport" ? "/tools/passport-photo" : `/tools/${item}`; return <button key={item} className={kind === item ? "active" : ""} onClick={() => { setMobileMenuOpen(false); switchTool(item, href); }}><Icon size={19} /><span>{hi ? itemDetails.hiTitle : itemDetails.title}</span>{kind === item && <Check size={17} />}</button>; })}</div><div className="app-mobile-drawer-section app-mobile-preferences"><small>{hi ? "प्राथमिकताएँ" : "PREFERENCES"}</small><div className="drawer-language"><span><Languages size={18} /> {hi ? "भाषा" : "Language"}</span><div><button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button><button className={language === "hi" ? "active" : ""} onClick={() => setLanguage("hi")}>हिन्दी</button></div></div><button className="drawer-theme" onClick={toggleTheme}>{dark ? <Sun size={18} /> : <Moon size={18} />}<span>{hi ? dark ? "लाइट मोड" : "डार्क मोड" : dark ? "Light mode" : "Dark mode"}</span></button><Link href="/privacy-faq" className="drawer-theme" onClick={() => setMobileMenuOpen(false)} style={{ display: "flex", gap: "10px", alignItems: "center", width: "100%", padding: "10px 14px", color: "inherit", textDecoration: "none" }}><Info size={18} /><span>{hi ? "FAQ और गोपनीयता" : "FAQ & Privacy"}</span></Link></div></motion.aside></>}</AnimatePresence>
      </header>

      <motion.main key={kind} className="tool-app-main" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .24, ease: [0.22, 1, 0.36, 1] }}>
        {kind === "faq" ? (() => {
          const privacy = hi
            ? [[HardDrive, "लोकल प्रोसेसिंग", "क्रॉपिंग, कम्प्रेशन और कन्वर्ज़न इसी ब्राउज़र में होते हैं।"], [EyeOff, "फ़ाइल की जाँच नहीं", "EasyApply आपकी फ़ाइलों का विश्लेषण या क्लाउड रिकॉर्ड नहीं बनाता।"], [Trash2, "कुछ भी सेव नहीं", "टैब बंद करते ही वर्तमान कार्य सत्र समाप्त हो जाता है।"]]
            : [[HardDrive, "Processed locally", "Cropping, compression and conversion happen inside this browser."], [EyeOff, "Nothing is inspected", "EasyApply does not analyse your files or create a cloud record."], [Trash2, "Nothing is retained", "Close the tab and the current working session is gone."]];
          const faqs = hi
            ? [["क्या EasyApply मेरे आवेदन की आवश्यकताएँ जानता है?", "नहीं। पोर्टल पर दिए गए आयाम, फ़ॉर्मेट और आकार आप चुनते हैं।"], ["क्या मैं सटीक फ़ाइल आकार चुन सकता हूँ?", "हाँ। EasyApply चुनी हुई सीमा के करीब पहुँचने के लिए गुणवत्ता समायोजित करता है।"], ["क्या फोटो और हस्ताक्षर PDF में मिल सकते हैं?", "हाँ। आउटपुट फ़ॉर्मेट में PDF चुनें।"], ["क्या कई फ़ाइलें एक साथ प्रोसेस हो सकती हैं?", "हाँ। समान सेटिंग लागू करें और परिणाम ZIP में डाउनलोड करें।"]]
            : [["Does EasyApply know my application requirements?", "No. You choose the dimensions, format and size shown by the application portal."], ["Can I target an exact file size?", "Yes. EasyApply adjusts quality to get close to the selected limit where possible."], ["Can I export photos and signatures as PDF?", "Yes. Choose PDF from the output-format menu."], ["Can I process several files?", "Yes. Apply the same settings and download the results together as a ZIP."]];
          return (
            <div className="container privacy-faq-main" style={{ padding: "40px 30px", maxWidth: "1000px", margin: "0 auto", overflowY: "auto", height: "100%" }}>
              <div className="privacy-faq-hero" style={{ marginBottom: "40px" }}>
                <span className="tool-icon" style={{ color: "var(--blue)" }}><ShieldCheck size={28} /></span>
                <span className="section-kicker" style={{ display: "block", marginTop: "16px", fontSize: "14px", fontWeight: 600, color: "var(--blue)" }}>{hi ? "गोपनीयता और सामान्य प्रश्न" : "Privacy & frequently asked questions"}</span>
                <h1 style={{ fontSize: "36px", marginTop: "8px", marginBottom: "12px", lineHeight: 1.2 }}>{hi ? "जानें कि EasyApply कैसे काम करता है।" : "Know exactly how EasyApply works."}</h1>
                <p style={{ fontSize: "16px", color: "var(--text-secondary)", maxWidth: "540px" }}>{hi ? "आपके दस्तावेज़ आपके डिवाइस पर रहते हैं और हर आउटपुट सेटिंग आपके नियंत्रण में रहती है।" : "Your documents stay on your device, and every output setting remains under your control."}</p>
              </div>
              <div className="privacy-faq-grid">
                <section style={{ backgroundColor: "var(--blue-soft)", padding: "24px", borderRadius: "16px", border: "1px solid var(--blue-soft)" }}>
                  <h2 style={{ fontSize: "20px", marginBottom: "20px", color: "var(--blue)" }}>{hi ? "सरल भाषा में गोपनीयता" : "Privacy, in plain language"}</h2>
                  <div className="privacy-faq-cards">
                    {privacy.map(([Icon, title, text]) => {
                      const ItemIcon = Icon as typeof HardDrive;
                      return (
                        <article key={title as string} style={{ backgroundColor: "var(--surface)", border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                          <ItemIcon size={20} style={{ color: "var(--blue)" }} />
                          <div>
                            <b style={{ display: "block", marginBottom: "4px" }}>{title as string}</b>
                            <p style={{ fontSize: "13px", color: "var(--muted)", margin: 0 }}>{text as string}</p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  <div className="panel-local-note" style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "16px", padding: "16px", backgroundColor: "var(--surface)", color: "var(--blue)", borderRadius: "12px", fontSize: "13px", border: "1px solid var(--blue-soft)" }}>
                    <Lock size={17} />
                    <span><b>{hi ? "कोई अपलोड नहीं।" : "No upload step."}</b> {hi ? "फ़ाइलें इस डिवाइस से बाहर नहीं जातीं।" : "Your files never leave this device."}</span>
                  </div>
                </section>
                <section style={{ backgroundColor: "var(--green-soft)", padding: "24px", borderRadius: "16px", border: "1px solid var(--green-soft)" }}>
                  <h2 style={{ fontSize: "20px", marginBottom: "20px", color: "var(--green)" }}>{hi ? "सामान्य प्रश्न" : "Common questions"}</h2>
                  <div className="privacy-faq-cards faq-cards">
                    {faqs.map(([question, answer]) => (
                      <article key={question} style={{ backgroundColor: "var(--surface)", border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                        <FileCheck2 size={19} style={{ color: "var(--green)" }} />
                        <div>
                          <b style={{ display: "block", marginBottom: "4px" }}>{question}</b>
                          <p style={{ fontSize: "13px", color: "var(--muted)", margin: 0 }}>{answer}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          );
        })() : (
          <div className="full-tool-workspace">
            <section className="tool-canvas-column">
            <div className="panel-heading"><div><span className="tool-icon small"><ToolIcon size={18} /></span><span><h1>{displayTitle}</h1><small>{displayDescription}</small></span></div><span className="local-badge"><Lock size={13} /> {hi ? "कभी अपलोड नहीं" : "Never uploaded"}</span></div>
            <div className={`large-drop-zone ${dragging ? "dragging" : ""} ${files.length ? "has-file" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }} onClick={() => !files.length && inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }}>
              <input ref={inputRef} type="file" accept={details.accept} multiple hidden onChange={(event: ChangeEvent<HTMLInputElement>) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
              {!files.length ? <><span className="large-upload-icon"><UploadCloud size={30} /></span><h2>{hi ? "फ़ाइलें यहाँ छोड़ें" : "Drop files here"}</h2><p>{hi ? "अपने डिवाइस से फ़ाइल चुनें या क्लिपबोर्ड से इमेज पेस्ट करें।" : "Choose files from your device or paste an image from the clipboard."}</p><button className="button button-primary" onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}><Plus size={17} /> {hi ? "फ़ाइलें चुनें" : "Select files"}</button><small>{kind === "pdf" ? "PDF, PNG or JPEG" : "PNG, JPEG, WebP or HEIC"}</small></> : <div className="document-preview-wrap" onClick={(event) => event.stopPropagation()}>
                <div className={`document-preview ${cropOpen ? "crop-active" : ""} ${cropDragging ? "crop-dragging" : ""}`} onClick={() => { if (kind !== "pdf" && !cropOpen) setCropOpen(true); }} title={kind !== "pdf" ? cropOpen ? "Drag the crop box. Pull its handles to resize." : "Click the image to crop." : undefined}>
                  {original.file.type.startsWith("image/") ? <div className="crop-image-stage"><img draggable={false} src={!cropOpen && output?.url && format !== "pdf" ? output.url : original.url} alt="Selected document preview" style={{ transform: cropOpen ? "none" : `rotate(${rotation}deg)`, filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)` }} />{cropOpen && <div className="crop-frame" style={{ left: `${cropRect.x}%`, top: `${cropRect.y}%`, width: `${cropRect.width}%`, height: `${cropRect.height}%` }} onPointerDown={beginCropDrag} onPointerMove={moveCrop} onPointerUp={endCropDrag} onPointerCancel={endCropDrag}><i className="crop-grid vertical grid-one" /><i className="crop-grid vertical grid-two" /><i className="crop-grid horizontal grid-one" /><i className="crop-grid horizontal grid-two" />{cropHandles.map((handle) => <span key={handle} className={`crop-handle handle-${handle}`} data-crop-handle={handle} />)}</div>}</div> : <div className="pdf-preview-large"><Files size={54} /><b>{files.length} PDF {files.length === 1 ? "file" : "files"}</b><span>Ready for {pdfAction}</span></div>}
                  {processing && <div className="processing-overlay"><span className="processing-line" /><p>Preparing on this device…</p></div>}
                </div>
                <div className="selected-files">
                  {files.slice(0, 5).map((item, index) => <div key={`${item.file.name}-${index}`}><span className="file-kind">{item.file.type === "application/pdf" ? <Files size={18} /> : <ImageIcon size={18} />}</span><p><b>{item.file.name}</b><small>{formatBytes(item.file.size)}{item.width ? ` · ${item.width} × ${item.height}` : ""}</small></p><button onClick={() => removeFile(index)} aria-label={`Remove ${item.file.name}`}><Trash2 size={16} /></button></div>)}
                  <button className="add-another" onClick={() => inputRef.current?.click()}><Plus size={16} /> {hi ? "और फ़ाइल जोड़ें" : "Add another file"}</button>
                </div>
              </div>}
            </div>

            <div className="privacy-inline"><ShieldCheck size={21} /><div><b>Your files never leave this device.</b><p>Each tool keeps its own work in this browser until you remove it. EasyApply never uploads or tracks your documents.</p></div></div>
          </section>

          <aside className="tool-controls-column">
            {kind === "pdf" ? <>
              <div className="control-section"><label htmlFor="pdf-action">{hi ? "आप क्या करना चाहते हैं?" : "What would you like to do?"}</label><div className="select-wrap"><select id="pdf-action" value={pdfAction} onChange={(event) => setPdfAction(event.target.value)}><option value="merge">{hi ? "PDF मर्ज करें" : "Merge PDFs"}</option><option value="split">{hi ? "PDF को पेज में बाँटें" : "Split PDF into pages"}</option><option value="rotate">{hi ? "सभी पेज 90° घुमाएँ" : "Rotate all pages 90°"}</option><option value="image-to-pdf">{hi ? "इमेज को PDF बनाएँ" : "Convert images to PDF"}</option></select><ChevronDown size={17} /></div></div>
              <div className="pdf-action-summary">{pdfAction === "merge" ? <Merge size={22} /> : pdfAction === "split" ? <Scissors size={22} /> : pdfAction === "rotate" ? <RotateCw size={22} /> : <FileImage size={22} />}<div><b>{pdfAction === "merge" ? "Combine in upload order" : pdfAction === "split" ? "One file per page" : pdfAction === "rotate" ? "Rotate every page" : "One image per page"}</b><p>{pdfAction === "merge" ? "Add two or more PDFs, arrange them in the file list, then merge." : pdfAction === "split" ? "The first PDF will be separated into individual downloadable files." : pdfAction === "rotate" ? "All pages from your selected PDFs will be rotated clockwise." : "PNG and JPEG images will become pages in a single PDF."}</p></div></div>
            </> : <>
              <div className={`control-section crop-control-section crop-menu-section ${cropOpen ? "open" : ""}`}><button className="crop-menu-button" onClick={() => setCropOpen((value) => !value)} disabled={!files.length}><span><Crop size={18} /><span><b>{hi ? cropOpen ? "क्रॉप चयन सक्रिय है" : "इमेज क्रॉप करें" : cropOpen ? "Crop selection is active" : "Crop image"}</b><small>{hi ? files.length ? cropOpen ? "बॉक्स खींचें और हैंडल से आकार बदलें" : "इमेज पर क्लिक भी कर सकते हैं" : "शुरू करने के लिए इमेज अपलोड करें" : files.length ? cropOpen ? "Move the box and pull its handles to resize" : "You can also click the image" : "Upload an image to begin"}</small></span></span><span className={cropOpen ? "toggle on" : "toggle"} aria-hidden="true"><span /></span></button>{cropOpen && <div className="crop-menu-controls"><label htmlFor="crop-aspect">{hi ? "क्रॉप का आकार" : "Crop shape"}</label><div className="select-wrap"><select id="crop-aspect" value={cropAspect} onChange={(event) => changeCropAspect(event.target.value)}><option value="free">{hi ? "मुक्त चयन — कोई भी आकार" : "Free selection — any shape"}</option><option value="signature">{hi ? "चौड़ा हस्ताक्षर" : "Wide signature"} · 4:1</option><option value="1:1">{hi ? "वर्ग फोटो" : "Square photo"} · 1:1</option><option value="3:4">{hi ? "लंबा फोटो" : "Tall photo"} · 3:4</option><option value="4:5">{hi ? "आवेदन फोटो" : "Application photo"} · 4:5</option><option value="passport">{hi ? "पासपोर्ट फोटो" : "Passport photo"} · 35:45</option><option value="custom">{hi ? "कस्टम आकार" : "Custom shape"}</option></select><ChevronDown size={17} /></div>{cropAspect === "custom" && <div className="custom-ratio-inputs"><label><span>{hi ? "चौड़ाई अनुपात" : "Width ratio"}</span><input type="number" min="1" max="100" value={customRatioWidth} onChange={(event) => updateCustomRatio(Number(event.target.value), customRatioHeight)} /></label><b>:</b><label><span>{hi ? "ऊँचाई अनुपात" : "Height ratio"}</span><input type="number" min="1" max="100" value={customRatioHeight} onChange={(event) => updateCustomRatio(customRatioWidth, Number(event.target.value))} /></label></div>}<p className="crop-instructions">{hi ? "नीले बॉक्स के अंदर खींचकर चयन को ले जाएँ। किनारों और कोनों के हैंडल खींचकर क्रॉप क्षेत्र बदलें।" : "Drag inside the blue box to move it. Pull the edge and corner handles to select exactly what you need."}</p><button className="reset-crop-button" onClick={() => { const next = { x: 0, y: 0, width: 100, height: 100 }; setCropAspect("free"); setCropRect(next); syncOutputRatio(getCropRatio(next)); }}><Crop size={15} /> {hi ? "पूरी इमेज चुनें" : "Select full image"}</button></div>}</div>

              <div className="control-section"><label htmlFor="resolution">{hi ? "आउटपुट आकार" : "Output size"}</label><div className="select-wrap"><select id="resolution" value={resolutionValue} onChange={(event) => changeResolution(event.target.value)}>{resolutionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="custom">{hi ? "कस्टम आउटपुट आकार" : "Custom output size"}</option></select><ChevronDown size={17} /></div>
                {resolutionValue === "custom" && <div className="custom-dimensions"><label><span>{hi ? "चौड़ाई" : "Width"}</span><div><input type="number" min="1" max="5000" value={width} onChange={(event) => changeWidth(Number(event.target.value))} /><small>px</small></div></label><label><span>{hi ? "ऊँचाई" : "Height"}</span><div><input type="number" min="1" max="5000" value={height} onChange={(event) => changeHeight(Number(event.target.value))} /><small>px</small></div></label></div>}<p className="control-help">{hi ? "आउटपुट का आकार हमेशा आपके क्रॉप चयन के अनुपात से मेल खाता है। एक मान बदलने पर दूसरा अपने आप बदलता है।" : "Output dimensions always follow the crop selection. Changing one value updates the other automatically."}</p>
              </div>

              <div className="control-grid-two">
                <div className="control-section"><label htmlFor="format">{hi ? "आउटपुट फ़ॉर्मेट" : "Output format"}</label><div className="select-wrap"><select id="format" value={format} onChange={(event) => setFormat(event.target.value as ImageFormat)}><option value="jpeg">JPEG {hi ? "इमेज" : "image"}</option><option value="png">PNG {hi ? "इमेज" : "image"}</option><option value="webp">WebP {hi ? "इमेज" : "image"}</option><option value="pdf">PDF {hi ? "दस्तावेज़" : "document"}</option></select><ChevronDown size={17} /></div></div>
                <div className="control-section"><label htmlFor="background">{hi ? "बैकग्राउंड" : "Background"}</label><div className="select-wrap"><select id="background" value={background} onChange={(event) => setBackground(event.target.value)}><option value="original">{hi ? "मूल रखें" : "Keep original"}</option><option value="white">{hi ? "सफेद" : "White"}</option><option value="transparent">{hi ? "पारदर्शी" : "Transparent"}</option><option value="custom">{hi ? "कस्टम रंग" : "Custom colour"}</option></select><ChevronDown size={17} /></div>{background === "custom" && <div className="colour-input"><input type="color" value={customColor} onChange={(event) => setCustomColor(event.target.value)} /><span>{customColor.toUpperCase()}</span></div>}</div>
              </div>

              <div className="control-section"><label htmlFor="target-size">{hi ? "लक्ष्य फ़ाइल आकार" : "Target file size"}</label><div className="select-wrap"><select id="target-size" value={targetOptions.some(([value]) => value === targetKb) ? String(targetKb) : "custom"} onChange={(event) => { if (event.target.value === "custom") setTargetKb(0); else { const next = Number(event.target.value); setTargetKb(next); setCustomTarget(next); } }}>{targetOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="custom">{hi ? "कस्टम लक्ष्य" : "Custom target"}</option></select><ChevronDown size={17} /></div>{targetKb === 0 && <label className="custom-target"><span>{hi ? "कस्टम आकार" : "Custom size"}</span><div><input type="number" min="1" max="10000" value={customTarget} onChange={(event) => setCustomTarget(Number(event.target.value))} /><small>KB</small></div></label>}<p className="control-help">{hi ? "EasyApply चुने गए फ़ॉर्मेट में लक्ष्य सीमा के जितना संभव हो उतना करीब पहुँचेगा।" : "EasyApply will get as close as the selected format allows without exceeding the target where possible."}</p></div>

              <details className="advanced-controls"><summary><span><SlidersHorizontal size={17} /> {hi ? "इमेज एडजस्टमेंट" : "Image adjustments"}</span><ChevronDown size={17} /></summary><div>{(hi ? [["ब्राइटनेस", brightness, setBrightness], ["कॉन्ट्रास्ट", contrast, setContrast], ["सैचुरेशन", saturation, setSaturation], ["क्वालिटी", quality, setQuality]] : [["Brightness", brightness, setBrightness], ["Contrast", contrast, setContrast], ["Saturation", saturation, setSaturation], ["Quality", quality, setQuality]]).map(([label, value, setter]) => <label className="range-control" key={label as string}><span>{label as string}<b>{value as number}%</b></span><input type="range" min={String(label).includes("Quality") || String(label).includes("क्वालिटी") ? 10 : 0} max={String(label).includes("Quality") || String(label).includes("क्वालिटी") ? 100 : 200} value={value as number} onChange={(event) => (setter as (value: number) => void)(Number(event.target.value))} /></label>)}<button className="secondary-action" onClick={() => setRotation((value) => (value + 90) % 360)}><RotateCw size={16} /> {hi ? "90° घुमाएँ" : "Rotate 90°"}</button></div></details>
            </>}

            <div className="requirement-summary"><div className="requirement-summary-title"><span><CheckCircle2 size={19} /> {hi ? "आउटपुट सारांश" : "Output summary"}</span><small>{output ? hi ? "तैयार" : "Prepared" : hi ? "डाउनलोड से पहले" : "Before download"}</small></div>{kind !== "pdf" && <><div><span>{hi ? "आयाम" : "Dimensions"}</span><b>{width} × {height} px</b></div><div><span>{hi ? "फ़ॉर्मेट" : "Format"}</span><b>{format.toUpperCase()}</b></div><div><span>{hi ? "लक्ष्य आकार" : "Target size"}</span><b>{outputTarget >= 1024 ? `${outputTarget / 1024} MB` : `${outputTarget} KB`}</b></div><div><span>{hi ? "बैकग्राउंड" : "Background"}</span><b>{background === "custom" ? customColor.toUpperCase() : background[0].toUpperCase() + background.slice(1)}</b></div></>}<div><span>{hi ? "आउटपुट फ़ाइल आकार" : "Output file size"}</span><b>{output ? formatBytes(output.blob.size) : hi ? "तैयारी के बाद गणना होगी" : "Calculated after preparation"}</b></div></div>

            <button className="button button-primary primary-process" onClick={process} disabled={!files.length || processing}>{processing ? <><span className="button-loader" /> {hi ? "तैयार हो रहा है…" : "Preparing…"}</> : <><WandSparkles size={18} /> {hi ? files.length > 1 ? `${files.length} फ़ाइलें तैयार करें` : "फ़ाइल तैयार करें" : `Prepare ${files.length > 1 ? `${files.length} files` : "file"}`}</>}</button>
            {prepared.length > 0 && <button className="button button-success primary-process" onClick={downloadAll}><Download size={18} /> {hi ? prepared.length > 1 ? "ZIP डाउनलोड करें" : "तैयार फ़ाइल डाउनलोड करें" : prepared.length > 1 ? "Download ZIP" : "Download prepared file"}</button>}
            {message && <p className={prepared.length ? "tool-message success" : "tool-message"}>{prepared.length ? <CheckCircle2 size={16} /> : <Info size={16} />}{message}</p>}
          </aside>
        </div>
        )}
      </motion.main>
    </motion.div>
  );
}
