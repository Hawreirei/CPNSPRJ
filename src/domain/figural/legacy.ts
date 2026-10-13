import { describeCell, FILL_NAMES, SHAPE_NAMES } from '../describe';
import { dirName, norm, picKey } from '../pic';
import type { Difficulty, FigureCell, Fill, Pic, Question, ShapeKind } from '../types';
import { chance, chooseOptions, pick, randInt, stemFor, toQuestion, type Archetype, type Draft, type Lure, type Rand } from './build';
import { picDistance, picFeats, termFeats } from './features';
import { judgeAnalogy, judgeMatrix, judgeSeries, oddOnes } from './solver';

export { describeCell, describeFigure } from '../describe';
export type { Rand };

/*
 * The first kind of figural picture: one shape drawn 1–6 times, with a fill and a direction.
 * Each recipe below draws rules with random settings, checks the result with the solver
 * (solver.ts) and picks wrong options from the mistakes a learner would make.
 */

const SHAPES: ShapeKind[] = ['circle', 'square', 'triangle', 'diamond', 'star', 'arrow', 'pentagon', 'hexagon'];
const PLAIN_SHAPES = SHAPES.filter((s) => s !== 'arrow');
const FILLS: Fill[] = ['solid', 'empty', 'striped', 'dotted'];
const BY_SIDES: Record<number, ShapeKind> = { 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon' };

/** Whether two cells look the same on screen. */
export function looksSame(a: FigureCell, b: FigureCell): boolean {
  return picKey(a) === picKey(b);
}
export const cellKey = (c: FigureCell) => picKey(c);
export const cellDistance = (a: FigureCell, b: FigureCell) => picDistance(a, b);

type Attr = 'shape' | 'fill' | 'count' | 'rot';
const ATTR_LABEL: Record<Attr, string> = { shape: 'bentuk', fill: 'arsiran', count: 'jumlah bangun', rot: 'arah panah' };
type V = string | number;

function setAttr(c: FigureCell, a: Attr, v: V): FigureCell {
  if (a === 'shape') return { ...c, shape: typeof v === 'number' ? BY_SIDES[v] : (v as ShapeKind) };
  if (a === 'fill') return { ...c, fill: v as Fill };
  if (a === 'count') return { ...c, count: v as number };
  return { ...c, rotation: norm(v as number) };
}
function word(a: Attr, v: V): string {
  if (a === 'shape') return typeof v === 'number' ? `${SHAPE_NAMES[BY_SIDES[v]]} (${v} sisi)` : SHAPE_NAMES[v as ShapeKind];
  if (a === 'fill') return FILL_NAMES[v as Fill];
  if (a === 'count') return `${v}`;
  return dirName(v as number);
}
const valid = (a: Attr, v: V) => (a === 'count' ? (v as number) >= 1 && (v as number) <= 6 : a === 'shape' && typeof v === 'number' ? !!BY_SIDES[v] : true);
const turnWords = (d: number) => `${Math.abs(d)}° ${d > 0 ? 'searah' : 'berlawanan arah'} jarum jam`;
const signed = (a: Attr, d: number) => (a === 'rot' ? `berputar ${turnWords(d)}` : `${d > 0 ? 'bertambah' : 'berkurang'} ${Math.abs(d)}`);

/** Cells that differ from `c` in one property. */
function mutations(c: FigureCell, r: Rand): FigureCell[] {
  const out: FigureCell[] = [
    {
      ...c,
      fill: pick(
        FILLS.filter((f) => f !== c.fill),
        r,
      ),
    },
    { ...c, count: c.count < 6 ? c.count + 1 : c.count - 1 },
    { ...c, count: c.count > 1 ? c.count - 1 : c.count + 2 },
  ];
  if (c.shape === 'arrow' || c.shape === 'triangle') out.push({ ...c, rotation: norm(c.rotation + 90) }, { ...c, rotation: norm(c.rotation + 180) });
  const shape = pick(
    SHAPES.filter((s) => s !== c.shape),
    r,
  );
  out.push({ ...c, shape, rotation: shape === 'arrow' || shape === 'triangle' ? c.rotation : 0 });
  return out.filter((x) => picKey(x) !== picKey(c));
}
/**
 * Near misses and near misses of near misses. With `around`, also near misses of those pictures
 * (the lures), so that a lure, not the key, can sit in the middle of the options.
 */
function mutationPool(c: FigureCell, r: Rand, around: Pic[] = []): FigureCell[] {
  const one = mutations(c, r);
  const lureNear = around.flatMap((l) => mutations(l as FigureCell, r).filter((y) => picDistance(y, c) === 2));
  return [...one, ...lureNear, ...one.flatMap((x) => mutations(x, r).filter((y) => picDistance(y, c) === 2))];
}

/* ----------------------------------------------------------------- series */

interface Track {
  attr: Attr;
  family: string;
  /** The rule's settings without the random looks, for the pattern signature. */
  param: string;
  values: V[];
  rule: string;
  c: number;
  /** Values a learner would give the "?" by misreading this rule, and why. */
  lures: { v: V; why: string }[];
}

function seriesTrack(attr: Attr, n: number, m: number, d: Difficulty, r: Rand, families: string[]): Track | null {
  const fam = pick(families, r);
  const values: V[] = [];
  const prev = (vals: V[]) => vals[m - 1] ?? vals[m + 1];
  if (attr === 'fill' || (attr === 'shape' && fam !== 'sides')) {
    // Repeats every p terms, in a random order.
    const p = fam === 'repeat3' ? 3 : 2;
    const pool = attr === 'fill' ? FILLS : PLAIN_SHAPES;
    const cyc = [...pool].sort(() => r() - 0.5).slice(0, p) as V[];
    for (let i = 0; i < n; i++) values.push(cyc[i % p]);
    return {
      attr,
      family: 'repeat',
      param: `p${p}`,
      values,
      rule: `${ATTR_LABEL[attr]} berulang setiap ${p} gambar: ${cyc.map((v) => word(attr, v)).join(' → ')} → …`,
      c: p,
      lures: cyc.filter((v) => v !== values[m]).map((v) => ({ v, why: `Ini terjadi bila urutan ${ATTR_LABEL[attr]} yang berulang salah dihitung.` })),
    };
  }
  if (attr === 'shape') {
    // Number of sides goes up or down by one.
    const dir = chance(0.5, r) ? 1 : -1;
    const start = dir > 0 ? randInt(3, 6 - (n - 1), r) : randInt(3 + (n - 1), 6, r);
    for (let i = 0; i < n; i++) values.push(start + dir * i);
    if (!values.every((v) => valid('shape', v))) return null;
    return {
      attr,
      family: 'sides',
      param: `${dir}`,
      values,
      rule: `jumlah sisi bangun ${dir > 0 ? 'bertambah' : 'berkurang'} satu setiap langkah`,
      c: 1,
      lures: [
        { v: (values[m] as number) + dir, why: 'Ini terjadi bila sisi bangun ditambah dua kali.' },
        { v: prev(values) as number, why: 'Ini sama dengan gambar di sebelahnya, padahal jumlah sisinya harus berubah.' },
      ],
    };
  }
  const isRot = attr === 'rot';
  const steps = isRot ? (d === 'mudah' ? [90, -90] : [45, -45, 90, -90, 135, -135]) : d === 'mudah' ? [1, -1] : [1, -1, 2, -2];
  const domain = (v: number) => (isRot ? true : v >= 1 && v <= 6);
  if (fam === 'step') {
    const dd = pick(steps, r);
    const start = isRot ? pick([0, 45, 90, 135, 180, 225, 270, 315], r) : randInt(1, 6, r);
    for (let i = 0; i < n; i++) values.push(isRot ? norm(start + dd * i) : start + dd * i);
    if (!values.every((v) => domain(v as number))) return null;
    const p = prev(values) as number;
    const sign = m > 0 ? 1 : -1;
    return {
      attr,
      family: isRot ? 'rotate' : 'step',
      param: `${dd}`,
      values,
      rule: `${ATTR_LABEL[attr]} ${signed(attr, dd)} setiap langkah`,
      c: 1,
      lures: [
        { v: isRot ? norm(p - sign * dd) : p - sign * dd, why: `Ini terjadi bila perubahannya dibalik: ${ATTR_LABEL[attr]} seharusnya ${signed(attr, dd)}.` },
        { v: p, why: 'Ini sama dengan gambar di sebelahnya, padahal polanya terus berubah.' },
        { v: isRot ? norm(p + sign * 2 * dd) : p + sign * 2 * dd, why: 'Ini terjadi bila perubahannya diterapkan dua kali.' },
        ...(isRot ? [{ v: norm(p + sign * (dd + (dd > 0 ? 45 : -45))), why: 'Ini terjadi bila besar putarannya salah ditaksir.' }] : []),
      ],
    };
  }
  if (fam === 'alternate') {
    const d0 = pick(steps, r);
    const d1 = pick(
      [0, ...steps].filter((x) => x !== d0 && x !== -d0),
      r,
    );
    const start = isRot ? pick([0, 90, 180, 270], r) : randInt(1, 6, r);
    values.push(start);
    for (let i = 1; i < n; i++) values.push(isRot ? norm((values[i - 1] as number) + (i % 2 ? d0 : d1)) : (values[i - 1] as number) + (i % 2 ? d0 : d1));
    if (!values.every((v) => domain(v as number))) return null;
    const p = prev(values) as number;
    const other = m % 2 ? d1 : d0;
    const say = (x: number) => (x === 0 ? 'tetap' : signed(attr, x));
    return {
      attr,
      family: 'alternate',
      param: `${d0}/${d1}`,
      values,
      rule: `${ATTR_LABEL[attr]} bergantian: ${say(d0)}, lalu ${say(d1)}, dan seterusnya`,
      c: 3,
      lures: [{ v: m > 0 ? (isRot ? norm(p + other) : p + other) : values[1], why: 'Ini terjadi bila hanya satu besar langkah yang dipakai; langkahnya bergantian.' }],
    };
  }
  if (fam === 'interleave') {
    // Odd and even terms are two series of their own.
    const e = pick(steps, r);
    const o = chance(0.5, r) ? 0 : pick(steps, r);
    const s0 = isRot ? pick([0, 90, 180, 270], r) : randInt(1, 6, r);
    const s1 = isRot ? pick([0, 90, 180, 270], r) : randInt(1, 6, r);
    for (let i = 0; i < n; i++) {
      const v = (i % 2 ? s1 : s0) + Math.floor(i / 2) * (i % 2 ? o : e);
      values.push(isRot ? norm(v) : v);
    }
    if (!values.every((v) => domain(v as number))) return null;
    const own = m % 2 ? o : e;
    return {
      attr,
      family: 'interleave',
      param: `${e}/${o}`,
      values,
      rule: `gambar urutan ganjil dan genap membentuk dua deret sendiri: pada urutan ganjil ${ATTR_LABEL[attr]} ${e ? signed(attr, e) : 'tetap'}, pada urutan genap ${o ? signed(attr, o) : 'tetap'}`,
      c: 2 + +(e !== 0) + +(o !== 0),
      lures: [
        { v: prev(values), why: 'Ini terjadi bila gambar dibandingkan dengan tetangganya. Bandingkan dengan gambar dua langkah sebelumnya.' },
        { v: isRot ? norm((values[m] as number) + own) : (values[m] as number) + own, why: 'Ini terjadi bila perubahannya diterapkan sekali terlalu banyak.' },
      ],
    };
  }
  // Repeats every 2 or 3.
  const p = fam === 'repeat3' ? 3 : 2;
  const pool = isRot ? [0, 90, 180, 270, 45, 135] : [1, 2, 3, 4, 5];
  const cyc = [...pool].sort(() => r() - 0.5).slice(0, p);
  for (let i = 0; i < n; i++) values.push(cyc[i % p]);
  return {
    attr,
    family: 'repeat',
    param: `p${p}`,
    values,
    rule: `${ATTR_LABEL[attr]} berulang setiap ${p} gambar: ${cyc.map((v) => word(attr, v)).join(' → ')} → …`,
    c: p,
    lures: cyc.filter((v) => v !== values[m]).map((v) => ({ v, why: `Ini terjadi bila urutan ${ATTR_LABEL[attr]} yang berulang salah dihitung.` })),
  };
}

const SERIES_FAMILIES: Record<Difficulty, string[]> = {
  mudah: ['step', 'repeat2'],
  sedang: ['step', 'repeat2', 'repeat3', 'alternate'],
  sulit: ['step', 'repeat3', 'alternate', 'interleave'],
};

function traceOf(tracks: Track[], n: number, m: number) {
  return tracks.map((t) => ({
    label: ATTR_LABEL[t.attr === 'shape' && typeof t.values[0] === 'number' ? 'shape' : t.attr],
    values: Array.from({ length: n }, (_, i) => (i === m ? `? = ${word(t.attr, t.values[i])}` : word(t.attr, t.values[i]))),
  }));
}

function makeSeries(d: Difficulty, r: Rand, want?: string[]): Draft | null {
  const nTracks = d === 'mudah' ? 1 : d === 'sedang' ? randInt(1, 2, r) : randInt(2, 3, r);
  const attrs = (['count', 'fill', chance(0.5, r) ? 'rot' : 'shape'] as Attr[]).sort(() => r() - 0.5).slice(0, nTracks);
  const families = want?.length ? want : SERIES_FAMILIES[d];
  const sides = attrs.includes('shape') && families.includes('sides') && chance(0.5, r);
  const n = sides ? 4 : d === 'mudah' ? 5 : d === 'sedang' ? randInt(5, 6, r) : randInt(6, 7, r);
  const m = d !== 'mudah' && chance(d === 'sulit' ? 0.5 : 0.3, r) ? randInt(2, n - 2, r) : n - 1;
  const tracks: Track[] = [];
  for (const a of attrs) {
    const fams =
      a === 'shape'
        ? sides
          ? ['sides']
          : families.filter((f) => f.startsWith('repeat')).concat('repeat2')
        : a === 'fill'
          ? families.filter((f) => f.startsWith('repeat')).concat('repeat2')
          : families;
    const t = seriesTrack(
      a,
      n,
      m,
      d,
      r,
      fams.filter((f) => f !== 'sides' || a === 'shape'),
    );
    if (!t) return null;
    tracks.push(t);
  }
  // Wanting a level means at least one rule that hard.
  if (d === 'sulit' && !tracks.some((t) => t.c >= 2)) return null;
  const base: FigureCell = {
    shape: attrs.includes('rot') ? 'arrow' : pick(PLAIN_SHAPES, r),
    fill: pick(FILLS, r),
    count: attrs.includes('rot') ? 1 : randInt(1, 3, r),
    rotation: 0,
  };
  const cells = Array.from({ length: n }, (_, i) => tracks.reduce((c, t) => setAttr(c, t.attr, t.values[i]), base));
  const key = cells[m];
  const seq = cells.map((c, i) => (i === m ? null : c));
  const lures: Lure[] = tracks.flatMap((t) => t.lures.filter((l) => valid(t.attr, l.v)).map((l) => ({ pic: setAttr(key, t.attr, l.v), why: l.why })));
  const pool = mutationPool(
    key,
    r,
    lures.map((l) => l.pic),
  );
  const cands = [...lures.map((l) => l.pic), ...pool];
  const verdict = judgeSeries<Pic>(seq, [key, ...cands], 0, termFeats);
  if (!verdict.defensible[0]) return null;
  const supported = new Set(cands.filter((_, i) => verdict.defensible[i + 1]).map(picKey));
  const chosen = chooseOptions(key, lures, pool, r, (p) => supported.has(picKey(p)));
  if (!chosen) return null;
  const final = judgeSeries<Pic>(seq, chosen.options, chosen.answerIdx, termFeats);
  if (!final.ok) return null;
  const meta = {
    families: [...new Set(tracks.map((t) => t.family))],
    signature: `glyph-series|n${n}|m${m === n - 1 ? 'end' : 'mid'}|${tracks
      .map((t) => `${t.attr}:${t.family}:${t.param}`)
      .sort()
      .join('|')}`,
    complexity: final.complexity + +(m !== n - 1),
    tracks: traceOf(tracks, n, m),
  };
  return {
    stem: stemFor(m === n - 1 ? 'series' : 'series-mid', r),
    figure: { layout: 'series', cells: seq },
    options: chosen.options,
    answerIdx: chosen.answerIdx,
    rationales: chosen.rationales,
    meta,
    explanation: (answer) =>
      `Pola: ${tracks.map((t) => t.rule).join('; ')}.\n\n${tracks.map((t) => `${ATTR_LABEL[t.attr]}: ${t.values.map((v, i) => (i === m ? '?' : word(t.attr, v))).join(' → ')}`).join('\n')}\n\nJadi gambar ke-${m + 1} adalah ${describeCell(key)} (${answer}).`,
  };
}

/* ---------------------------------------------------------------- analogy */

interface Change {
  attr: Attr;
  family: string;
  param: string;
  /** a → b, c → d. */
  a: V;
  b: V;
  c: V;
  d: V;
  rule: string;
  lures: { v: V; why: string }[];
}

function analogyChange(attr: Attr, diff: Difficulty, r: Rand): Change | null {
  if (attr === 'count' || attr === 'rot') {
    const isRot = attr === 'rot';
    const step = isRot ? pick(diff === 'mudah' ? [90, -90, 180] : [45, -45, 90, -90, 135, -135, 180], r) : pick(diff === 'mudah' ? [1, -1] : [1, -1, 2, -2, 3], r);
    const a = isRot ? pick([0, 45, 90, 135, 180, 225, 270, 315], r) : randInt(1, 6, r);
    const c = isRot ? pick([0, 90, 180, 270], r) : randInt(1, 6, r);
    const at = (x: number) => (isRot ? norm(x) : x);
    const ch: Change = {
      attr,
      family: isRot ? 'rotate' : 'step',
      param: `${step}`,
      a,
      b: at(a + step),
      c,
      d: at(c + step),
      rule: `${ATTR_LABEL[attr]} ${signed(attr, step)}`,
      lures: [
        { v: at(c - step), why: `Perubahannya terbalik: ${ATTR_LABEL[attr]} seharusnya ${signed(attr, step)}.` },
        { v: c, why: `${ATTR_LABEL[attr]} tidak diubah, padahal pada pasangan pertama ${ATTR_LABEL[attr]} ${signed(attr, step)}.` },
        ...(!isRot && c !== a ? [{ v: at(a + step), why: `Ini meniru ${ATTR_LABEL[attr]} gambar kedua, bukan menerapkan perubahannya.` }] : []),
      ],
    };
    return valid(attr, ch.b) && valid(attr, ch.d) && ch.a !== ch.b ? ch : null;
  }
  const pool = attr === 'fill' ? FILLS : PLAIN_SHAPES;
  const [a, b, x] = [...pool].sort(() => r() - 0.5);
  const kinds = diff === 'mudah' ? ['map'] : diff === 'sedang' ? ['map', 'result'] : ['map', 'result', 'swap'];
  const kind = pick(kinds, r);
  const name = ATTR_LABEL[attr];
  if (kind === 'map')
    return {
      attr,
      family: 'map',
      param: 'map',
      a,
      b,
      c: a,
      d: b,
      rule: `${name} ${word(attr, a)} berubah menjadi ${word(attr, b)}`,
      lures: [
        { v: a, why: `${name} tidak diubah, padahal ${word(attr, a)} berubah menjadi ${word(attr, b)}.` },
        { v: x, why: `${name} berubah, tetapi tidak menjadi ${word(attr, b)}.` },
      ],
    };
  if (kind === 'result')
    return {
      attr,
      family: 'map',
      param: 'result',
      a,
      b,
      c: x,
      d: b,
      rule: `${name} selalu menjadi ${word(attr, b)}`,
      lures: [
        { v: x, why: `${name} tidak diubah, padahal hasilnya selalu ${word(attr, b)}.` },
        { v: a, why: `Ini meniru ${name} gambar pertama.` },
      ],
    };
  return {
    attr,
    family: 'swap',
    param: 'swap',
    a,
    b,
    c: b,
    d: a,
    rule: `${name} ${word(attr, a)} dan ${word(attr, b)} saling bertukar`,
    lures: [
      { v: b, why: `${name} tidak diubah, padahal ${word(attr, a)} dan ${word(attr, b)} bertukar.` },
      { v: x, why: `${name} berubah, tetapi bukan menjadi pasangannya.` },
    ],
  };
}

function makeAnalogy(diff: Difficulty, r: Rand, want?: string[]): Draft | null {
  const k = diff === 'mudah' ? 1 : diff === 'sedang' ? 2 : randInt(2, 3, r);
  const attrs = (['count', 'fill', chance(0.5, r) ? 'rot' : 'shape'] as Attr[]).sort(() => r() - 0.5).slice(0, k);
  const changes: Change[] = [];
  for (const a of attrs) {
    const ch = analogyChange(a, diff, r);
    if (!ch) return null;
    changes.push(ch);
  }
  if (want?.length && !changes.some((c) => want.includes(c.family))) return null;
  // What does not change still differs between the pairs, so the third figure is not a copy of the first.
  const shape = attrs.includes('rot') ? 'arrow' : pick(PLAIN_SHAPES, r);
  const base1: FigureCell = { shape, fill: pick(FILLS, r), count: randInt(1, 3, r), rotation: 0 };
  const base2: FigureCell = { ...base1 };
  const still = (['count', 'fill', 'shape'] as Attr[]).filter((a) => !attrs.includes(a) && !(a === 'shape' && attrs.includes('rot')));
  if (still.length) {
    const a = pick(still, r);
    const v = a === 'count' ? randInt(1, 4, r) : a === 'fill' ? pick(FILLS, r) : pick(PLAIN_SHAPES, r);
    Object.assign(base2, setAttr(base2, a, v));
  }
  const apply = (c: FigureCell, which: 'a' | 'b' | 'c' | 'd') => changes.reduce((x, ch) => setAttr(x, ch.attr, ch[which]), c);
  const A = apply(base1, 'a');
  const B = apply(base1, 'b');
  const C = apply(base2, 'c');
  const D = apply(base2, 'd');
  if (picKey(A) === picKey(C) && changes.length === 1) return null;
  const lures: Lure[] = changes.flatMap((ch) => ch.lures.filter((l) => valid(ch.attr, l.v)).map((l) => ({ pic: setAttr(D, ch.attr, l.v), why: l.why })));
  const pool = mutationPool(
    D,
    r,
    lures.map((l) => l.pic),
  );
  const cands = [...lures.map((l) => l.pic), ...pool];
  const v = judgeAnalogy<Pic>([[A, B]], C, [D, ...cands], 0, picFeats);
  if (!v.defensible[0]) return null;
  const supported = new Set(cands.filter((_, i) => v.defensible[i + 1]).map(picKey));
  const chosen = chooseOptions(D, lures, pool, r, (p) => supported.has(picKey(p)));
  if (!chosen) return null;
  const final = judgeAnalogy<Pic>([[A, B]], C, chosen.options, chosen.answerIdx, picFeats);
  if (!final.ok) return null;
  return {
    stem: stemFor('analogy', r),
    figure: { layout: 'analogy', cells: [A, B, C, null] },
    options: chosen.options,
    answerIdx: chosen.answerIdx,
    rationales: chosen.rationales,
    meta: {
      families: [...new Set(changes.map((c) => c.family))],
      signature: `glyph-analogy|${changes
        .map((c) => `${c.attr}:${c.family}:${c.param}`)
        .sort()
        .join('|')}`,
      complexity: final.complexity + changes.length,
      tracks: changes.map((c) => ({ label: ATTR_LABEL[c.attr], values: [word(c.attr, c.a), word(c.attr, c.b), word(c.attr, c.c), `? = ${word(c.attr, c.d)}`] })),
    },
    explanation: (answer) =>
      `Hubungan gambar 1 → gambar 2: ${changes.map((c) => c.rule).join('; ')}.${still.length ? ' Sifat lain tidak berubah.' : ''}\n\nTerapkan pada gambar 3 (${describeCell(C)}), hasilnya ${describeCell(D)} (${answer}).`,
  };
}

/* ------------------------------------------------------------- matrix 3×3 */

type Placement = 'row' | 'col' | 'latinA' | 'latinB' | 'step';
interface Dim {
  attr: Attr;
  place: Placement;
  values: V[];
}
const indexOf = (p: Placement, i: number, j: number) => (p === 'row' ? i : p === 'col' ? j : p === 'latinA' ? (i + j) % 3 : p === 'latinB' ? (2 * i + j) % 3 : i + j);

function threeValues(attr: Attr, r: Rand): V[] {
  if (attr === 'shape') return [...PLAIN_SHAPES].sort(() => r() - 0.5).slice(0, 3);
  if (attr === 'fill') return [...FILLS].sort(() => r() - 0.5).slice(0, 3);
  if (attr === 'count') return [1, 2, 3];
  return [0, 90, 180];
}

/** The matrix cell at row i, column j. */
export function dimCell(base: FigureCell, dims: Dim[], i: number, j: number): FigureCell {
  return dims.reduce((c, d) => setAttr(c, d.attr, d.values[indexOf(d.place, i, j)]), base);
}

function describeDim(d: Dim): string {
  const name = ATTR_LABEL[d.attr];
  const list = d.values.map((v) => word(d.attr, v)).join(', ');
  if (d.place === 'row') return `${name} sama dalam setiap baris (baris 1 sampai 3: ${list})`;
  if (d.place === 'col') return `${name} sama dalam setiap kolom (kolom 1 sampai 3: ${list})`;
  if (d.place === 'step') return `${name} bertambah satu ke kanan dan ke bawah`;
  return `setiap baris dan setiap kolom memuat ketiga ${name} (${list}) masing-masing satu kali`;
}

function makeMatrix(diff: Difficulty, r: Rand): Draft | null {
  const attrs = (['shape', 'fill', 'count'] as Attr[]).sort(() => r() - 0.5);
  if (chance(0.3, r)) attrs[0] = 'rot';
  const plans: Placement[][] =
    diff === 'mudah'
      ? [
          ['row', 'col'],
          ['col', 'row'],
        ]
      : diff === 'sedang'
        ? [
            ['row', 'latinA'],
            ['col', 'latinA'],
            ['step', 'row'],
            ['step', 'latinA'],
          ]
        : [
            ['latinA', 'latinB'],
            ['latinA', 'latinB', 'row'],
            ['latinA', 'latinB', 'col'],
            ['step', 'latinA', 'latinB'],
          ];
  const plan = pick(plans, r);
  const dims: Dim[] = plan.map((place, k) => {
    const attr = place === 'step' ? 'count' : attrs[k] === 'count' && plan.includes('step') ? 'fill' : attrs[k];
    const values = place === 'step' ? [1, 2, 3, 4, 5].slice(0, 5) : threeValues(attr, r);
    return { attr, place, values };
  });
  if (new Set(dims.map((d) => d.attr)).size !== dims.length) return null;
  const rotates = dims.some((d) => d.attr === 'rot');
  const base: FigureCell = { shape: rotates ? 'arrow' : pick(PLAIN_SHAPES, r), fill: pick(FILLS, r), rotation: 0, count: rotates ? 1 : randInt(1, 2, r) };
  const cells = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => dimCell(base, dims, i, j)));
  const key = cells[8];
  const lures: Lure[] = dims.flatMap((d) =>
    d.values
      .filter((v) => v !== key[d.attr === 'rot' ? 'rotation' : d.attr])
      .slice(0, 3)
      .map((v) => ({ pic: setAttr(key, d.attr, v), why: `${ATTR_LABEL[d.attr]} gambar ini sudah dipakai di baris atau kolom yang sama, atau tidak mengikuti urutannya.` })),
  );
  const pool = mutationPool(
    key,
    r,
    lures.map((l) => l.pic),
  );
  const visible = [...cells.slice(0, 8), null];
  const cands = [...lures.map((l) => l.pic), ...pool];
  const v = judgeMatrix<Pic>(visible, [key, ...cands], 0, picFeats);
  if (!v.defensible[0]) return null;
  const supported = new Set(cands.filter((_, i) => v.defensible[i + 1]).map(picKey));
  const chosen = chooseOptions(key, lures, pool, r, (p) => supported.has(picKey(p)));
  if (!chosen) return null;
  const final = judgeMatrix<Pic>(visible, chosen.options, chosen.answerIdx, picFeats);
  if (!final.ok) return null;
  return {
    stem: stemFor('matrix', r),
    figure: { layout: 'matrix', cells: visible },
    options: chosen.options,
    answerIdx: chosen.answerIdx,
    rationales: chosen.rationales,
    meta: {
      families: [...new Set(dims.map((d) => (d.place.startsWith('latin') ? 'latin' : d.place)))],
      signature: `glyph-matrix|${dims
        .map((d) => `${d.attr}:${d.place}`)
        .sort()
        .join('|')}`,
      complexity: final.complexity,
      tracks: [0, 1, 2].map((i) => ({ label: `Baris ${i + 1}`, values: [0, 1, 2].map((j) => (i === 2 && j === 2 ? `? = ${describeCell(key)}` : describeCell(cells[i * 3 + j]))) })),
    },
    explanation: (answer) => `Pola: ${dims.map(describeDim).join('; ')}.\n\nJadi gambar di baris ketiga, kolom ketiga adalah ${describeCell(key)} (${answer}).`,
  };
}

