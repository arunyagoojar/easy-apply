"use client";

import { Ban, ChevronDown, Image as ImageIcon, Link2, Pipette, Signature, SquareUser, Unlink2 } from "lucide-react";
import { useLanguage } from "../LanguageProvider";
import { NumberField, Segmented, Slider, Switch } from "../ui";
import { fromPixels, toPixels, UNITS, type Unit } from "../../lib/units";
import {
  applyPreset,
  CUSTOM_PRESET,
  presetsFor,
  targetPixels,
  type BackgroundChoice,
  type ImageMode,
  type ImageSettings,
  type OutputFormat,
  type SizeMode,
} from "../../lib/image/settings";

export type CutoutStatus = { state: "idle" } | { state: "working"; progress: number | null } | { state: "ready" } | { state: "error"; message: string };

const DECIMALS: Record<Unit, number> = { px: 0, mm: 1, cm: 2, in: 2 };

function DimsEditor({ settings, onChange, lock, cropAspect }: {
  settings: ImageSettings;
  onChange: (patch: Partial<ImageSettings>) => void;
  /** Shows the "keep proportions" toggle (Any image mode). */
  lock?: boolean;
  cropAspect: number;
}) {
  const { t } = useLanguage();
  const { unit, dpi } = settings;
  const decimals = DECIMALS[unit];
  const locked = lock && settings.lockAspect;
  const shownHeight = locked ? fromPixels(Math.max(1, Math.round(toPixels(settings.width, unit, dpi) / cropAspect)), unit, dpi) : settings.height;
  const pixels = targetPixels(settings);

  const changeUnit = (next: Unit) => {
    const widthPx = toPixels(settings.width, unit, dpi);
    const heightPx = toPixels(shownHeight, unit, dpi);
    onChange({ unit: next, width: fromPixels(widthPx, next, dpi), height: fromPixels(heightPx, next, dpi) });
  };

  return (
    <div className="field">
      <div className="dims">
        <div className="input-group">
          <NumberField value={settings.width} onChange={(value) => value !== null && onChange({ width: value })} min={decimals ? 0.1 : 1} max={20000} decimals={decimals} ariaLabel={t("image.size.width")} />
        </div>
        <span className="times">×</span>
        <div className="input-group">
          <NumberField
            value={shownHeight}
            onChange={(value) => {
              if (value === null) return;
              if (locked) onChange({ width: fromPixels(Math.max(1, Math.round(toPixels(value, unit, dpi) * cropAspect)), unit, dpi) });
              else onChange({ height: value });
            }}
            min={decimals ? 0.1 : 1}
            max={20000}
            decimals={decimals}
            ariaLabel={t("image.size.height")}
          />
        </div>
        <div className="input-group" style={{ width: 66 }}>
          <select className="suffix" style={{ width: "100%", borderLeft: 0 }} value={unit} onChange={(event) => changeUnit(event.target.value as Unit)} aria-label="Unit">
            {UNITS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </div>
      {lock ? (
        <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: "start", paddingLeft: 4 }} aria-pressed={settings.lockAspect} onClick={() => onChange({ lockAspect: !settings.lockAspect })}>
          {settings.lockAspect ? <Link2 size={15} /> : <Unlink2 size={15} />}{t("image.size.lock")}: {settings.lockAspect ? "✓" : "—"}
        </button>
      ) : null}
      {unit !== "px" ? (
        <div className="row">
          <label className="label" htmlFor="dpi" style={{ fontWeight: 500, color: "var(--text-2)" }}>{t("image.size.dpi")}</label>
          <div className="input-group" style={{ width: 92 }}>
            <NumberField id="dpi" value={dpi} onChange={(value) => value !== null && onChange({ dpi: value })} min={10} max={2400} ariaLabel={t("image.size.dpi")} />
          </div>
          <span className="hint">{t("image.size.pixels", { w: pixels.width, h: locked ? Math.round(pixels.width / cropAspect) : pixels.height, dpi })}</span>
        </div>
      ) : null}
    </div>
  );
}

