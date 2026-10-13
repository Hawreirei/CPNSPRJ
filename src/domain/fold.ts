import type { FoldKind } from './types';

/*
 * Paper folding and punching. The sheet is the unit square (y down). Each fold halves the current
 * shape: a rectangle along its middle, or a square along a diagonal, so the flap always covers the
 * rest exactly and a hole goes through every layer. Unfolding mirrors each hole across the folds,
 * last fold first. Holes sit on a 4×4 grid of places (0–15, row by row).
 */

export type Pt = [number, number];
export type Poly = Pt[];

const EPS = 1e-9;
const bbox = (p: Poly) => {
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

/** Whether the shape is its own bounding rectangle. */
export function isRect(p: Poly): boolean {
  const b = bbox(p);
  return p.length === 4 && p.every(([x, y]) => (Math.abs(x - b.x0) < EPS || Math.abs(x - b.x1) < EPS) && (Math.abs(y - b.y0) < EPS || Math.abs(y - b.y1) < EPS));
}

/** The fold as a line (side test: > 0 is the flap) and a reflection across it. */
export function foldGeometry(shape: Poly, f: FoldKind): { side: (p: Pt) => number; reflect: (p: Pt) => Pt; line: [Pt, Pt] } | null {
  if (!isRect(shape)) return null;
  const { x0, x1, y0, y1 } = bbox(shape);
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const w = x1 - x0;
  const h = y1 - y0;
  const u = (p: Pt) => (p[0] - x0) / w;
  const v = (p: Pt) => (p[1] - y0) / h;
  const at = (uu: number, vv: number): Pt => [x0 + uu * w, y0 + vv * h];
  switch (f) {
    case 'R>L':
      return {
        side: (p) => p[0] - mx,
        reflect: (p) => [2 * mx - p[0], p[1]],
        line: [
          [mx, y0],
          [mx, y1],
        ],
      };
    case 'L>R':
      return {
        side: (p) => mx - p[0],
        reflect: (p) => [2 * mx - p[0], p[1]],
        line: [
          [mx, y0],
          [mx, y1],
        ],
      };
    case 'T>B':
      return {
        side: (p) => my - p[1],
        reflect: (p) => [p[0], 2 * my - p[1]],
        line: [
          [x0, my],
          [x1, my],
        ],
      };
    case 'B>T':
      return {
        side: (p) => p[1] - my,
        reflect: (p) => [p[0], 2 * my - p[1]],
        line: [
          [x0, my],
          [x1, my],
        ],
      };
    case 'TR>BL':
      if (Math.abs(w - h) > EPS) return null;
      return { side: (p) => u(p) - v(p), reflect: (p) => at(v(p), u(p)), line: [at(0, 0), at(1, 1)] };
    case 'TL>BR':
      if (Math.abs(w - h) > EPS) return null;
      return { side: (p) => 1 - u(p) - v(p), reflect: (p) => at(1 - v(p), 1 - u(p)), line: [at(1, 0), at(0, 1)] };
  }
}

/** The part of a convex shape on the kept side of a fold (Sutherland–Hodgman). */
function clip(shape: Poly, side: (p: Pt) => number): Poly {
  const out: Poly = [];
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i];
    const b = shape[(i + 1) % shape.length];
    const sa = -side(a);
    const sb = -side(b);
    if (sa >= -EPS) out.push(a);
    if ((sa > EPS && sb < -EPS) || (sa < -EPS && sb > EPS)) {
      const t = sa / (sa - sb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  // Drop repeated corners left by the cut.
  return out.filter((p, i) => {
    const q = out[(i + 1) % out.length];
    return Math.abs(p[0] - q[0]) > EPS || Math.abs(p[1] - q[1]) > EPS;
  });
}

export const SHEET: Poly = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/** The shape after each fold: shapes[0] is the sheet, shapes[i] after the i-th fold. Null if a fold cannot be made. */
export function foldShapes(folds: FoldKind[]): Poly[] | null {
  const shapes = [SHEET];
  for (const f of folds) {
    const g = foldGeometry(shapes[shapes.length - 1], f);
    if (!g) return null;
    shapes.push(clip(shapes[shapes.length - 1], g.side));
  }
  return shapes;
}

export const holePoint = (h: number): Pt => [((h % 4) + 0.5) / 4, (Math.floor(h / 4) + 0.5) / 4];
const holeAt = (p: Pt): number | null => {
  const c = p[0] * 4 - 0.5;
  const r = p[1] * 4 - 0.5;
  if (Math.abs(c - Math.round(c)) > 1e-6 || Math.abs(r - Math.round(r)) > 1e-6) return null;
  const ci = Math.round(c);
  const ri = Math.round(r);
  return ci >= 0 && ci < 4 && ri >= 0 && ri < 4 ? ri * 4 + ci : null;
};

/** Whether a hole place lies strictly inside a shape, away from its edges and fold lines. */
export function insideShape(shape: Poly, h: number): boolean {
  const p = holePoint(h);
  // Convex and clockwise or anticlockwise: every edge keeps the point on the same side.
  let sign = 0;
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i];
    const b = shape[(i + 1) % shape.length];
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (Math.abs(cross) < 1e-6) return false;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/** The holes in the opened sheet, or null when a hole falls off the grid. */
export function unfold(folds: FoldKind[], holes: number[], until = 0): number[] | null {
  const shapes = foldShapes(folds);
  if (!shapes) return null;
  let pts = holes.map(holePoint);
  for (let i = folds.length - 1; i >= until; i--) {
    const g = foldGeometry(shapes[i], folds[i])!;
    pts = [...pts, ...pts.map(g.reflect)];
  }
  const out = new Set<number>();
  for (const p of pts) {
    const h = holeAt(p);
    if (h === null) return null;
    out.add(h);
  }
  return [...out].sort((a, b) => a - b);
}
