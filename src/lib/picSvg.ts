import { foldGeometry, foldShapes, holePoint, type Poly } from '../domain/fold';
import { LATTICE_SEGMENTS, norm, slotAngle } from '../domain/pic';
import type { CubeCell, Face, Fill, FoldCell, GlyphKind, HolesCell, LinesCell, NetCell, SceneCell, SceneObject, StrokeCell } from '../domain/types';

/*
 * Drawings for the figural pictures beyond the first kind (scenes, line figures, lattices, cubes,
 * nets, paper). Each is drawn in a 100×100 box; `wrap` scales it to the requested size.
 */

let seq = 0;
const f1 = (n: number) => +n.toFixed(2);
const pts = (arr: [number, number][]) => arr.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ');

function wrap(body: string, size: number, color: string, defs = ''): string {
  const frame = `<rect x="1.5" y="1.5" width="97" height="97" rx="7" fill="none" stroke="${color}" stroke-opacity="0.25"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${defs}${frame}${body}</svg>`;
}

/** Hatch and dot patterns in the 100-box. */
function patterns(id: string, color: string): string {
  return (
    `<defs><pattern id="${id}s" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="${color}" stroke-width="1.3"/></pattern>` +
    `<pattern id="${id}d" width="4.5" height="4.5" patternUnits="userSpaceOnUse"><circle cx="2.25" cy="2.25" r="1.35" fill="${color}"/></pattern></defs>`
  );
}
const paint = (fill: Fill | undefined, id: string, color: string, dflt: Fill = 'solid') => {
  const f = fill ?? dflt;
  return f === 'solid' ? color : f === 'empty' ? 'none' : f === 'striped' ? `url(#${id}s)` : `url(#${id}d)`;
};

/* ----------------------------------------------------------------- glyphs */

/** A glyph pointing up in a box from -1 to 1. Lines are drawn with `sw` in those units. */
function glyphMarkup(g: GlyphKind, fillAttr: string, color: string, sw: number): string {
  const fill = `fill="${fillAttr}" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"`;
  const line = `fill="none" stroke="${color}" stroke-width="${sw * 1.8}" stroke-linecap="round"`;
  switch (g) {
    case 'arrow':
      return `<polygon ${fill} points="${pts([
        [0, -1],
        [0.65, -0.15],
        [0.22, -0.15],
        [0.22, 1],
        [-0.22, 1],
        [-0.22, -0.15],
        [-0.65, -0.15],
      ])}"/>`;
    case 'dblarrow':
      return `<polygon fill="${color}" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" points="${pts([
        [0, -1],
        [0.6, -0.25],
        [-0.6, -0.25],
      ])}"/><path ${line} d="M-0.22 -0.25V1M0.22 -0.25V1"/>`;
    case 'pin':
      return `<circle cx="0" cy="-0.55" r="0.38" fill="${color}"/><path ${line} d="M0 -0.4V1"/>`;
    case 'dot':
      return `<circle cx="0" cy="0" r="0.45" fill="${color}"/>`;
    case 'ring':
      return `<circle cx="0" cy="0" r="0.6" fill="none" stroke="${color}" stroke-width="${sw * 1.5}"/>`;
    case 'square':
      return `<rect x="-0.6" y="-0.6" width="1.2" height="1.2" ${fill}/>`;
    case 'rect':
      return `<rect x="-0.9" y="-0.38" width="1.8" height="0.76" ${fill}/>`;
    case 'cross':
      return `<path ${line} d="M0 -0.8V0.8M-0.8 0H0.8"/>`;
    case 'eq':
      return `<path ${line} d="M-0.8 -0.3H0.8M-0.8 0.3H0.8"/>`;
    case 'star': {
      const s = Array.from({ length: 10 }, (_, i): [number, number] => {
        const r = i % 2 === 0 ? 1 : 0.42;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        return [r * Math.cos(a), r * Math.sin(a)];
      });
      return `<polygon ${fill} points="${pts(s)}"/>`;
    }
    case 'triangle':
      return `<polygon ${fill} points="${pts([
        [0, -1],
        [0.9, 0.65],
        [-0.9, 0.65],
      ])}"/>`;
    case 'L':
      return `<path fill="none" stroke="${color}" stroke-width="${sw * 2.4}" stroke-linecap="square" stroke-linejoin="miter" d="M-0.45 -0.85V0.8H0.55"/>`;
    case 'flag':
      return `<path ${line} d="M-0.5 -0.95V0.95"/><polygon fill="${fillAttr}" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" points="${pts([
        [-0.5, -0.95],
        [0.75, -0.6],
        [-0.5, -0.2],
      ])}"/>`;
    case 'half':
      return `<path ${fill} d="M-0.85 0.35A0.85 0.85 0 0 1 0.85 0.35Z"/>`;
    default:
      return '';
  }
}

