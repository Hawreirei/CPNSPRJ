import { describePic } from '../describe';
import { FACE_PERIOD, faceWords, picKey } from '../pic';
import type { CubeCell, Difficulty, Face, FaceSymbol, FaceCell, NetCell, Pic, Question } from '../types';
import { chooseOptions, pick, randInt, verifyDistinct, type Archetype, type Draft, type Lure, type Rand } from './build';

/*
 * Cubes (docs/rancangan-figural-v2.md F5–F7). A net is folded by walking from one square to its
 * neighbours: each square gets its normal (which way it faces once folded) and the direction its
 * "up" points. A cube seen from the front-right-top shows three faces; it can be held in 24 ways.
 */

type V3 = [number, number, number];
const neg = (a: V3): V3 => [-a[0], -a[1], -a[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const eq3 = (a: V3, b: V3) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const vkey = (a: V3) => a.join(',');

/** A face of a folded cube: which way it faces, where its symbol's top points, and the symbol. */
interface Placed {
  n: V3;
  up: V3;
  sym: FaceSymbol;
}

/** The symbol's top after `rot` quarter turns clockwise, seen from outside. */
function turnUp(n: V3, u: V3, rot: number): V3 {
  const right = cross(u, n);
  const k = ((rot % 4) + 4) % 4;
  return k === 0 ? u : k === 1 ? right : k === 2 ? neg(u) : neg(right);
}

/** Fold a net: each square's normal and "up" (net up), or null when two squares land on one face. */
export function foldFrames(squares: { x: number; y: number }[]): { n: V3; u: V3 }[] | null {
  const frames: ({ n: V3; u: V3; r: V3 } | null)[] = squares.map(() => null);
  frames[0] = { n: [0, 0, 1], u: [0, 1, 0], r: [1, 0, 0] };
  const queue = [0];
  while (queue.length) {
    const i = queue.shift()!;
    const f = frames[i]!;
    squares.forEach((s, j) => {
      if (frames[j]) return;
      const dx = s.x - squares[i].x;
      const dy = s.y - squares[i].y;
      if (Math.abs(dx) + Math.abs(dy) !== 1) return;
      // Folding away from the viewer: the neighbour turns about the shared edge.
      if (dx === 1) frames[j] = { n: f.r, u: f.u, r: neg(f.n) };
      else if (dx === -1) frames[j] = { n: neg(f.r), u: f.u, r: f.n };
      else if (dy === -1) frames[j] = { n: f.u, u: neg(f.n), r: f.r };
      else frames[j] = { n: neg(f.u), u: f.n, r: f.r };
      queue.push(j);
    });
  }
  if (frames.some((f) => !f)) return null;
  if (new Set(frames.map((f) => vkey(f!.n))).size !== 6) return null;
  return frames.map((f) => ({ n: f!.n, u: f!.u }));
}

/** A random cube net (any of the 11, turned and flipped), squares from (0,0). */
export function randomNet(r: Rand): { x: number; y: number }[] {
  for (;;) {
    const cells = [{ x: 0, y: 0 }];
    while (cells.length < 6) {
      const c = pick(cells, r);
      const [dx, dy] = pick(
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ],
        r,
      );
      const nxt = { x: c.x + dx, y: c.y + dy };
      if (!cells.some((q) => q.x === nxt.x && q.y === nxt.y)) cells.push(nxt);
    }
    if (!foldFrames(cells)) continue;
    const x0 = Math.min(...cells.map((c) => c.x));
    const y0 = Math.min(...cells.map((c) => c.y));
    const out = cells.map((c) => ({ x: c.x - x0, y: c.y - y0 }));
    // Nets wider than five or taller than three do not fit a picture well; draw again.
    const w = Math.max(...out.map((c) => c.x)) + 1;
    const h = Math.max(...out.map((c) => c.y)) + 1;
    if (Math.max(w, h) > 5) continue;
    return out.sort((a, b) => a.y - b.y || a.x - b.x);
  }
}

/** Which of the 11 nets a shape is, whatever its turn or flip: the smallest of its eight images. */
export function netClass(squares: { x: number; y: number }[]): string {
  const images: string[] = [];
  for (let t = 0; t < 8; t++) {
    const pts = squares.map(({ x, y }) => {
      let [a, b] = t & 1 ? [y, x] : [x, y];
      if (t & 2) a = -a;
      if (t & 4) b = -b;
      return [a, b];
    });
    const ax = Math.min(...pts.map((p) => p[0]));
    const by = Math.min(...pts.map((p) => p[1]));
    images.push(
      pts
        .map(([a, b]) => `${a - ax}${b - by}`)
        .sort()
        .join('.'),
    );
  }
  return images.sort()[0];
}

/** The cube a net folds into. */
export function foldNet(net: NetCell): Placed[] | null {
  const frames = foldFrames(net.squares);
  if (!frames) return null;
  return frames.map((f, i) => ({ n: f.n, up: turnUp(f.n, f.u, net.squares[i].face.rot), sym: net.squares[i].face.sym }));
}

/** The 24 ways to hold a cube, as matrices (rows). */
export const ROTATIONS: V3[][] = (() => {
  const out: V3[][] = [];
  const perms = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  for (const p of perms)
    for (let s = 0; s < 8; s++) {
      const signs = [s & 1 ? -1 : 1, s & 2 ? -1 : 1, s & 4 ? -1 : 1];
      const m: V3[] = [0, 1, 2].map((i) => {
        const row: V3 = [0, 0, 0];
        row[p[i]] = signs[i];
        return row;
      });
      const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      if (det === 1) out.push(m);
    }
  return out;
})();
const apply = (m: V3[], v: V3): V3 => [0, 1, 2].map((i) => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]) as V3;

