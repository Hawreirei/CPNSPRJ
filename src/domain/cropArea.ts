/*
 * The cut-out area on a page, moved and resized from the keyboard (#59). Fractions of the page
 * (0–1), so the same area fits however large the page is drawn; cropBox turns it into pixels.
 * A box dragged up or to the left has a negative width or height until it is normalised here.
 */

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One arrow press, and one with Alt. */
export const STEP = 0.02;
export const BIG_STEP = 0.1;
/** Smallest side a keyboard resize leaves. */
export const MIN_SIDE = 0.05;
/** Where the keyboard starts: a box in the middle, half the page wide. */
export const START_AREA: Area = { x: 0.25, y: 0.35, w: 0.5, h: 0.3 };

// Repeated steps of 0.02 drift (0.1 + 0.02 = 0.12000000000000001); keep what is shown and cut exact.
const exact = (v: number) => Math.round(v * 1e6) / 1e6;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Positive width and height, at least MIN_SIDE, and wholly on the page. */
export function normalizeArea(a: Area): Area {
  const w = clamp(Math.abs(a.w), MIN_SIDE, 1);
  const h = clamp(Math.abs(a.h), MIN_SIDE, 1);
  const x = clamp(Math.min(a.x, a.x + a.w), 0, 1 - w);
  const y = clamp(Math.min(a.y, a.y + a.h), 0, 1 - h);
  return { x: exact(x), y: exact(y), w: exact(w), h: exact(h) };
}

/** Shift the area, stopping at the page edge. */
export function moveArea(a: Area, dx: number, dy: number): Area {
  const n = normalizeArea(a);
  return { ...n, x: exact(clamp(n.x + dx, 0, 1 - n.w)), y: exact(clamp(n.y + dy, 0, 1 - n.h)) };
}

/** Grow or shrink from the top-left corner, down to MIN_SIDE and up to the page edge. */
export function resizeArea(a: Area, dw: number, dh: number): Area {
  const n = normalizeArea(a);
  return { ...n, w: exact(clamp(n.w + dw, MIN_SIDE, 1 - n.x)), h: exact(clamp(n.h + dh, MIN_SIDE, 1 - n.y)) };
}

const DIRECTIONS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** The area after an arrow key: arrows move, Shift + arrows resize, Alt makes the step large. Null for other keys. */
export function areaAfterKey(a: Area, key: { key: string; shiftKey: boolean; altKey: boolean }): Area | null {
  const d = DIRECTIONS[key.key];
  if (!d) return null;
  const step = key.altKey ? BIG_STEP : STEP;
  return key.shiftKey ? resizeArea(a, d[0] * step, d[1] * step) : moveArea(a, d[0] * step, d[1] * step);
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** For a screen reader: "Area 40% × 25% mulai dari 10%, 20%" (width × height from left, top). */
export function describeArea(a: Area): string {
  const n = normalizeArea(a);
  return `Area ${pct(n.w)} × ${pct(n.h)} mulai dari ${pct(n.x)}, ${pct(n.y)}`;
}