/* --------------------------------------------------------- rotate and mirror */

/**
 * Turns and mirrors of the arrow. The arrow is symmetric about its own axis, so every mirror image
 * of it is again the arrow at some angle: mirroring left-right turns angle θ into −θ, and
 * top-bottom into 180° − θ.
 */
export const TRANSFORMS = {
  rot45: { name: 'diputar 45° searah jarum jam', apply: (t: number) => t + 45 },
  rot90: { name: 'diputar 90° searah jarum jam', apply: (t: number) => t + 90 },
  rot135: { name: 'diputar 135° searah jarum jam', apply: (t: number) => t + 135 },
  rot180: { name: 'diputar 180°', apply: (t: number) => t + 180 },
  rot270: { name: 'diputar 90° berlawanan arah jarum jam', apply: (t: number) => t + 270 },
  rot315: { name: 'diputar 45° berlawanan arah jarum jam', apply: (t: number) => t + 315 },
  mirrorH: { name: 'dicerminkan terhadap garis tegak (kiri jadi kanan)', apply: (t: number) => -t },
  mirrorV: { name: 'dicerminkan terhadap garis mendatar (atas jadi bawah)', apply: (t: number) => 180 - t },
} as const;
export type TransformKey = keyof typeof TRANSFORMS;

/** Names of the steps, joined the way the stem says them. */
export const transformName = (steps: TransformKey[]) => steps.map((k) => TRANSFORMS[k].name).join(', lalu ');
export const applyTransforms = (steps: TransformKey[], t: number) => norm(steps.reduce((x, k) => TRANSFORMS[k].apply(x), t));