/** Where a place of a frame is, for an object of the given anchor. */
function slotPoint(frame: SceneCell['frame'], slot: number, anchor?: 'in' | 'out'): [number, number] {
  const a = (slotAngle(frame, slot) * Math.PI) / 180;
  const at = (r: number): [number, number] => [50 + r * Math.sin(a), 50 - r * Math.cos(a)];
  if (frame === 'plain') {
    // Around the middle square (25–75): sides at the middle of each side, corners diagonally.
    // Inside, objects sit in the corners, clear of the triangles on the sides.
    const corner = slot % 2 === 1;
    if (anchor === 'in') return corner ? at(17 * Math.SQRT2) : at(12);
    return corner ? at(37 * Math.SQRT2) : at(38);
  }
  if (frame === 'diag4') return at(28);
  if (frame === 'quad4') return at(22 * Math.SQRT2);
  if (frame === 'ring8') return at(33);
  return at(28);
}

function tabMarkup(o: SceneObject, color: string): string {
  // A black triangle with its base on a side of the middle square, pointing away from that side.
  const side = (((o.slot / 2) | 0) % 4) * 90;
  const out = o.anchor === 'out';
  const tri = out
    ? [
        [-8, -25],
        [8, -25],
        [0, -36],
      ]
    : [
        [-8, -25],
        [8, -25],
        [0, -14],
      ];
  return `<g transform="translate(50 50) rotate(${side})"><polygon points="${pts(tri as [number, number][])}" fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/></g>`;
}

function wedgeMarkup(o: SceneObject, id: string, color: string): string {
  const span = Math.max(1, Math.min(8, o.span ?? 1));
  const a0 = ((o.slot * 45 - 90) * Math.PI) / 180;
  const a1 = (((o.slot + span) * 45 - 90) * Math.PI) / 180;
  const r = 40;
  const p0 = [50 + r * Math.cos(a0), 50 + r * Math.sin(a0)];
  const p1 = [50 + r * Math.cos(a1), 50 + r * Math.sin(a1)];
  const fill = o.glyph === 'wedge' ? color : `url(#${id}s)`;
  if (span === 8) return `<circle cx="50" cy="50" r="${r}" fill="${fill}" stroke="${color}" stroke-width="1.5"/>`;
  return `<path d="M50 50L${f1(p0[0])} ${f1(p0[1])}A${r} ${r} 0 ${span > 4 ? 1 : 0} 1 ${f1(p1[0])} ${f1(p1[1])}Z" fill="${fill}" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`;
}

const GLYPH_SIZE: Record<SceneCell['frame'], number> = { plain: 10, diag4: 11, quad4: 13, ring8: 10, pie8: 8 };