/** How each visible face is drawn: its normal, and its drawing's up and right. */
const VIEW: Record<'front' | 'top' | 'right', { n: V3; up: V3; right: V3 }> = {
  front: { n: [0, 0, 1], up: [0, 1, 0], right: [1, 0, 0] },
  top: { n: [0, 1, 0], up: [0, 0, -1], right: [1, 0, 0] },
  right: { n: [1, 0, 0], up: [0, 1, 0], right: [0, 0, -1] },
};

/** The cube held the `k`-th way, seen from the front-right-top. */
export function viewOf(cube: Placed[], k: number): CubeCell {
  const m = ROTATIONS[k];
  const turned = cube.map((f) => ({ n: apply(m, f.n), up: apply(m, f.up), sym: f.sym }));
  const face = (which: keyof typeof VIEW): Face => {
    const v = VIEW[which];
    const f = turned.find((t) => eq3(t.n, v.n))!;
    const rot = eq3(f.up, v.up) ? 0 : eq3(f.up, v.right) ? 1 : eq3(f.up, neg(v.up)) ? 2 : 3;
    return { sym: f.sym, rot: rot % FACE_PERIOD[f.sym] };
  };
  return { kind: 'cube', front: face('front'), top: face('top'), right: face('right') };
}

/** Every distinct view of a cube. */
export const allViews = (cube: Placed[]) => [...new Set(ROTATIONS.map((_, k) => picKey(viewOf(cube, k))))];

/** Whether a cube (seen from some way of holding it) can be the folded net. */
export const canShow = (cube: Placed[], view: CubeCell) => allViews(cube).includes(picKey(view));

/* --------------------------------------------------------------- symbols */

const SYMMETRIC: FaceSymbol[] = ['dot', 'circle', 'cross', 'xcross', 'diamond', 'black'];
const ORIENTED_FACES: FaceSymbol[] = ['arrow', 'half', 'corner'];

function faces(d: Difficulty, r: Rand): Face[] {
  if (d === 'mudah') {
    // Like a printed test: plain colours repeat, so opposite and next-door faces decide.
    const set: FaceSymbol[] = pick(
      [
        ['white', 'white', 'black', 'black', 'dot', 'white'],
        ['white', 'black', 'black', 'dot', 'circle', 'white'],
        ['dot', 'circle', 'cross', 'black', 'white', 'xcross'],
      ] as FaceSymbol[][],
      r,
    );
    return [...set].sort(() => r() - 0.5).map((sym) => ({ sym, rot: 0 }));
  }
  const oriented = d === 'sedang' ? 1 : randInt(2, 3, r);
  const syms = [...[...ORIENTED_FACES].sort(() => r() - 0.5).slice(0, oriented), ...[...SYMMETRIC].sort(() => r() - 0.5).slice(0, 6 - oriented)];
  return syms.sort(() => r() - 0.5).map((sym) => ({ sym, rot: randInt(0, 3, r) % FACE_PERIOD[sym] }));
}

