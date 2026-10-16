import type { FaceSymbol, FigureCell, FoldKind, FrameKind, GlyphKind, Pic, SceneObject } from './types';

/*
 * Facts about figural pictures shared by the generators, the drawings and the words for them:
 * names, symmetry, where each place of a frame is. Small, so the drawing code can load it.
 */

export const isLegacy = (p: Pic): p is FigureCell => !('kind' in p);
export const norm = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;

/* ------------------------------------------------------------------ glyphs */

export const GLYPH_NAMES: Record<GlyphKind, string> = {
  arrow: 'panah',
  dblarrow: 'panah ganda',
  pin: 'pentol',
  tab: 'segitiga hitam',
  dot: 'titik',
  ring: 'cincin',
  square: 'persegi kecil',
  rect: 'persegi panjang',
  cross: 'tanda tambah',
  star: 'bintang',
  triangle: 'segitiga',
  eq: 'tanda sama dengan',
  L: 'huruf L',
  flag: 'bendera',
  half: 'setengah lingkaran',
  wedge: 'juring hitam',
  swedge: 'juring arsir',
};

/**
 * How a glyph repeats itself: `turn` is the smallest turn that leaves it unchanged (360: none,
 * 0: any), `axis` whether it has a mirror line along its own up direction (then a mirror image is
 * just a turn of it). A glyph without an axis (L, flag) has a distinct mirror image.
 */
export const GLYPH_SYMMETRY: Record<GlyphKind, { turn: number; axis: boolean }> = {
  arrow: { turn: 360, axis: true },
  dblarrow: { turn: 360, axis: true },
  pin: { turn: 360, axis: true },
  tab: { turn: 360, axis: true },
  dot: { turn: 0, axis: true },
  ring: { turn: 0, axis: true },
  square: { turn: 90, axis: true },
  rect: { turn: 180, axis: true },
  cross: { turn: 90, axis: true },
  star: { turn: 72, axis: true },
  triangle: { turn: 120, axis: true },
  eq: { turn: 180, axis: true },
  L: { turn: 360, axis: false },
  flag: { turn: 360, axis: false },
  half: { turn: 360, axis: true },
  wedge: { turn: 0, axis: true },
  swedge: { turn: 0, axis: true },
};

/** Glyphs with a direction: they can point, turn and flip. */
export const ORIENTED: GlyphKind[] = ['arrow', 'dblarrow', 'pin', 'L', 'flag', 'half'];

/** The same glyph pose written one way: direction modulo the glyph's turn, mirror only when it shows. */
export function canonPose(glyph: GlyphKind, dir = 0, mirrored = false): { dir: number; mirrored: boolean } {
  const sym = GLYPH_SYMMETRY[glyph];
  let d = norm(dir);
  // A glyph with a mirror line along its axis looks the same flipped about that line.
  const m = mirrored && !sym.axis;
  if (sym.turn === 0) d = 0;
  else if (sym.turn < 360) d = d % sym.turn;
  return { dir: d, mirrored: m };
}

/* ------------------------------------------------------------------ frames */

export const FRAME_SLOTS: Record<FrameKind, number> = { plain: 8, diag4: 4, quad4: 4, ring8: 8, pie8: 8 };

/** Direction from the centre to a place, degrees clockwise from up. */
export function slotAngle(frame: FrameKind, slot: number): number {
  if (frame === 'plain' || frame === 'ring8') return norm(slot * 45);
  if (frame === 'diag4') return norm(slot * 90);
  if (frame === 'quad4') return norm(315 + slot * 90);
  return norm(22.5 + slot * 45);
}

const SIDE8 = ['atas', 'kanan atas', 'kanan', 'kanan bawah', 'bawah', 'kiri bawah', 'kiri', 'kiri atas'];
export function slotName(frame: FrameKind, slot: number): string {
  const s = ((slot % FRAME_SLOTS[frame]) + FRAME_SLOTS[frame]) % FRAME_SLOTS[frame];
  if (frame === 'plain') return s % 2 ? `pojok ${SIDE8[s]}` : `sisi ${SIDE8[s]}`;
  if (frame === 'diag4') return `ruang ${['atas', 'kanan', 'bawah', 'kiri'][s]}`;
  if (frame === 'quad4') return `kotak ${['kiri atas', 'kanan atas', 'kanan bawah', 'kiri bawah'][s]}`;
  if (frame === 'ring8') return `titik ${SIDE8[s]}`;
  return `juring ke-${s + 1}`;
}

/** Words for a direction: "atas", "kanan atas", ... (multiples of 45°). */
export function dirName(deg: number): string {
  const d = norm(deg);
  return d % 45 === 0 ? SIDE8[d / 45] : `${d}°`;
}

/** Turning a place k steps clockwise around its frame. */
export const moveSlot = (frame: FrameKind, slot: number, k: number) => (((slot + k) % FRAME_SLOTS[frame]) + FRAME_SLOTS[frame]) % FRAME_SLOTS[frame];