export function ImagePanel({ mode, onMode, settings, onChange, itemCount, cropAspect, cutout }: {
  mode: ImageMode;
  onMode: (mode: ImageMode) => void;
  settings: ImageSettings;
  onChange: (patch: Partial<ImageSettings>) => void;
  itemCount: number;
  /** Pixel aspect of the active image's crop (for linked dimensions). */
  cropAspect: number;
  cutout: CutoutStatus;
}) {
  const { t, language } = useLanguage();
  const presets = presetsFor(mode);

  const choosePreset = (id: string) => {
    if (id === CUSTOM_PRESET) {
      // Start the custom size from what the user had, keeping it editable.
      onChange({ preset: CUSTOM_PRESET, sizeMode: "exact" });
      return;
    }
    const preset = presets.find((item) => item.id === id);
    if (preset) onChange(applyPreset(settings, preset));
  };
  const editSize = (patch: Partial<ImageSettings>) => onChange({ ...patch, preset: CUSTOM_PRESET, sizeMode: "exact" });

  const formats: Array<{ value: OutputFormat; label: string }> = mode === "any"
    ? [
      { value: "original", label: t("image.format.original") },
      { value: "jpeg", label: "JPG" },
      { value: "png", label: "PNG" },
      { value: "webp", label: "WebP" },
      { value: "pdf", label: "PDF" },
    ]
    : [{ value: "jpeg", label: "JPG" }, { value: "png", label: "PNG" }, { value: "pdf", label: "PDF" }];
  const effectiveFormat: OutputFormat = mode === "signature" && settings.transparent && settings.format === "jpeg" ? "png" : settings.format;
  const lossy = effectiveFormat === "jpeg" || effectiveFormat === "webp" || effectiveFormat === "original" || effectiveFormat === "pdf";

  const backgrounds: Array<{ value: BackgroundChoice; label: string; color?: string }> = [
    { value: "keep", label: t("image.bg.keep") },
    { value: "white", label: t("image.bg.white"), color: "#ffffff" },
    { value: "blue", label: t("image.bg.blue"), color: "#dbe8ff" },
    { value: "gray", label: t("image.bg.gray"), color: "#e6e7ea" },
  ];

  return (
    <>
      <div className="side-section">
        <h3>{t("image.mode.label")}</h3>
        <Segmented
          label={t("image.mode.label")}
          value={mode}
          onChange={onMode}
          options={[
            { value: "photo", label: t("image.mode.photo"), icon: <SquareUser size={16} /> },
            { value: "signature", label: t("image.mode.signature"), icon: <Signature size={16} /> },
            { value: "any", label: t("image.mode.any"), icon: <ImageIcon size={16} /> },
          ]}
        />
      </div>

      <div className="side-section">
        <h3>{t("image.size.title")}</h3>
        {mode === "any" ? (
          <div className="field">
            <select className="select" value={settings.sizeMode} onChange={(event) => onChange({ sizeMode: event.target.value as SizeMode })} aria-label={t("image.size.title")}>
              <option value="original">{t("image.size.keep")}</option>
              <option value="exact">{t("image.size.exact")}</option>
              <option value="fit">{t("image.size.fit")}</option>
              <option value="scale">{t("image.size.scale")}</option>
            </select>
            {settings.sizeMode === "exact" ? <DimsEditor settings={settings} onChange={onChange} lock cropAspect={cropAspect} /> : null}
            {settings.sizeMode === "fit" ? <DimsEditor settings={{ ...settings, unit: "px" }} onChange={(patch) => onChange({ ...patch, unit: "px" })} cropAspect={cropAspect} /> : null}
            {settings.sizeMode === "scale" ? <Slider label={t("image.size.scale")} value={settings.scale} min={5} max={100} onChange={(value) => onChange({ scale: value })} format={(value) => `${value}%`} /> : null}
          </div>
        ) : (
          <div className="field">
            <select className="select" value={presets.some((item) => item.id === settings.preset) ? settings.preset : CUSTOM_PRESET} onChange={(event) => choosePreset(event.target.value)} aria-label={t("image.size.title")}>
              {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label[language]}</option>)}
              <option value={CUSTOM_PRESET}>{t("image.size.custom")}</option>
            </select>
            {settings.sizeMode === "exact" ? <DimsEditor settings={settings} onChange={editSize} cropAspect={cropAspect} /> : null}
            <p className="hint">{t("image.size.note")}</p>
          </div>
        )}
      </div>

      <div className="side-section">
        <h3>{t("image.kb.title")}</h3>
        <div className="row-2">
          <label className="field">
            <span className="label">{t("image.kb.min")} <small>{t("common.optional")}</small></span>
            <div className="input-group">
              <NumberField value={settings.minKb} allowEmpty onChange={(value) => onChange({ minKb: value })} min={1} max={100000} placeholder="—" ariaLabel={`${t("image.kb.min")} KB`} />
              <span className="suffix">KB</span>
            </div>
          </label>
          <label className="field">
            <span className="label">{t("image.kb.max")} <small>{t("common.optional")}</small></span>
            <div className="input-group">
              <NumberField value={settings.maxKb} allowEmpty onChange={(value) => onChange({ maxKb: value })} min={1} max={100000} placeholder="—" ariaLabel={`${t("image.kb.max")} KB`} />
              <span className="suffix">KB</span>
            </div>
          </label>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>{t("image.kb.hint")}</p>
      </div>

      <div className="side-section">
        <h3>{t("image.format.title")}</h3>
        <div className="field">
          {mode === "any" ? (
            <select className="select" value={settings.format} onChange={(event) => onChange({ format: event.target.value as OutputFormat })} aria-label={t("image.format.title")}>
              {formats.map((format) => <option key={format.value} value={format.value}>{format.label}</option>)}
            </select>
          ) : (
            <Segmented label={t("image.format.title")} value={effectiveFormat} onChange={(value) => onChange({ format: value, ...(value === "jpeg" ? { transparent: false } : {}) })} options={formats} />
          )}
          {mode === "any" && lossy && effectiveFormat !== "pdf" ? (
            settings.maxKb
              ? <p className="hint">{t("image.format.quality")}: {t("image.format.qualityAuto")}</p>
              : <Slider label={t("image.format.quality")} value={settings.quality} min={30} max={100} onChange={(value) => onChange({ quality: value })} format={(value) => `${value}%`} />
          ) : null}
          {mode === "any" && settings.format === "pdf" && itemCount > 1 ? (
            <Switch checked={settings.combinePdf} onChange={(value) => onChange({ combinePdf: value })} label={t("image.format.combine")} />
          ) : null}
        </div>
      </div>

      {mode === "photo" ? (
        <>
          <div className="side-section">
            <h3>{t("image.bg.title")}</h3>
            <div className="swatches" role="group" aria-label={t("image.bg.title")}>
              {backgrounds.map((item) => (
                <button key={item.value} type="button" className="swatch" aria-pressed={settings.background === item.value} title={item.label} aria-label={item.label} onClick={() => onChange({ background: item.value })} style={item.color ? { background: item.color } : undefined}>
                  {item.value === "keep" ? <Ban size={15} /> : null}
                </button>
              ))}
              <span className="swatch" aria-pressed={settings.background === "custom"} title={t("image.bg.custom")} style={settings.background === "custom" ? { background: settings.customColor } : undefined}>
                {settings.background === "custom" ? null : <Pipette size={14} />}
                <input type="color" value={settings.customColor} aria-label={t("image.bg.custom")} onChange={(event) => onChange({ background: "custom", customColor: event.target.value })} onClick={() => { if (settings.background !== "custom") onChange({ background: "custom" }); }} />
              </span>
            </div>
            {settings.background !== "keep" ? (
              cutout.state === "working" ? (
                <div className="note note-accent" style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <span className="row"><span className="spinner" />{cutout.progress !== null && cutout.progress < 1 ? t("image.bg.downloading", { percent: Math.round(cutout.progress * 100) }) : t("image.bg.removing")}</span>
                  {cutout.progress !== null && cutout.progress < 1 ? <div className="progress"><span style={{ width: `${Math.round(cutout.progress * 100)}%` }} /></div> : null}
                </div>
              ) : cutout.state === "error" ? (
                <p className="note note-danger" style={{ marginTop: 10 }}>{t("image.bg.failed", { error: cutout.message })}</p>
              ) : cutout.state === "idle" ? (
                <p className="hint" style={{ marginTop: 10 }}>{t("image.bg.hint")}</p>
              ) : null
            ) : null}
          </div>

          <div className="side-section">
            <Switch checked={settings.caption} onChange={(value) => onChange({ caption: value, ...(value && !settings.captionDate ? { captionDate: today() } : {}) })} label={t("image.caption.title")} hint={t("image.caption.hint")} />
            {settings.caption ? (
              <div className="row-2" style={{ marginTop: 12 }}>
                <label className="field">
                  <span className="label">{t("image.caption.name")}</span>
                  <input className="input" value={settings.captionName} onChange={(event) => onChange({ captionName: event.target.value })} autoComplete="name" />
                </label>
                <label className="field">
                  <span className="label">{t("image.caption.date")}</span>
                  <input className="input" value={settings.captionDate} onChange={(event) => onChange({ captionDate: event.target.value })} />
                </label>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      {mode === "signature" ? (
        <div className="side-section" style={{ display: "grid", gap: 14 }}>
          <Switch checked={settings.cleanup} onChange={(value) => onChange({ cleanup: value })} label={t("image.clean.title")} hint={t("image.clean.hint")} />
          {settings.cleanup || settings.transparent ? (
            <>
              <Slider label={t("image.clean.strength")} value={settings.cleanupStrength} min={0} max={100} onChange={(value) => onChange({ cleanupStrength: value })} format={(value) => `${value}%`} />
              <div className="field">
                <span className="label">{t("image.ink.title")}</span>
                <Segmented label={t("image.ink.title")} value={settings.ink} onChange={(value) => onChange({ ink: value })} options={[
                  { value: "original", label: t("image.ink.original") },
                  { value: "black", label: t("image.ink.black") },
                  { value: "blue", label: t("image.ink.blue") },
                ]} />
              </div>
            </>
          ) : null}
          <Switch checked={settings.transparent} onChange={(value) => onChange({ transparent: value, ...(value && settings.format === "jpeg" ? { format: "png" } : {}) })} label={t("image.transparent.title")} hint={t("image.transparent.hint")} />
        </div>
      ) : null}

      <div className="side-section">
        <details className="disclosure">
          <summary>{t("image.adjust.title")}<ChevronDown size={16} /></summary>
          <div>
            <Slider label={t("image.adjust.brightness")} value={settings.brightness} min={50} max={150} onChange={(value) => onChange({ brightness: value })} format={(value) => `${value - 100 > 0 ? "+" : ""}${value - 100}`} />
            <Slider label={t("image.adjust.contrast")} value={settings.contrast} min={50} max={150} onChange={(value) => onChange({ contrast: value })} format={(value) => `${value - 100 > 0 ? "+" : ""}${value - 100}`} />
            {!settings.grayscale ? <Slider label={t("image.adjust.saturation")} value={settings.saturation} min={0} max={200} onChange={(value) => onChange({ saturation: value })} format={(value) => `${value - 100 > 0 ? "+" : ""}${value - 100}`} /> : null}
            <Switch checked={settings.grayscale} onChange={(value) => onChange({ grayscale: value })} label={t("image.adjust.grayscale")} />
            <button type="button" className="btn btn-sm" style={{ justifySelf: "start" }} onClick={() => onChange({ brightness: 100, contrast: 100, saturation: 100, grayscale: false })}>{t("image.adjust.reset")}</button>
          </div>
        </details>
      </div>
    </>
  );
}

export function today() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
}
