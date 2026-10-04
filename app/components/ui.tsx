"use client";

import { X } from "lucide-react";
import {
  ChangeEvent,
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { useT } from "./LanguageProvider";

/* --------------------------------------------------------------- Dialog */

export function Dialog({ open, onClose, title, children, footer, wide, closeLabel }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  closeLabel?: string;
}) {
  const t = useT();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") ?? []).filter((element) => !element.hasAttribute("disabled"));
    (panel?.querySelector<HTMLElement>("[data-autofocus]") ?? focusables()[1] ?? focusables()[0])?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onCloseRef.current(); }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={panelRef} className={`dialog${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={closeLabel ?? t("common.close")}><X size={18} /></button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer ? <div className="dialog-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/* --------------------------------------------------------------- Toasts */

type Toast = { id: number; message: string; tone: "info" | "success" | "error" };
const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const push = useCallback((message: string, tone: Toast["tone"] = "info") => {
    counter.current += 1;
    const id = counter.current;
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => dismiss(id), tone === "error" ? 9000 : 5000);
  }, [dismiss]);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`}>
            {toast.tone === "error" ? <CircleAlert size={17} /> : toast.tone === "success" ? <CircleCheck size={17} /> : <Info size={17} />}
            <span>{toast.message}</span>
            <button onClick={() => dismiss(toast.id)} aria-label="Dismiss"><X size={15} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* ------------------------------------------------------------- Controls */

export function Switch({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  return (
    <label className="switch-row" style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}>
      <span><b>{label}</b>{hint ? <small>{hint}</small> : null}</span>
      <button type="button" role="switch" aria-checked={checked} className="switch" disabled={disabled} onClick={() => onChange(!checked)} />
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, size }: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; icon?: ReactNode; disabled?: boolean; title?: string }>;
  label: string;
  size?: "lg";
}) {
  return (
    <div className={`segmented${size ? ` ${size}` : ""}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} disabled={option.disabled} title={option.title} onClick={() => onChange(option.value)}>
          {option.icon}{option.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, format = (v) => String(v) }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void; format?: (value: number) => string;
}) {
  return (
    <label className="slider-row">
      <header><span>{label}</span><output>{format(value)}</output></header>
      <input className="slider" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function formatNumber(value: number | null, decimals: number) {
  if (value === null || !Number.isFinite(value)) return "";
  return decimals ? String(Number(value.toFixed(decimals))) : String(Math.round(value));
}

/**
 * Number input that tolerates intermediate states (empty, "1.") while typing
 * and only reports valid values. Invalid text snaps back on blur.
 */
export function NumberField({ value, onChange, min = 0, max = 100000, decimals = 0, allowEmpty, placeholder, ariaLabel, id, className = "input" }: {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  decimals?: number;
  allowEmpty?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  className?: string;
}) {
  const [text, setText] = useState(formatNumber(value, decimals));
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    const parsed = text.trim() === "" ? null : Number(text);
    if (parsed !== value) setText(formatNumber(value, decimals));
  }
  const commit = (raw: string) => {
    setText(raw);
    const trimmed = raw.trim();
    if (trimmed === "") { if (allowEmpty) onChange(null); return; }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) return;
    onChange(decimals ? Number(parsed.toFixed(decimals)) : Math.round(parsed));
  };
  return (
    <input
      id={id}
      className={className}
      type="text"
      inputMode={decimals ? "decimal" : "numeric"}
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event: ChangeEvent<HTMLInputElement>) => commit(event.target.value.replace(",", "."))}
      onBlur={() => setText(formatNumber(value, decimals))}
      onKeyDown={(event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const step = decimals ? 10 ** -Math.min(decimals, 1) : 1;
        const next = Math.min(max, Math.max(min, (value ?? 0) + (event.key === "ArrowUp" ? step : -step) * (event.shiftKey ? 10 : 1)));
        onChange(decimals ? Number(next.toFixed(decimals)) : Math.round(next));
      }}
    />
  );
}

/* ---------------------------------------------------------- File input */

export function useFilePicker(accept: string, onFiles: (files: File[]) => void, multiple = true) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onFilesRef = useRef(onFiles);
  useEffect(() => { onFilesRef.current = onFiles; }, [onFiles]);
  const open = useCallback(() => inputRef.current?.click(), []);
  const input = useMemo(() => (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      multiple={multiple}
      hidden
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        if (files.length) onFilesRef.current(files);
      }}
    />
  ), [accept, multiple]);
  return { open, input };
}

/** Accepts files dropped anywhere on the window and shows an overlay while dragging. */
export function useWindowDrop(onFiles: (files: File[]) => void, enabled = true) {
  const [dragging, setDragging] = useState(false);
  const onFilesRef = useRef(onFiles);
  useEffect(() => { onFilesRef.current = onFiles; }, [onFiles]);
  useEffect(() => {
    if (!enabled) return;
    let depth = 0;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (event: DragEvent) => { if (!hasFiles(event)) return; event.preventDefault(); depth += 1; setDragging(true); };
    const onOver = (event: DragEvent) => { if (!hasFiles(event)) return; event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"; };
    const onLeave = (event: DragEvent) => { if (!hasFiles(event)) return; depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length) onFilesRef.current(files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [enabled]);
  return dragging;
}

/** Adds images pasted from the clipboard (Ctrl/Cmd+V). */
export function usePasteFiles(onFiles: (files: File[]) => void, enabled = true) {
  const onFilesRef = useRef(onFiles);
  useEffect(() => { onFilesRef.current = onFiles; }, [onFiles]);
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length) { event.preventDefault(); onFilesRef.current(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [enabled]);
}

/** Warns before leaving the page while there is unsaved work. */
export function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}

export function Spinner({ large }: { large?: boolean }) {
  return <span className={`spinner${large ? " lg" : ""}`} aria-hidden="true" />;
}

/* ---------------------------------------------------------------- Menu */

/** A small popover menu that opens above or below its trigger. */
export function Menu({ label, icon, items, placement = "top", buttonClassName = "btn" }: {
  label: string;
  icon: ReactNode;
  items: Array<{ label: ReactNode; hint?: ReactNode; icon?: ReactNode; onSelect: () => void; disabled?: boolean }>;
  placement?: "top" | "bottom";
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button type="button" className={buttonClassName} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{icon}</button>
      {open ? (
        <div role="menu" className="menu-list" style={{ position: "absolute", right: 0, [placement === "top" ? "bottom" : "top"]: "calc(100% + 6px)", zIndex: 50, minWidth: 260, padding: 6, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow-3)" }}>
          {items.map((item, index) => (
            <button key={index} type="button" role="menuitem" className="menu-item" disabled={item.disabled} onClick={() => { setOpen(false); item.onSelect(); }}>
              {item.icon}
              <span style={{ display: "grid" }}><span>{item.label}</span>{item.hint ? <small style={{ marginLeft: 0 }}>{item.hint}</small> : null}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