const isFace = (f: Face, sym: FaceSymbol) => f.sym === sym;
const oppositeOf = (cube: Placed[], i: number) => cube.findIndex((f) => eq3(f.n, neg(cube[i].n)));

/* ---------------------------------------------------- F5: net to cube */

/** Which face of the cube is seen in front, on top and on the right when held the `k`-th way. */
function visibleFaces(cube: Placed[], k: number): Record<'front' | 'top' | 'right', number> {
  const m = ROTATIONS[k];
  const at = (n: V3) => cube.findIndex((f) => eq3(apply(m, f.n), n));
  return { front: at(VIEW.front.n), top: at(VIEW.top.n), right: at(VIEW.right.n) };
}

/** Wrong cubes, each breaking one thing a learner checks, with the reason. */
function cubeLures(cube: Placed[], k: number, key: CubeCell, r: Rand): Lure[] {
  const out: Lure[] = [];
  const sides = ['front', 'top', 'right'] as const;
  const seen = visibleFaces(cube, k);
  // A face swapped for the one opposite it: two opposite faces would be seen side by side.
  for (const s of sides) {
    const opp = cube[oppositeOf(cube, seen[s])];
    if (opp.sym !== key[s].sym)
      out.push({
        pic: { ...key, [s]: { sym: opp.sym, rot: key[s].rot % FACE_PERIOD[opp.sym] } },
        why: `Sisi ${describeSym(opp.sym)} berhadapan dengan sisi ${describeSym(key[s].sym)}, jadi keduanya tidak bisa terlihat bersebelahan.`,
      });
  }
  // The mirror image: two visible faces trade places.
  for (const [a, b] of [
    ['top', 'right'],
    ['front', 'right'],
    ['front', 'top'],
  ] as const)
    if (key[a].sym !== key[b].sym) out.push({ pic: { ...key, [a]: key[b], [b]: key[a] }, why: 'Urutan ketiga sisi ini terbalik seperti bayangan cermin.' });
  // An oriented symbol turned the wrong way.
  for (const s of sides)
    if (FACE_PERIOD[key[s].sym] > 1)
      out.push({
        pic: { ...key, [s]: { ...key[s], rot: (key[s].rot + pick([1, 2, 3], r)) % 4 } },
        why: `Arah ${describeSym(key[s].sym)} pada sisi ini tidak sesuai dengan jaringnya.`,
      });
  return out;
}
const describeSym = (s: FaceSymbol) => faceWords({ sym: s, rot: 0 }).replace(/ (ke|bagian|tegak|mendatar).*$/, '');

/** Cubes not the key, one change away. */
function cubePool(key: CubeCell, cube: Placed[], r: Rand): CubeCell[] {
  const syms = [...new Set(cube.map((c) => c.sym))];
  const out: CubeCell[] = [];
  for (const s of ['front', 'top', 'right'] as const) {
    for (const sym of syms) if (sym !== key[s].sym) out.push({ ...key, [s]: { sym, rot: randInt(0, 3, r) % FACE_PERIOD[sym] } });
    if (FACE_PERIOD[key[s].sym] > 1) out.push({ ...key, [s]: { ...key[s], rot: (key[s].rot + 1) % 4 } });
  }
  return out;
}

function netFromFaces(squares: { x: number; y: number }[], fs: Face[]): NetCell {
  return { kind: 'net', squares: squares.map((s, i) => ({ ...s, face: fs[i] })) };
}

