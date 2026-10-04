"use client";

import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState, DragEvent as ReactDragEvent } from "react";
import { getPdfPageCount, renderPageToDataUrl } from "../lib/pdfjs";

export type PickerFile = { id: string; name: string; file: File };
export type PickedPage = { fileId: string; pageIndex: number; selected: boolean };

const MAX_THUMBNAILS = 80;

export function PdfPagePicker({ files, onChange, hi }: { files: PickerFile[]; onChange: (pages: PickedPage[]) => void; hi?: boolean }) {
  const [pages, setPages] = useState<PickedPage[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const generation = useRef(0);
  const onChangeRef = useRef(onChange);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    const currentGeneration = generation.current + 1;
    generation.current = currentGeneration;
    let cancelled = false;
    // Pages stream in via setPages after each await, so a re-scan naturally
    // replaces the previous list without a synchronous reset.
    const run = async () => {
      const nextPages: PickedPage[] = [];
      for (const file of files) {
        try {
          const buffer = await file.file.arrayBuffer();
          const count = await getPdfPageCount(buffer);
          for (let index = 0; index < count; index += 1) {
            if (cancelled || currentGeneration !== generation.current) return;
            nextPages.push({ fileId: file.id, pageIndex: index, selected: true });
            setPages([...nextPages]);
            if (nextPages.length <= MAX_THUMBNAILS) {
              try {
                const thumb = await renderPageToDataUrl(buffer, index, 150);
                if (cancelled || currentGeneration !== generation.current) return;
                setThumbs((current) => ({ ...current, [`${file.id}:${index}`]: thumb.dataUrl }));
              } catch { /* The page chip falls back to a file icon. */ }
            }
          }
        } catch { /* Skip files pdf.js cannot open; processing surfaces the error. */ }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [files]);

  useEffect(() => { onChangeRef.current(pages); }, [pages]);

  const move = (from: number, to: number) => setPages((current) => {
    if (from === to || to < 0 || to >= current.length) return current;
    const next = [...current];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  });

  const toggle = (index: number) => setPages((current) => current.map((page, i) => (i === index ? { ...page, selected: !page.selected } : page)));

  const onDrop = (event: ReactDragEvent<HTMLDivElement>, to: number) => {
    event.preventDefault();
    const from = dragFrom;
    setDragFrom(null);
    if (from !== null) move(from, to);
  };

  const visiblePages = pages.filter((page) => files.some((file) => file.id === page.fileId));
  const selectedCount = visiblePages.filter((page) => page.selected).length;
  const scanning = !visiblePages.length && files.length > 0;

  return (
    <div className="pdf-picker" aria-label={hi ? "पेज चयन" : "Page selection"}>
      <div className="pdf-picker-status">
        <b>{hi ? `${visiblePages.length} पेज` : `${visiblePages.length} ${visiblePages.length === 1 ? "page" : "pages"}`}</b>
        <span>{scanning ? (hi ? "थंबनेल बन रहे हैं…" : "Rendering previews…") : hi ? `${selectedCount} चयनित` : `${selectedCount} selected`}</span>
        <small>{hi ? "पेज को खींचकर क्रम बदलें" : "Drag pages to reorder"}</small>
      </div>
      <div className="pdf-picker-grid">
        {visiblePages.map((page, index) => {
          const key = `${page.fileId}:${page.pageIndex}`;
          const file = files.find((item) => item.id === page.fileId);
          return (
            <div
              key={key}
              className={`pdf-page-chip ${page.selected ? "selected" : ""} ${dragFrom === index ? "dragging" : ""}`}
              draggable
              onDragStart={() => setDragFrom(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDrop(event, index)}
              onDragEnd={() => setDragFrom(null)}
            >
              <span className="pdf-page-order">{index + 1}</span>
              {thumbs[key] ? (
                /* eslint-disable-next-line @next/next/no-img-element -- pdf.js renders this thumbnail locally */
                <img src={thumbs[key]} alt={hi ? `पेज ${page.pageIndex + 1}` : `Page ${page.pageIndex + 1}`} draggable={false} />
              ) : <div className="pdf-page-placeholder"><GripVertical size={14} /></div>}
              <label className="pdf-page-meta">
                <input type="checkbox" checked={page.selected} onChange={() => toggle(index)} aria-label={(file?.name ?? "PDF") + (hi ? ` पेज ${page.pageIndex + 1}` : ` page ${page.pageIndex + 1}`)} />
                <span>{file?.name.replace(/\.pdf$/i, "") ?? "PDF"} · p{page.pageIndex + 1}</span>
              </label>
              <span className="pdf-page-move">
                <button onClick={() => move(index, index - 1)} disabled={index === 0} aria-label={hi ? "ऊपर खिसकाएँ" : "Move earlier"}>↑</button>
                <button onClick={() => move(index, index + 1)} disabled={index === visiblePages.length - 1} aria-label={hi ? "नीचे खिसकाएँ" : "Move later"}>↓</button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