export function sceneSvg(c: SceneCell, size: number, color: string): string {
  const id = `s${++seq}`;
  const parts: string[] = [];
  const thin = `fill="none" stroke="${color}" stroke-width="1.6"`;
  if (c.frame === 'plain') parts.push(`<rect x="25" y="25" width="50" height="50" ${thin}/>`);
  if (c.frame === 'diag4') parts.push(`<rect x="8" y="8" width="84" height="84" ${thin}/><path ${thin} d="M8 8L92 92M92 8L8 92"/>`);
  if (c.frame === 'quad4') parts.push(`<rect x="8" y="8" width="84" height="84" ${thin}/><path ${thin} d="M50 8V92M8 50H92"/>`);
  if (c.frame === 'ring8') parts.push(`<circle cx="50" cy="50" r="33" fill="none" stroke="${color}" stroke-opacity="0.45" stroke-width="1.2"/>`);
  if (c.frame === 'pie8') {
    parts.push(...c.objects.filter((o) => o.glyph === 'wedge' || o.glyph === 'swedge').map((o) => wedgeMarkup(o, id, color)));
    parts.push(`<circle cx="50" cy="50" r="40" ${thin}/>`);
    for (let k = 0; k < 8; k++) {
      const a = ((k * 45 - 90) * Math.PI) / 180;
      parts.push(`<path ${thin} d="M50 50L${f1(50 + 40 * Math.cos(a))} ${f1(50 + 40 * Math.sin(a))}"/>`);
    }
  }
  for (const o of c.objects) {
    if (o.glyph === 'wedge' || o.glyph === 'swedge') continue;
    if (o.glyph === 'tab') {
      parts.push(tabMarkup(o, color));
      continue;
    }
    const [x, y] = slotPoint(c.frame, o.slot, o.anchor);
    const s = GLYPH_SIZE[c.frame] * (o.anchor === 'in' ? 0.6 : 1);
    const mirror = o.mirrored ? ' scale(-1 1)' : '';
    parts.push(
      `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${norm(o.dir ?? 0)})${mirror} scale(${s})">${glyphMarkup(o.glyph, paint(o.fill, id, color), color, 1.5 / s)}</g>`,
    );
  }
  return wrap(parts.join(''), size, color, patterns(id, color));
}

/* ------------------------------------------------------------ line figures */

export function strokesSvg(c: StrokeCell, size: number, color: string): string {
  const n = Math.max(2, Math.min(4, c.strands));
  const xs = n === 2 ? [-0.5, 0.5] : n === 3 ? [-0.55, 0, 0.55] : [-0.6, -0.2, 0.2, 0.6];
  const line = `stroke="${color}" stroke-width="2.6" stroke-linecap="round" fill="none"`;
  const parts: string[] = [];
  // The fan with its apex up, in a box from -1 to 1; then turned to point where the apex points.
  const fan = (scale: number, shift: [number, number]) => {
    const apex: [number, number] = [0, -0.45];
    const ends = xs.map((x): [number, number] => [x, 0.45]);
    const t = (p: [number, number]): [number, number] => [p[0] * scale + shift[0], p[1] * scale + shift[1]];
    return { apex: t(apex), ends: ends.map(t) };
  };
  const toBox = (p: [number, number], deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    const x = p[0] * Math.cos(a) - p[1] * Math.sin(a);
    const y = p[0] * Math.sin(a) + p[1] * Math.cos(a);
    return [50 + x * 40, 50 + y * 40];
  };
  if (c.attached) {
    const { apex, ends } = fan(1.4, [0, 0]);
    const A = toBox(apex, c.apex);
    for (const e of ends) {
      const E = toBox(e, c.apex);
      parts.push(`<path ${line} d="M${f1(A[0])} ${f1(A[1])}L${f1(E[0])} ${f1(E[1])}"/><circle cx="${f1(E[0])}" cy="${f1(E[1])}" r="5" fill="${color}"/>`);
    }
  } else {
    // Dots in a row along one side; the fan sits in the rest of the box.
    const ds = (norm(c.dotSide) * Math.PI) / 180;
    const dx = Math.sin(ds);
    const dy = -Math.cos(ds);
    const k = Math.max(1, Math.min(4, c.dots));
    for (let i = 0; i < k; i++) {
      const along = k === 1 ? 0 : -0.75 + (1.5 * i) / (k - 1);
      const px = 50 + (dx * 0.8 - dy * along) * 40;
      const py = 50 + (dy * 0.8 + dx * along) * 40;
      parts.push(`<circle cx="${f1(px)}" cy="${f1(py)}" r="5" fill="${color}"/>`);
    }
    const { apex, ends } = fan(1.05, [0, 0]);
    const off: [number, number] = [-dx * 0.22, -dy * 0.22];
    const A = toBox(apex, c.apex);
    for (const e of ends) {
      const E = toBox(e, c.apex);
      parts.push(`<path ${line} d="M${f1(A[0] + off[0] * 40)} ${f1(A[1] + off[1] * 40)}L${f1(E[0] + off[0] * 40)} ${f1(E[1] + off[1] * 40)}"/>`);
    }
  }
  return wrap(parts.join(''), size, color);
}