function makeNetToCube(d: Difficulty, r: Rand): Draft | null {
  const shape = randomNet(r);
  const net = netFromFaces(shape, faces(d, r));
  const cube = foldNet(net)!;
  const views = allViews(cube);
  const k = randInt(0, 23, r);
  const key = viewOf(cube, k);
  // A view must show three different-looking faces, or it says little.
  if (new Set([key.front, key.top, key.right].map((f) => f.sym)).size < (d === 'mudah' ? 2 : 3)) return null;
  const valid = (c: Pic) => views.includes(picKey(c));
  const lures = cubeLures(cube, k, key, r);
  // Cubes two changes away too, so a wrong cube, not the key, can be the one most like the others.
  const pool = [...cubePool(key, cube, r), ...lures.flatMap((l) => cubePool(l.pic as CubeCell, cube, r))];
  const chosen = chooseOptions(key, lures, pool, r, valid);
  if (!chosen) return null;
  if (chosen.options.filter(valid).length !== 1) return null;
  const pairs = cube
    .map((_, i) => [i, oppositeOf(cube, i)])
    .filter(([i, j]) => i < j)
    .map(([i, j]) => `${describeSym(cube[i].sym)} ↔ ${describeSym(cube[j].sym)}`);
  return {
    stem: 'Jaring-jaring berikut dilipat menjadi sebuah kubus. Kubus manakah yang dapat dibentuk?',
    figure: { layout: 'single', cells: [net] },
    options: chosen.options,
    answerIdx: chosen.answerIdx,
    rationales: chosen.rationales,
    meta: {
      families: ['opposite', ...(net.squares.some((s) => FACE_PERIOD[s.face.sym] > 1) ? ['orientation'] : [])],
      signature: `cube-net|${netClass(shape)}|${net.squares.filter((s) => FACE_PERIOD[s.face.sym] > 1).length}`,
      complexity: 3 + 2 * net.squares.filter((s) => FACE_PERIOD[s.face.sym] > 1).length,
    },
    explanation: (ans) =>
      `Dua sisi yang berhadapan pada kubus tidak pernah terlihat bersamaan. Pada jaring ini, sisi yang terpisah satu persegi dalam satu baris atau kolom akan berhadapan. Pasangan sisi berhadapan: ${pairs.join('; ')}.${
        net.squares.some((s) => FACE_PERIOD[s.face.sym] > 1) ? ' Perhatikan juga arah gambar pada setiap sisi: arahnya ikut berputar saat sisi dilipat.' : ''
      }\n\nHanya kubus ${ans} yang susunan dan arah sisinya sesuai dengan jaring: ${describePic(key)}.`,
  };
}

/* ---------------------------------------------------- F6: cube to net */

function makeCubeToNet(d: Difficulty, r: Rand): Draft | null {
  // Six different symbols, so a net is told apart by where each one is; mudah has none that point.
  const fs = d === 'mudah' ? [...SYMMETRIC].sort(() => r() - 0.5).map((sym) => ({ sym, rot: 0 })) : faces(d, r);
  if (new Set(fs.map((f) => f.sym)).size !== 6) return null;
  const keyNet = netFromFaces(randomNet(r), fs);
  const cube = foldNet(keyNet)!;
  const shownCount = d === 'sulit' ? 2 : 1;
  const shown = [...ROTATIONS.keys()]
    .sort(() => r() - 0.5)
    .slice(0, shownCount)
    .map((k) => viewOf(cube, k));
  const fits = (n: NetCell) => {
    const c = foldNet(n);
    return !!c && shown.every((v) => canShow(c, v));
  };
  const lures: Lure[] = [];
  const sq = keyNet.squares;
  for (let a = 0; a < 6; a++)
    for (let b = a + 1; b < 6; b++) {
      const swapped = sq.map((s, i) => (i === a ? { ...s, face: sq[b].face } : i === b ? { ...s, face: sq[a].face } : s));
      lures.push({
        pic: { kind: 'net', squares: swapped },
        why: `Sisi ${describeSym(sq[a].face.sym)} dan ${describeSym(sq[b].face.sym)} tertukar tempat, sehingga kubusnya tidak sama.`,
      });
    }
  for (let a = 0; a < 6; a++)
    if (FACE_PERIOD[sq[a].face.sym] > 1)
      lures.push({
        pic: { kind: 'net', squares: sq.map((s, i) => (i === a ? { ...s, face: { ...s.face, rot: (s.face.rot + pick([1, 2, 3], r)) % 4 } } : s)) },
        why: `Arah ${describeSym(sq[a].face.sym)} pada jaring ini membuat arahnya di kubus berbeda.`,
      });
  // The same cube unfolded into another net is also right: such nets are never offered as wrong.
  const wrong = lures.filter((l) => !fits(l.pic as NetCell));
  // Wrong nets of other shapes, so the shape alone gives nothing away.
  for (let t = 0; t < 6; t++) {
    const shape = randomNet(r);
    const shuffled = [...fs].sort(() => r() - 0.5);
    const n = netFromFaces(shape, shuffled);
    if (!fits(n)) wrong.push({ pic: n, why: 'Bila jaring ini dilipat, susunan sisinya tidak cocok dengan kubus pada soal.' });
  }
  // Nets two swaps away, so the key is not simply the net all the others were made from.
  const twice: Pic[] = [];
  for (const l of wrong.slice(0, 8)) {
    const q = (l.pic as NetCell).squares;
    const a = randInt(0, 5, r);
    const b = (a + randInt(1, 5, r)) % 6;
    twice.push({ kind: 'net', squares: q.map((x, i) => (i === a ? { ...x, face: q[b].face } : i === b ? { ...x, face: q[a].face } : x)) });
  }
  const chosen = chooseOptions(keyNet, wrong.slice(0, 12), twice, r, (p) => fits(p as NetCell));
  if (!chosen) return null;
  if (chosen.options.filter((o) => fits(o as NetCell)).length !== 1) return null;
  return {
    stem:
      shownCount === 1
        ? 'Jaring-jaring manakah yang dapat dilipat menjadi kubus berikut?'
        : 'Kedua gambar berikut adalah kubus yang sama dilihat dari arah berbeda. Jaring-jaring manakah yang dapat dilipat menjadi kubus itu?',
    figure: { layout: 'views', cells: shown },
    options: chosen.options,
    answerIdx: chosen.answerIdx,
    rationales: chosen.rationales,
    meta: {
      families: ['opposite', 'orientation'],
      signature: `cube-to-net|${netClass(keyNet.squares)}|${shownCount}|${fs.filter((f) => FACE_PERIOD[f.sym] > 1).length}`,
      complexity: 4 + shownCount + fs.filter((f) => FACE_PERIOD[f.sym] > 1).length,
    },
    explanation: (ans) =>
      `Lipat setiap jaring dalam pikiran: mulai dari sisi depan kubus, lalu periksa sisi yang bersebelahan dan arah gambarnya. Sisi yang terpisah satu persegi dalam satu baris atau kolom jaring akan berhadapan, sehingga tidak boleh terlihat bersamaan pada kubus.\n\nHanya jaring ${ans} yang menghasilkan ${shownCount === 1 ? 'kubus' : 'kedua pandangan kubus'} pada soal.`,
  };
}

