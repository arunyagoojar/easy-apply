"use client";

import { Check, GripVertical, PenLine, Plus, RotateCw, Trash2 } from "lucide-react";
import { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { viewSize } from "../../lib/geometry";
import { pageBox, type ImagePageSize, type PageItem, type SourceDoc } from "../../lib/pdf/model";
import { useT } from "../LanguageProvider";
import { Spinner } from "../ui";

export function thumbKey(page: PageItem, source: SourceDoc | undefined, size: ImagePageSize) {
  return source?.kind === "image" ? `${page.sourceId}:img:${size}` : `${page.sourceId}:${page.pageIndex}`;
}

type DragState = { ids: string[]; x: number; y: number; target: number | null; thumb?: string };

export function PageGrid({ pages, sources, thumbs, selected, imagePageSize, loading, onToggle, onRotate, onDelete, onEdit, onMove, onAdd }: {
  pages: PageItem[];
  sources: Record<string, SourceDoc>;
  thumbs: Record<string, string>;
  selected: Set<string>;
  imagePageSize: ImagePageSize;
  loading: number;
  onToggle: (id: string, range: boolean) => void;
  onRotate: (ids: string[], clockwise: boolean) => void;
  onDelete: (ids: string[]) => void;
  onEdit: (index: number) => void;
  onMove: (ids: string[], insertAt: number) => void;
  onAdd: () => void;
}) {
  const t = useT();
  const [drag, setDrag] = useState<DragState | null>(null);
  const press = useRef<{ id: string; x: number; y: number; pointerId: number; started: boolean } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // The click that follows a drag must not open the editor.
  const suppressClick = useRef(false);
  const latest = useRef({ pages, selected, onMove, onEdit });
  useEffect(() => { latest.current = { pages, selected, onMove, onEdit }; });

  // Drag tracking lives on the window so it keeps working outside the grid.
  useEffect(() => {
    const targetAt = (x: number, y: number) => {
      const card = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-page-index]");
      if (!card) return null;
      const index = Number(card.dataset.pageIndex);
      const rect = card.getBoundingClientRect();
      return x < rect.left + rect.width / 2 ? index : index + 1;
    };
    const onMovePointer = (event: PointerEvent) => {
      const current = press.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (!current.started) {
        if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return;
        current.started = true;
        const { pages: list, selected: chosen } = latest.current;
        const ids = chosen.has(current.id) ? list.filter((page) => chosen.has(page.id)).map((page) => page.id) : [current.id];
        const thumb = (document.querySelector(`[data-page-id="${current.id}"] img`) as HTMLImageElement | null)?.src;
        setDrag({ ids, x: event.clientX, y: event.clientY, target: null, thumb });
      }
      event.preventDefault();
      setDrag((state) => (state ? { ...state, x: event.clientX, y: event.clientY, target: targetAt(event.clientX, event.clientY) } : state));
      // Scroll the page list when dragging near its edges.
      const scroller = gridRef.current?.closest(".pdf-scroll");
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        if (event.clientY < rect.top + 60) scroller.scrollBy(0, -14);
        else if (event.clientY > rect.bottom - 60) scroller.scrollBy(0, 14);
      }
    };
    const onUp = (event: PointerEvent) => {
      const current = press.current;
      if (!current || event.pointerId !== current.pointerId) return;
      press.current = null;
      if (!current.started) return;
      suppressClick.current = true;
      window.setTimeout(() => { suppressClick.current = false; }, 0);
      setDrag((state) => {
        if (state && state.target !== null) latest.current.onMove(state.ids, state.target);
        return null;
      });
    };
    window.addEventListener("pointermove", onMovePointer, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMovePointer);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const startPress = (event: ReactPointerEvent, id: string, fromHandle: boolean) => {
    if (event.button !== 0) return;
    // On touch screens only the grip starts a drag, so swiping still scrolls.
    if (event.pointerType === "touch" && !fromHandle) return;
    if ((event.target as HTMLElement).closest("button") && !fromHandle) return;
    press.current = { id, x: event.clientX, y: event.clientY, pointerId: event.pointerId, started: false };
    if (fromHandle) event.preventDefault();
  };

  const onKeyDown = (event: ReactKeyboardEvent, page: PageItem, index: number) => {
    if (event.target !== event.currentTarget) return;
    if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      onMove([page.id], event.key === "ArrowLeft" ? Math.max(0, index - 1) : Math.min(pages.length, index + 2));
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-page-id="${page.id}"]`)?.focus());
    } else if (event.key === "Enter") {
      event.preventDefault();
      onEdit(index);
    } else if (event.key === " ") {
      event.preventDefault();
      onToggle(page.id, event.shiftKey);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onDelete([page.id]);
    } else if (event.key.toLowerCase() === "r") {
      onRotate([page.id], !event.shiftKey);
    }
  };

  return (
    <div ref={gridRef} className={`page-grid${selected.size ? " has-selection" : ""}`} aria-describedby="pdf-move-hint">
      {pages.map((page, index) => {
        const source = sources[page.sourceId];
        const box = pageBox(page, source, imagePageSize);
        const base = viewSize(box.width, box.height, page.baseRotation);
        const baseAspect = base.width / base.height;
        const turned = page.rotation % 180 !== 0;
        const aspect = turned ? 1 / baseAspect : baseAspect;
        const wide = aspect >= 1 / 1.3;
        const thumb = thumbs[thumbKey(page, source, imagePageSize)];
        const isSelected = selected.has(page.id);
        const dragging = drag?.ids.includes(page.id);
        return (
          <div
            key={page.id}
            className={`page-card${isSelected ? " selected" : ""}${dragging ? " drag-source" : ""}`}
            data-page-index={index}
            data-page-id={page.id}
            tabIndex={0}
            role="group"
            aria-label={t("editor.page", { n: index + 1, total: pages.length })}
            onPointerDown={(event) => startPress(event, page.id, false)}
            onClick={(event) => {
              if (suppressClick.current || (event.target as HTMLElement).closest("button")) return;
              if (event.shiftKey || event.metaKey || event.ctrlKey) onToggle(page.id, event.shiftKey);
              else onEdit(index);
            }}
            onKeyDown={(event) => onKeyDown(event, page, index)}
          >
            {drag?.target === index && !dragging ? <span className="drop-marker" style={{ left: -11 }} /> : null}
            {drag?.target === index + 1 && index === pages.length - 1 && !dragging ? <span className="drop-marker" style={{ right: -11 }} /> : null}
            <button type="button" className="page-check" role="checkbox" aria-checked={isSelected} aria-label={t("pdf.selectPage", { n: index + 1 })} onClick={(event) => { event.stopPropagation(); onToggle(page.id, event.shiftKey); }}>
              <Check size={15} strokeWidth={3} />
            </button>
            <span className="page-tools">
              <button type="button" onClick={(event) => { event.stopPropagation(); onRotate([page.id], true); }} aria-label={t("pdf.rotatePage", { n: index + 1 })} title={t("pdf.rotateRight")}><RotateCw size={15} /></button>
              <button type="button" className="danger" onClick={(event) => { event.stopPropagation(); onDelete([page.id]); }} aria-label={t("pdf.deletePage", { n: index + 1 })} title={t("pdf.delete")}><Trash2 size={15} /></button>
            </span>
            <div className="page-thumb-box">
              <div className="page-thumb" style={{ aspectRatio: `${aspect}`, width: wide ? "100%" : "auto", height: wide ? "auto" : "100%" }}>
                {thumb ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- rendered locally */
                  <img src={thumb} alt="" draggable={false} style={{ position: "absolute", left: "50%", top: "50%", width: turned ? `${100 / aspect}%` : "100%", height: turned ? `${100 * aspect}%` : "100%", transform: `translate(-50%, -50%) rotate(${page.rotation}deg)` }} />
                ) : <Spinner />}
                {page.annotations.length ? <span className="edit-badge"><PenLine size={11} />{page.annotations.length}</span> : null}
              </div>
              <button type="button" className="btn btn-sm page-edit" onClick={(event) => { event.stopPropagation(); onEdit(index); }} aria-label={t("pdf.editPage", { n: index + 1 })}>
                <PenLine size={14} />{t("pdf.edit")}
              </button>
            </div>
            <span className="page-label">
              <span className="file-dot" style={{ background: source?.color }} aria-hidden="true" />
              <b>{index + 1}</b>
              <span className="name" title={source?.name}>{source?.name}</span>
              <span
                className="grip"
                aria-hidden="true"
                style={{ flex: "none", display: "inline-grid", placeItems: "center", touchAction: "none", cursor: "grab", color: "var(--text-3)" }}
                onPointerDown={(event) => startPress(event, page.id, true)}
              >
                <GripVertical size={15} />
              </span>
            </span>
          </div>
        );
      })}
      {Array.from({ length: loading }, (_, index) => (
        <div key={`loading-${index}`} className="page-card"><div className="page-thumb-box"><div className="page-thumb" style={{ aspectRatio: "0.77", height: "100%" }}><Spinner /></div></div></div>
      ))}
      <button type="button" className="page-add" onClick={onAdd}><Plus size={22} />{t("pdf.add")}</button>
      {drag ? (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rendered locally */}
          {drag.thumb ? <img src={drag.thumb} alt="" /> : null}
          {drag.ids.length > 1 ? <span className="chip chip-accent" style={{ position: "absolute", top: 6, right: 6 }}>{drag.ids.length}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