/* ---------------------------------------------------------------- lattice */

const LP = (i: number): [number, number] => [20 + (i % 3) * 30, 20 + Math.floor(i / 3) * 30];

export function linesSvg(c: LinesCell, size: number, color: string): string {
  const parts = Array.from({ length: 9 }, (_, i) => `<circle cx="${LP(i)[0]}" cy="${LP(i)[1]}" r="1.6" fill="${color}" fill-opacity="0.35"/>`);
  for (const s of c.segs) {
    const [a, b] = LATTICE_SEGMENTS[s] ?? [0, 0];
    parts.push(`<path d="M${LP(a)[0]} ${LP(a)[1]}L${LP(b)[0]} ${LP(b)[1]}" stroke="${color}" stroke-width="3.2" stroke-linecap="round"/>`);
  }
  return wrap(parts.join(''), size, color);
}

/* ------------------------------------------------------------------ cubes */

/** A face symbol in the unit square (0–1, y down), turned `rot` quarter turns about its centre. */
function faceMarkup(f: Face, color: string, w: number): string {
  const r = (((f.rot % 4) + 4) % 4) * 90;
  const turn = (body: string) => `<g transform="rotate(${r} 0.5 0.5)">${body}</g>`;
  const line = `stroke="${color}" stroke-width="${w * 1.6}" stroke-linecap="round" fill="none"`;
  switch (f.sym) {
    case 'white':
      return '';
    case 'black':
      return `<rect x="0" y="0" width="1" height="1" fill="${color}"/>`;
    case 'dot':
      return `<rect x="0.38" y="0.38" width="0.24" height="0.24" fill="${color}"/>`;
    case 'circle':
      return `<circle cx="0.5" cy="0.5" r="0.27" fill="none" stroke="${color}" stroke-width="${w * 1.4}"/>`;
    case 'cross':
      return `<path ${line} d="M0.5 0.2V0.8M0.2 0.5H0.8"/>`;
    case 'xcross':
      return `<path ${line} d="M0.27 0.27L0.73 0.73M0.73 0.27L0.27 0.73"/>`;
    case 'diamond':
      return `<polygon points="0.5,0.2 0.8,0.5 0.5,0.8 0.2,0.5" fill="${color}"/>`;
    case 'star': {
      const s = Array.from({ length: 10 }, (_, i): [number, number] => {
        const rr = i % 2 === 0 ? 0.32 : 0.13;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        return [0.5 + rr * Math.cos(a), 0.52 + rr * Math.sin(a)];
      });
      return turn(`<polygon points="${pts(s)}" fill="${color}"/>`);
    }
    case 'arrow':
      return turn(`<polygon points="0.5,0.15 0.78,0.45 0.6,0.45 0.6,0.85 0.4,0.85 0.4,0.45 0.22,0.45" fill="${color}"/>`);
    case 'half':
      return turn(`<rect x="0" y="0" width="1" height="0.5" fill="${color}"/>`);
    case 'corner':
      return turn(`<polygon points="0,0 0.6,0 0,0.6" fill="${color}"/>`);
    case 'bar':
      return turn(`<rect x="0.12" y="0.42" width="0.76" height="0.16" fill="${color}"/>`);
  }
}

/** A face drawn on a parallelogram: origin, then where the unit square's x and y edges go. */
function facePlate(f: Face, o: [number, number], u: [number, number], v: [number, number], color: string): string {
  const m = `matrix(${f1(u[0])} ${f1(u[1])} ${f1(v[0])} ${f1(v[1])} ${f1(o[0])} ${f1(o[1])})`;
  const len = Math.hypot(...u);
  return `<g transform="${m}">${faceMarkup(f, color, 1.7 / len)}<rect x="0" y="0" width="1" height="1" fill="none" stroke="${color}" stroke-width="${f1(2 / len)}" vector-effect="non-scaling-stroke"/></g>`;
}