/* ---------------------------------------------- F7: which face is opposite */

const OPP_SYMS: FaceSymbol[] = ['dot', 'circle', 'cross', 'xcross', 'diamond', 'black', 'star'];

function makeOpposite(d: Difficulty, r: Rand): Draft | null {
  const syms = [...OPP_SYMS].sort(() => r() - 0.5).slice(0, 6);
  const fs = syms.map((sym) => ({ sym, rot: 0 }));
  const net = netFromFaces(randomNet(r), fs);
  const cube = foldNet(net)!;
  const nViews = d === 'mudah' ? 3 : d === 'sedang' ? 3 : 2;
  const shown = [...ROTATIONS.keys()]
    .sort(() => r() - 0.5)
    .slice(0, nViews)
    .map((k) => viewOf(cube, k));
  if (new Set(shown.map(picKey)).size < nViews) return null;
  const target = pick(syms, r);
  const answerSym =
    cube[
      oppositeOf(
        cube,
        cube.findIndex((f) => f.sym === target),
      )
    ].sym;
  // Every labelling of a cube with these symbols that shows the same views must agree on the answer.
  const opposites = new Set<string>();
  const wanted = shown.map(picKey);
  for (const perm of permutations(syms)) {
    const c: Placed[] = cube.map((f, i) => ({ ...f, sym: perm[i], up: f.up }));
    // Quick test first: faces seen together are never opposite each other.
    const opp = (a: FaceSymbol, b: FaceSymbol) =>
      c[
        oppositeOf(
          c,
          c.findIndex((f) => f.sym === a),
        )
      ].sym === b;
    if (shown.some((v) => opp(v.front.sym, v.top.sym) || opp(v.front.sym, v.right.sym) || opp(v.top.sym, v.right.sym))) continue;
    const views = allViews(c);
    if (!wanted.every((w) => views.includes(w))) continue;
    opposites.add(
      c[
        oppositeOf(
          c,
          c.findIndex((f) => f.sym === target),
        )
      ].sym,
    );
  }
  if (opposites.size !== 1) return null;
  // Mudah: the target is in every view; sulit: it has to be worked out.
  const seen = shown.filter((v) => [v.front, v.top, v.right].some((f) => isFace(f, target))).length;
  if (d === 'mudah' && seen < 2) return null;
  if (d === 'sulit' && seen > 1) return null;
  const options: FaceCell[] = syms.filter((s) => s !== target).map((s) => ({ kind: 'face', face: { sym: s, rot: 0 } }));
  options.sort(() => r() - 0.5);
  const answerIdx = options.findIndex((o) => o.face.sym === answerSym);
  const neighbours = (s: FaceSymbol) =>
    shown.flatMap((v, i) => ([v.front, v.top, v.right].some((f) => isFace(f, target)) && [v.front, v.top, v.right].some((f) => isFace(f, s)) ? [i + 1] : []));
  return {
    stem: `Gambar-gambar berikut adalah satu kubus yang dilihat dari arah berbeda. Sisi manakah yang berhadapan dengan sisi ${describeSym(target)}?`,
    figure: { layout: 'views', cells: shown },
    options,
    answerIdx,
    rationales: options.map((o, i) => {
      if (i === answerIdx) return undefined;
      const at = neighbours(o.face.sym);
      return at.length
        ? `Sisi ini terlihat bersebelahan dengan sisi ${describeSym(target)} pada gambar ${at.join(' dan ')}, jadi tidak berhadapan.`
        : 'Sisi ini bersebelahan dengan sisi yang ditanyakan bila ketiga gambar dicocokkan.';
    }),
    // How many of the face's neighbours the views show: four means it can be read off, fewer means reasoning.
    meta: {
      families: ['opposite'],
      signature: `cube-opposite|${nViews}|seen${Math.min(seen, 2)}|n${syms.filter((x) => x !== target && neighbours(x).length).length}`,
      complexity: d === 'mudah' ? 3 : d === 'sedang' ? 4 : 6,
    },
    explanation: (ans) =>
      `Sisi yang berhadapan tidak pernah terlihat bersamaan. Kumpulkan sisi-sisi yang pernah terlihat bersebelahan dengan sisi ${describeSym(target)}: ${syms
        .filter((s) => s !== target && neighbours(s).length)
        .map(describeSym)
        .join(
          ', ',
        )}.${seen < 2 ? ' Sisa sisi lain ditentukan dengan mencocokkan letak sisi pada gambar-gambar itu.' : ''}\n\nSisi yang tidak pernah bersebelahan dengannya adalah ${describeSym(answerSym)} (${ans}).`,
  };
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}

