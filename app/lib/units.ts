export type Unit = "px" | "mm" | "cm" | "in";

export const UNITS: Unit[] = ["px", "mm", "cm", "in"];

const UNIT_PER_INCH: Record<Exclude<Unit, "px">, number> = { mm: 25.4, cm: 2.54, in: 1 };

/** Converts a length in any unit to whole pixels at the given resolution. */
export function toPixels(value: number, unit: Unit, dpi: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (unit === "px") return Math.round(value);
  return Math.max(1, Math.round((value / UNIT_PER_INCH[unit]) * dpi));
}

/** Converts pixels to the given unit, rounded to a sensible precision. */
export function fromPixels(pixels: number, unit: Unit, dpi: number): number {
  if (unit === "px") return Math.round(pixels);
  const value = (pixels / dpi) * UNIT_PER_INCH[unit];
  const decimals = unit === "mm" ? 1 : 2;
  return Number(value.toFixed(decimals));
}

export function formatLength(value: number, unit: Unit) {
  const text = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(unit === "mm" ? 1 : 2)));
  return `${text} ${unit}`;
}

export function formatBytes(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
