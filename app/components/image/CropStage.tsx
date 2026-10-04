"use client";

import { PointerEvent as ReactPointerEvent, ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { clamp, type Rect } from "../../lib/geometry";
import { CAPTION_RATIO, context2d, releaseCanvas, renderImage, workingSize, type Look, type Source } from "../../lib/image/render";
import type { ImageEdits } from "../../lib/image/settings";

type Handle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
const CORNERS: Handle[] = ["nw", "ne", "se", "sw"];
const ALL_HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const MIN_SIZE = 0.03;

const handlePosition: Record<Handle, { left: string; top: string; cursor: string }> = {
  nw: { left: "0%", top: "0%", cursor: "nwse-resize" },
  n: { left: "50%", top: "0%", cursor: "ns-resize" },
  ne: { left: "100%", top: "0%", cursor: "nesw-resize" },
  e: { left: "100%", top: "50%", cursor: "ew-resize" },
  se: { left: "100%", top: "100%", cursor: "nwse-resize" },
  s: { left: "50%", top: "100%", cursor: "ns-resize" },
  sw: { left: "0%", top: "100%", cursor: "nesw-resize" },
  w: { left: "0%", top: "50%", cursor: "ew-resize" },
};

/** Applies a pointer delta (normalised units) to a crop rectangle. */
function resizeCrop(start: Rect, handle: Handle, dx: number, dy: number, aspect: number | null): Rect {
  const right = start.x + start.w;
  const bottom = start.y + start.h;
  if (!aspect) {
    const next = { ...start };
    if (handle.includes("w")) { next.x = clamp(start.x + dx, 0, right - MIN_SIZE); next.w = right - next.x; }
    if (handle.includes("e")) next.w = clamp(start.w + dx, MIN_SIZE, 1 - start.x);
    if (handle.includes("n")) { next.y = clamp(start.y + dy, 0, bottom - MIN_SIZE); next.h = bottom - next.y; }
    if (handle.includes("s")) next.h = clamp(start.h + dy, MIN_SIZE, 1 - start.y);
    return next;
  }
  // Aspect-locked: the opposite corner stays put.
  const west = handle.includes("w");
  const north = handle.includes("n");
  const anchorX = west ? right : start.x;
  const anchorY = north ? bottom : start.y;
  const pointerX = (west ? start.x : right) + dx;
  const pointerY = (north ? start.y : bottom) + dy;
  let width = Math.max(MIN_SIZE, west ? anchorX - pointerX : pointerX - anchorX);
  let height = Math.max(MIN_SIZE, north ? anchorY - pointerY : pointerY - anchorY);
  if (width / height > aspect) height = width / aspect;
  else width = height * aspect;
  const maxWidth = west ? anchorX : 1 - anchorX;
  const maxHeight = north ? anchorY : 1 - anchorY;
  if (width > maxWidth) { width = maxWidth; height = width / aspect; }
  if (height > maxHeight) { height = maxHeight; width = height * aspect; }
  return { x: west ? anchorX - width : anchorX, y: north ? anchorY - height : anchorY, w: width, h: height };
}

export function CropStage({ source, edits, look, background, aspect, onCrop, caption, faceGuide, badge, overlay, label }: {
  source: Source | null;
  edits: ImageEdits;
  look: Look;
  background: string | null;
  /** Pixel aspect ratio of the crop box, or null for free cropping. */
  aspect: number | null;
  onCrop: (crop: Rect) => void;
  caption: { name: string; date: string } | null;
  faceGuide: boolean;
  badge: ReactNode;
  overlay: ReactNode;
  label: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const drag = useRef<{ handle: Handle | null; startX: number; startY: number; start: Rect; width: number; height: number } | null>(null);

  const working = source ? workingSize(source, edits) : { width: 1, height: 1 };
  const normalizedAspect = aspect ? (aspect * working.height) / working.width : null;

  // Fit the working image inside the stage.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const style = getComputedStyle(stage);
      const availableWidth = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const availableHeight = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const scale = Math.min(availableWidth / working.width, availableHeight / working.height);
      setBox({ width: Math.max(1, Math.floor(working.width * scale)), height: Math.max(1, Math.floor(working.height * scale)) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [working.width, working.height]);

  // Draw the edited image (everything except the crop) at screen resolution.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source || !box.width) return;
    const frame = requestAnimationFrame(() => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const rendered = renderImage({
        source,
        edits,
        region: { x: 0, y: 0, w: working.width, h: working.height },
        width: box.width * ratio,
        height: box.height * ratio,
        look,
        background,
        opaque: false,
      });
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      const context = context2d(canvas);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(rendered, 0, 0);
      releaseCanvas(rendered);
    });
    return () => cancelAnimationFrame(frame);
    // `edits` minus the crop: the crop is only an overlay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, edits.rotate, edits.flip, edits.straighten, look, background, box.width, box.height, working.width, working.height]);

  const begin = (event: ReactPointerEvent<HTMLElement>, handle: Handle | null) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { handle, startX: event.clientX, startY: event.clientY, start: edits.crop, width: box.width, height: box.height };
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state) return;
    const dx = (event.clientX - state.startX) / Math.max(1, state.width);
    const dy = (event.clientY - state.startY) / Math.max(1, state.height);
    const start = state.start;
    if (!state.handle) onCrop({ ...start, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) });
    else onCrop(resizeCrop(start, state.handle, dx, dy, normalizedAspect));
  };
  const end = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    drag.current = null;
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const crop = edits.crop;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = moves[event.key];
    if (!delta) return;
    event.preventDefault();
    onCrop({ ...crop, x: clamp(crop.x + delta[0], 0, 1 - crop.w), y: clamp(crop.y + delta[1], 0, 1 - crop.h) });
  };

  const crop = edits.crop;
  const handles = normalizedAspect ? CORNERS : ALL_HANDLES;
  const captionHeight = crop.h * box.height * CAPTION_RATIO;

  return (
    <div className="stage" ref={stageRef}>
      {source && box.width ? (
        <div className="stage-inner checker" style={{ width: box.width, height: box.height }}>
          <canvas ref={canvasRef} aria-hidden="true" />
          <i className="crop-shade" style={{ left: 0, top: 0, width: "100%", height: `${crop.y * 100}%` }} />
          <i className="crop-shade" style={{ left: 0, top: `${(crop.y + crop.h) * 100}%`, width: "100%", bottom: 0 }} />
          <i className="crop-shade" style={{ left: 0, top: `${crop.y * 100}%`, width: `${crop.x * 100}%`, height: `${crop.h * 100}%` }} />
          <i className="crop-shade" style={{ left: `${(crop.x + crop.w) * 100}%`, right: 0, top: `${crop.y * 100}%`, height: `${crop.h * 100}%` }} />
          <div
            className="crop-frame"
            role="group"
            tabIndex={0}
            aria-label={label}
            onKeyDown={onKeyDown}
            style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
            onPointerDown={(event) => begin(event, null)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          >
            <i className="grid-line v" style={{ left: "33.333%" }} />
            <i className="grid-line v" style={{ left: "66.666%" }} />
            <i className="grid-line h" style={{ top: "33.333%" }} />
            <i className="grid-line h" style={{ top: "66.666%" }} />
            {faceGuide ? <span className="head-guide" style={caption ? { height: "52%", top: "7%" } : undefined} /> : null}
            {caption ? (
              <span className="caption-band" style={{ height: captionHeight, fontSize: Math.max(7, captionHeight / (caption.name && caption.date ? 2.6 : 1.7)) }}>
                {caption.name ? <span>{caption.name}</span> : null}
                {caption.date ? <span>{caption.date}</span> : null}
              </span>
            ) : null}
            {handles.map((handle) => (
              <span
                key={handle}
                className={`crop-handle${handle.length === 1 ? " edge" : ""}`}
                data-handle={handle}
                style={{ left: handlePosition[handle].left, top: handlePosition[handle].top, cursor: handlePosition[handle].cursor }}
                onPointerDown={(event) => begin(event, handle)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
              />
            ))}
          </div>
          {badge}
        </div>
      ) : null}
      {overlay}
    </div>
  );
}