function makeTransform(diff: Difficulty, r: Rand): Draft | null {
  const rots: TransformKey[] = ['rot90', 'rot180', 'rot270'];
  const all = Object.keys(TRANSFORMS) as TransformKey[];
  const steps: TransformKey[] =
    diff === 'mudah'
      ? [pick(rots, r)]
      : diff === 'sedang'
        ? [pick(['mirrorH', 'mirrorV', 'rot45', 'rot135', 'rot315'] as TransformKey[], r)]
        : (() => {
            // Two turns would be one turn, so a pair always has a mirror in it.
            const a = pick(all, r);
            const b = pick(
              all.filter((k) => k !== a && (isMirror(a) || isMirror(k))),
              r,
            );
            return [a, b];
          })();
  const fill = pick(FILLS, r);
  const at = (rotation: number): FigureCell => ({ shape: 'arrow', fill, count: 1, rotation: norm(rotation) });
  const angles = diff === 'mudah' ? [0, 90, 180, 270] : [0, 45, 90, 135, 180, 225, 270, 315];
  // A transform that leaves the figure unchanged would make the source itself the answer.
  const sources = angles.filter((t) => applyTransforms(steps, t) !== norm(t));
  if (!sources.length) return null;
  const source = at(pick(sources, r));
  const answer = at(applyTransforms(steps, source.rotation));
  const lures: Lure[] = [{ pic: source, why: 'Ini gambar awal yang belum diubah.' }];
  if (steps.length === 2) {
    lures.push({ pic: at(applyTransforms([steps[0]], source.rotation)), why: 'Ini hasil langkah pertama saja; langkah kedua belum dilakukan.' });
    lures.push({ pic: at(applyTransforms([steps[1]], source.rotation)), why: 'Ini hasil langkah kedua saja.' });
    lures.push({ pic: at(applyTransforms([steps[1], steps[0]], source.rotation)), why: 'Ini terjadi bila urutan kedua langkah dibalik.' });
  }
  for (const k of all) if (!steps.includes(k)) lures.push({ pic: at(TRANSFORMS[k].apply(source.rotation)), why: `Ini hasil bila gambar ${TRANSFORMS[k].name}.` });
  const pool = mutationPool(answer, r);
  const chosen = chooseOptions(answer, lures, pool, r);
  if (!chosen) return null;
  const name = transformName(steps);
  return {
    stem: `Gambar berikut ${name}. Gambar manakah hasilnya?`,
    figure: { layout: 'transform', cells: [source, null] },
    options: chosen.options,
    answerIdx: chosen.answerIdx,
    rationales: chosen.rationales,
    meta: {
      families: [...new Set(steps.map((s) => (s.startsWith('mirror') ? 'mirror' : 'rotate')))],
      signature: `glyph-transform|${steps.join('+')}`,
      complexity: steps.length + +steps.some((s) => s.startsWith('mirror')),
      tracks: [
        {
          label: 'Arah panah',
          values: [dirName(source.rotation), ...steps.map((_, i) => `${i === steps.length - 1 ? '? = ' : ''}${dirName(applyTransforms(steps.slice(0, i + 1), source.rotation))}`)],
        },
      ],
    },
    explanation: (ans) =>
      steps.length > 1
        ? `Gambar awal: ${describeCell(source)}.\n\nLangkah 1, ${TRANSFORMS[steps[0]].name}: panah menghadap ${dirName(applyTransforms([steps[0]], source.rotation))}.\nLangkah 2, ${TRANSFORMS[steps[1]].name}: panah menghadap ${dirName(answer.rotation)}.\n\nJadi hasilnya ${describeCell(answer)} (${ans}).`
        : `Gambar awal: ${describeCell(source)}. Setelah ${name}, hasilnya ${describeCell(answer)} (${ans}).`,
  };
}
const isMirror = (k: TransformKey) => k.startsWith('mirror');