export function cubeSvg(c: CubeCell, size: number, color: string): string {
  // Oblique view: the front face square, the top and right faces leaning back by `d`.
  const s = 50;
  const d = 20;
  const x0 = 15;
  const y0 = 36;
  const body = [
    facePlate(c.front, [x0, y0], [s, 0], [0, s], color),
    facePlate(c.top, [x0 + d, y0 - d], [s, 0], [-d, d], color),
    facePlate(c.right, [x0 + s, y0], [d, -d], [0, s], color),
  ].join('');
  return wrap(body, size, color);
}

export function netSvg(c: NetCell, size: number, color: string): string {
  const xs = c.squares.map((q) => q.x);
  const ys = c.squares.map((q) => q.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0 + 1;
  const h = Math.max(...ys) - y0 + 1;
  const cell = 88 / Math.max(w, h);
  const ox = 50 - (w * cell) / 2;
  const oy = 50 - (h * cell) / 2;
  const body = c.squares.map((q) => facePlate(q.face, [ox + (q.x - x0) * cell, oy + (q.y - y0) * cell], [cell, 0], [0, cell], color)).join('');
  return wrap(body, size, color);
}

/* ------------------------------------------------------------------ paper */

const P = (p: [number, number]): [number, number] => [12 + p[0] * 76, 12 + p[1] * 76];
const polyPath = (poly: Poly) =>
  `M${poly
    .map(P)
    .map(([x, y]) => `${f1(x)} ${f1(y)}`)
    .join('L')}Z`;

export function holesSvg(c: HolesCell, size: number, color: string): string {
  const holes = c.holes.map((h) => {
    const [x, y] = P(holePoint(h));
    return `<circle cx="${f1(x)}" cy="${f1(y)}" r="5.5" fill="${color}"/>`;
  });
  return wrap(`<rect x="12" y="12" width="76" height="76" fill="none" stroke="${color}" stroke-width="1.8"/>${holes.join('')}`, size, color);
}

export function foldSvg(c: FoldCell, size: number, color: string): string {
  const shapes = foldShapes(c.folds);
  if (!shapes) return wrap('', size, color);
  const now = shapes[shapes.length - 1];
  const parts: string[] = [];
  if (c.folds.length) {
    // Where the flap was, dashed, and an arrow showing which way it went.
    const before = shapes[shapes.length - 2];
    const g = foldGeometry(before, c.folds[c.folds.length - 1])!;
    parts.push(`<path d="${polyPath(before)}" fill="none" stroke="${color}" stroke-width="1.3" stroke-dasharray="3 3" stroke-opacity="0.7"/>`);
    const flap = before.filter((p) => g.side(p) > 1e-9);
    if (flap.length) {
      const cx = flap.reduce((s, p) => s + p[0], 0) / flap.length;
      const cy = flap.reduce((s, p) => s + p[1], 0) / flap.length;
      const [tx, ty] = g.reflect([cx, cy]);
      const [ax, ay] = P([cx * 0.7 + ((g.line[0][0] + g.line[1][0]) / 2) * 0.3, cy * 0.7 + ((g.line[0][1] + g.line[1][1]) / 2) * 0.3]);
      const [bx, by] = P([tx * 0.75 + ((g.line[0][0] + g.line[1][0]) / 2) * 0.25, ty * 0.75 + ((g.line[0][1] + g.line[1][1]) / 2) * 0.25]);
      parts.push(
        `<path d="M${f1(ax)} ${f1(ay)}L${f1(bx)} ${f1(by)}" stroke="${color}" stroke-width="2" marker-end="url(#fa${seq})"/>`,
        `<defs><marker id="fa${seq}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="${color}"/></marker></defs>`,
      );
    }
  }
  parts.push(`<path d="${polyPath(now)}" fill="${color}" fill-opacity="0.08" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`);
  for (const h of c.holes ?? []) {
    const [x, y] = P(holePoint(h));
    parts.push(`<circle cx="${f1(x)}" cy="${f1(y)}" r="5" fill="${color}"/>`);
  }
  seq++;
  return wrap(parts.join(''), size, color);
}