/* ---------------------------------------------------------------- recipes */

function verifyNetToCube(q: Question): boolean {
  const net = q.figure?.cells[0] as NetCell | undefined;
  const cube = net && foldNet(net);
  if (!cube) return false;
  const valid = q.options.map((o) => canShow(cube, o.figure as CubeCell));
  return valid.filter(Boolean).length === 1 && valid[q.options.findIndex((o) => o.label === q.answer)];
}
function verifyCubeToNet(q: Question): boolean {
  const shown = (q.figure?.cells ?? []) as CubeCell[];
  const fits = q.options.map((o) => {
    const c = foldNet(o.figure as NetCell);
    return !!c && shown.every((v) => canShow(c, v));
  });
  return fits.filter(Boolean).length === 1 && fits[q.options.findIndex((o) => o.label === q.answer)];
}

export const CUBE_ARCHETYPES: Archetype[] = [
  {
    id: 'cube-net',
    topic: 'Ruang dan Kubus',
    name: 'Jaring menjadi kubus',
    about: 'Lipat jaring-jaring dalam pikiran dan pilih kubus yang bisa terbentuk.',
    families: [],
    levels: ['mudah', 'sedang', 'sulit'],
    make: (d, r) => makeNetToCube(d, r),
    verify: (q) => verifyDistinct(q) && verifyNetToCube(q),
  },
  {
    id: 'cube-to-net',
    topic: 'Ruang dan Kubus',
    name: 'Kubus menjadi jaring',
    about: 'Pilih jaring-jaring yang bila dilipat menjadi kubus pada gambar.',
    families: [],
    levels: ['mudah', 'sedang', 'sulit'],
    make: (d, r) => makeCubeToNet(d, r),
    verify: (q) => verifyDistinct(q) && verifyCubeToNet(q),
  },
  {
    id: 'cube-opposite',
    topic: 'Ruang dan Kubus',
    name: 'Sisi berhadapan',
    about: 'Dari beberapa pandangan satu kubus, tentukan sisi yang berhadapan.',
    families: [],
    levels: ['mudah', 'sedang', 'sulit'],
    make: (d, r) => makeOpposite(d, r),
    verify: verifyDistinct,
  },
];