/* --------------------------------------------------------------- odd one out */

type OddAttr = 'shape' | 'fill' | 'count';
const ODD_VALUES: Record<OddAttr, V[]> = { shape: PLAIN_SHAPES, fill: FILLS, count: [1, 2, 3, 4, 5] };

/** The one cell whose `attr` differs while the other four agree on it, if there is exactly one. */
export function singledOut(cells: FigureCell[], attr: OddAttr | 'rotation'): number | null {
  for (let i = 0; i < cells.length; i++) {
    const others = cells.filter((_, k) => k !== i);
    if (others.every((c) => c[attr] === others[0][attr]) && cells[i][attr] !== others[0][attr]) return i;
  }
  return null;
}

function makeOdd(diff: Difficulty, r: Rand): Draft | null {
  // mudah: same shape; sedang: same fill or count; sulit: same fill and count, the odd one breaking one of them.
  const shared: OddAttr[] = diff === 'mudah' ? ['shape'] : diff === 'sedang' ? [pick(['fill', 'count'] as const, r)] : ['fill', 'count'];
  const broken = pick(shared, r);
  const varying = (['shape', 'fill', 'count'] as const).filter((a) => !shared.includes(a));
  const common = Object.fromEntries(shared.map((a) => [a, pick(ODD_VALUES[a], r)])) as Partial<Record<OddAttr, V>>;
  const odd = Math.floor(r() * 5);
  const cells: FigureCell[] = Array.from({ length: 5 }, () => {
    let c: FigureCell = { shape: 'circle', fill: 'solid', count: 1, rotation: 0 };
    for (const a of shared) c = setAttr(c, a, common[a]!);
    for (const a of varying) c = setAttr(c, a, pick(ODD_VALUES[a], r));
    return c;
  });
  cells[odd] = setAttr(
    cells[odd],
    broken,
    pick(
      ODD_VALUES[broken].filter((v) => v !== common[broken]),
      r,
    ),
  );
  if (new Set(cells.map(picKey)).size !== 5) return null;
  // Only the intended property may single out an option, or two answers could be argued for.
  const outs = oddOnes<Pic>(cells, picFeats);
  if (outs.length !== 1 || outs[0] !== odd) return null;
  const trait = (a: OddAttr, v: V) => (a === 'shape' ? `berbentuk ${word(a, v)}` : a === 'fill' ? `berarsiran ${word(a, v)}` : `berisi ${v} bangun`);
  return {
    stem: stemFor('odd', r),
    figure: { layout: 'odd-one-out', cells: [] },
    options: cells,
    answerIdx: odd,
    rationales: cells.map(() => undefined),
    meta: { families: ['odd'], signature: `glyph-odd|${shared.join('+')}|${broken}`, complexity: shared.length + 1 },
    explanation: (label) =>
      `Gambar selain ${label} sama-sama ${shared.map((a) => trait(a, common[a]!)).join(' dan ')}. Gambar ${label} ${trait(broken, cells[odd][broken])}, jadi tidak sesuai.`,
  };
}