/** An object's identity in a scene: its glyph. A visual key of its pose and place. */
export function objectKey(frame: FrameKind, o: SceneObject): string {
  const pose = o.glyph === 'tab' ? { dir: 0, mirrored: false } : canonPose(o.glyph, o.dir, o.mirrored);
  return [o.glyph, moveSlot(frame, o.slot, 0), o.anchor ?? '', pose.dir, pose.mirrored ? 'm' : '', o.fill ?? '', o.span ?? ''].join(':');
}

/* --------------------------------------------------------------- lattice */

/** The 3×3 points are 0–8 row by row; segments join neighbours, diagonals included. */
export const LATTICE_SEGMENTS: [number, number][] = [
  [0, 1],
  [1, 2],
  [3, 4],
  [4, 5],
  [6, 7],
  [7, 8],
  [0, 3],
  [3, 6],
  [1, 4],
  [4, 7],
  [2, 5],
  [5, 8],
  [0, 4],
  [1, 3],
  [1, 5],
  [2, 4],
  [3, 7],
  [4, 6],
  [4, 8],
  [5, 7],
];

/* ------------------------------------------------------------------ cubes */

export const FACE_NAMES: Record<FaceSymbol, string> = {
  white: 'putih polos',
  black: 'hitam penuh',
  dot: 'putih dengan kotak hitam kecil di tengah',
  circle: 'lingkaran',
  cross: 'tanda tambah',
  xcross: 'tanda silang',
  arrow: 'panah',
  half: 'setengah hitam',
  corner: 'segitiga hitam di pojok',
  bar: 'garis tengah',
  star: 'bintang',
  diamond: 'belah ketupat',
};

/** Quarter turns after which a face symbol looks the same (1: any turn). */
export const FACE_PERIOD: Record<FaceSymbol, number> = {
  white: 1,
  black: 1,
  dot: 1,
  circle: 1,
  cross: 1,
  xcross: 1,
  diamond: 1,
  star: 4,
  bar: 2,
  arrow: 4,
  half: 4,
  corner: 4,
};

export const faceKey = (f: { sym: FaceSymbol; rot: number }) => `${f.sym}${(((f.rot % 4) + 4) % 4) % FACE_PERIOD[f.sym]}`;

/** Where a symbol points after `rot` quarter turns, for words: arrow and half point up at 0, the corner sits top-left. */
export function faceWords(f: { sym: FaceSymbol; rot: number }): string {
  const r = (((f.rot % 4) + 4) % 4) % FACE_PERIOD[f.sym];
  const name = FACE_NAMES[f.sym];
  if (f.sym === 'arrow') return `${name} ke ${['atas', 'kanan', 'bawah', 'kiri'][r]}`;
  if (f.sym === 'half') return `${name} (bagian ${['atas', 'kanan', 'bawah', 'kiri'][r]})`;
  if (f.sym === 'corner') return `${name} ${['kiri atas', 'kanan atas', 'kanan bawah', 'kiri bawah'][r]}`;
  if (f.sym === 'bar') return `${name} ${r ? 'tegak' : 'mendatar'}`;
  if (f.sym === 'star') return `${name} ${r ? `diputar ${r * 90}°` : 'tegak'}`;
  return name;
}

/* ----------------------------------------------------------------- folds */

export const FOLD_NAMES: Record<FoldKind, string> = {
  'R>L': 'separuh kanan dilipat ke kiri',
  'L>R': 'separuh kiri dilipat ke kanan',
  'T>B': 'separuh atas dilipat ke bawah',
  'B>T': 'separuh bawah dilipat ke atas',
  'TR>BL': 'pojok kanan atas dilipat ke kiri bawah (lipatan diagonal)',
  'TL>BR': 'pojok kiri atas dilipat ke kanan bawah (lipatan diagonal)',
};

/* ----------------------------------------------------------- visual keys */

const rotKey = (c: FigureCell) => (c.shape === 'arrow' ? norm(c.rotation) : c.shape === 'triangle' ? norm(c.rotation) % 120 : 0);

/** Two pictures with the same key look the same on screen. */
export function picKey(p: Pic): string {
  if (isLegacy(p)) return `${p.shape}|${p.fill}|${p.count}|${rotKey(p)}`;
  switch (p.kind) {
    case 'scene':
      return `scene|${p.frame}|${p.objects
        .map((o) => objectKey(p.frame, o))
        .sort()
        .join('|')}`;
    case 'strokes':
      return `strokes|${p.strands}|${norm(p.apex)}|${p.attached}|${p.attached ? p.strands : p.dots}|${p.attached ? '' : norm(p.dotSide)}`;
    case 'lines':
      return `lines|${[...new Set(p.segs)].sort((a, b) => a - b).join(',')}`;
    case 'cube':
      return `cube|${faceKey(p.front)}|${faceKey(p.top)}|${faceKey(p.right)}`;
    case 'face':
      return `face|${faceKey(p.face)}`;
    case 'net':
      return `net|${p.squares.map((s) => `${s.x},${s.y},${faceKey(s.face)}`).join('|')}`;
    case 'holes':
      return `holes|${[...new Set(p.holes)].sort((a, b) => a - b).join(',')}`;
    case 'fold':
      return `fold|${p.folds.join(',')}|${(p.holes ?? []).join(',')}`;
  }
}