/* ---------------------------------------------------------------- recipes */

export const GLYPH_ARCHETYPES: Archetype[] = [
  {
    id: 'glyph-series',
    topic: 'Deret Figural',
    name: 'Deret satu bangun',
    about: 'Satu bangun berubah jumlah, arsiran, bentuk, atau arahnya dari gambar ke gambar.',
    families: [
      { id: 'step', name: 'Bertambah tetap' },
      { id: 'repeat2', name: 'Berulang tiap 2' },
      { id: 'repeat3', name: 'Berulang tiap 3' },
      { id: 'alternate', name: 'Langkah bergantian' },
      { id: 'interleave', name: 'Selang-seling ganjil/genap' },
      { id: 'sides', name: 'Jumlah sisi' },
    ],
    levels: ['mudah', 'sedang', 'sulit'],
    make: makeSeries,
  },
  {
    id: 'glyph-analogy',
    topic: 'Analogi Figural',
    name: 'Analogi satu bangun',
    about: 'Perubahan dari gambar pertama ke kedua diterapkan pada gambar ketiga.',
    families: [
      { id: 'step', name: 'Bertambah/berkurang' },
      { id: 'rotate', name: 'Berputar' },
      { id: 'map', name: 'Berubah menjadi' },
      { id: 'swap', name: 'Bertukar' },
    ],
    levels: ['mudah', 'sedang', 'sulit'],
    make: makeAnalogy,
  },
  {
    id: 'glyph-matrix',
    topic: 'Matriks Figural',
    name: 'Matriks 3 × 3',
    about: 'Sifat bangun mengikuti baris, kolom, atau muncul sekali di setiap baris dan kolom.',
    families: [],
    levels: ['mudah', 'sedang', 'sulit'],
    make: (d, r) => makeMatrix(d, r),
  },
  {
    id: 'glyph-transform',
    topic: 'Transformasi Figural',
    name: 'Putar dan cermin panah',
    about: 'Panah diputar, dicerminkan, atau keduanya berurutan.',
    families: [],
    levels: ['mudah', 'sedang', 'sulit'],
    make: (d, r) => makeTransform(d, r),
  },
  {
    id: 'glyph-odd',
    topic: 'Figural Berbeda',
    name: 'Bangun yang berbeda',
    about: 'Empat bangun sama dalam satu sifat; satu tidak.',
    families: [],
    levels: ['mudah', 'sedang', 'sulit'],
    make: (d, r) => makeOdd(d, r),
  },
];

/** Keep trying a recipe until it gives a question (it nearly always does within a few tries). */
export function makeWith(arch: Archetype, d: Difficulty, r: Rand = Math.random, want?: string[]): Question {
  for (let i = 0; i < 400; i++) {
    const draft = arch.make(d, r, want);
    if (draft) return toQuestion(arch, d, draft);
  }
  throw new Error(`Soal ${arch.name} tidak bisa dibuat`);
}

const byId = (id: string) => GLYPH_ARCHETYPES.find((a) => a.id === id)!;
export const generateFiguralSeries = (d: Difficulty, r: Rand = Math.random) => makeWith(byId('glyph-series'), d, r);
export const generateFiguralAnalogy = (d: Difficulty, r: Rand = Math.random) => makeWith(byId('glyph-analogy'), d, r);
export const generateFiguralMatrix = (d: Difficulty, r: Rand = Math.random) => makeWith(byId('glyph-matrix'), d, r);
export const generateFiguralTransform = (d: Difficulty, r: Rand = Math.random) => makeWith(byId('glyph-transform'), d, r);
export const generateFiguralOddOne = (d: Difficulty, r: Rand = Math.random) => makeWith(byId('glyph-odd'), d, r);
