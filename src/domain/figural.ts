import { hashText, shuffle, uid } from '../lib/id';
import { OPTION_LABELS } from './types';
import { describeCell, FILL_NAMES, SHAPE_NAMES } from './describe';
import type { Difficulty, Figure, FigureCell, Fill, OptionLabel, Question, ShapeKind } from './types';

export { describeCell, describeFigure } from './describe';

const SHAPES: ShapeKind[] = ['circle', 'square', 'triangle', 'diamond', 'star', 'arrow', 'pentagon'];
const FILLS: Fill[] = ['solid', 'empty', 'striped'];
export type Rand = () => number;
const pick = <T>(arr: T[], r: Rand) => arr[Math.floor(r() * arr.length)];
const sameCell = (a: FigureCell, b: FigureCell) => a.shape === b.shape && a.fill === b.fill && a.count === b.count && norm(a.rotation) === norm(b.rotation);
const norm = (deg: number) => ((deg % 360) + 360) % 360;

/**
 * Whether two cells look the same on screen. Symmetric shapes look the same at any rotation, and
 * the triangle is close enough to equilateral that a third of a turn would fool the eye.
 */
export function looksSame(a: FigureCell, b: FigureCell): boolean {
  if (a.shape !== b.shape || a.fill !== b.fill || a.count !== b.count) return false;
  if (a.shape === 'arrow') return norm(a.rotation) === norm(b.rotation);
  if (a.shape === 'triangle') return norm(a.rotation) % 120 === norm(b.rotation) % 120;
  return true;
}

/** Rotationally symmetric shapes make rotation rules ambiguous; use arrow/triangle for those. */
const ROTATABLE: ShapeKind[] = ['arrow', 'triangle'];

interface Rule {
  key: 'rotate' | 'count' | 'fill' | 'shape';
  apply: (c: FigureCell, step: number) => FigureCell;
  describe: string;
  base: (r: Rand) => FigureCell;
}

function rules(difficulty: Difficulty, r: Rand): Rule[] {
  const rotStep = pick(difficulty === 'mudah' ? [90] : [45, 90, 135], r);
  const rotate: Rule = {
    key: 'rotate',
    apply: (c, i) => ({ ...c, rotation: norm(c.rotation + rotStep * i) }),
    describe: `berputar ${rotStep}° searah jarum jam setiap langkah`,
    base: (rr) => ({ shape: pick(ROTATABLE, rr), fill: pick(FILLS, rr), rotation: 0, count: 1 }),
  };
  const countUp: Rule = {
    key: 'count',
    apply: (c, i) => ({ ...c, count: ((c.count - 1 + i) % 4) + 1 }),
    describe: 'jumlah bangun bertambah satu setiap langkah (kembali ke 1 setelah 4)',
    base: (rr) => ({ shape: pick(SHAPES, rr), fill: pick(FILLS, rr), rotation: 0, count: 1 }),
  };
  const fillCycle: Rule = {
    key: 'fill',
    apply: (c, i) => ({ ...c, fill: FILLS[(FILLS.indexOf(c.fill) + i) % FILLS.length] }),
    describe: 'arsiran berganti berurutan: hitam penuh → kosong → arsir',
    base: (rr) => ({ shape: pick(SHAPES, rr), fill: 'solid', rotation: 0, count: 1 + Math.floor(rr() * 2) }),
  };
  const shapeCycle: Rule = {
    key: 'shape',
    apply: (c, i) => {
      const seq: ShapeKind[] = ['circle', 'triangle', 'square', 'pentagon'];
      return { ...c, shape: seq[(seq.indexOf(c.shape) + i) % seq.length] };
    },
    describe: 'bentuk berganti berurutan: lingkaran → segitiga → persegi → segi lima',
    base: (rr) => ({ shape: 'circle', fill: pick(FILLS, rr), rotation: 0, count: 1 }),
  };
  return [rotate, countUp, fillCycle, shapeCycle];
}

const COMPATIBLE: [Rule['key'], Rule['key']][] = [
  ['rotate', 'fill'],
  ['rotate', 'count'],
  ['count', 'fill'],
  ['shape', 'fill'],
  ['shape', 'count'],
];

function pickRule(difficulty: Difficulty, r: Rand): Rule {
  const all = rules(difficulty, r);
  const byKey = (k: Rule['key']) => all.find((x) => x.key === k)!;
  if (difficulty !== 'sulit') return pick(all, r);
  const [ka, kb] = pick(COMPATIBLE, r);
  const a = byKey(ka);
  const b = byKey(kb);
  return {
    key: a.key,
    apply: (c, i) => b.apply(a.apply(c, i), i),
    describe: `${a.describe}, serta ${b.describe}`,
    // The first rule decides the shape (rotation needs an asymmetric shape, shape-cycle needs its sequence).
    base: (rr) => ({ ...b.base(rr), shape: a.base(rr).shape, rotation: 0, count: 1 }),
  };
}

/** Cells that differ from `answer` in one property: the near misses a careless reader picks. */
function distractors(answer: FigureCell, r: Rand): FigureCell[] {
  const variants: FigureCell[] = [
    { ...answer, rotation: norm(answer.rotation + 90) },
    { ...answer, rotation: norm(answer.rotation + 180) },
    { ...answer, fill: FILLS[(FILLS.indexOf(answer.fill) + 1) % 3] },
    { ...answer, fill: FILLS[(FILLS.indexOf(answer.fill) + 2) % 3] },
    { ...answer, count: (answer.count % 4) + 1 },
    { ...answer, count: answer.count === 1 ? 3 : answer.count - 1 },
    {
      ...answer,
      shape: pick(
        SHAPES.filter((s) => s !== answer.shape),
        r,
      ),
    },
  ];
  const isSymmetric = !ROTATABLE.includes(answer.shape);
  const out: FigureCell[] = [];
  for (const v of shuffle(variants, r)) {
    if (isSymmetric && v.rotation !== answer.rotation && v.shape === answer.shape) continue;
    if (sameCell(v, answer) || out.some((o) => sameCell(o, v))) continue;
    out.push(v);
  }
  return out;
}

type FiguralTopic = 'Deret Figural' | 'Analogi Figural' | 'Matriks Figural' | 'Transformasi Figural' | 'Figural Berbeda';

function buildQuestion(
  topic: FiguralTopic,
  difficulty: Difficulty,
  stem: string,
  figure: Figure,
  opts: FigureCell[],
  answerIdx: number,
  explanation: string | ((answer: OptionLabel) => string),
): Question {
  const now = Date.now();
  const options = opts.map((cell, i) => ({
    label: OPTION_LABELS[i],
    text: describeCell(cell),
    score: i === answerIdx ? 5 : 0,
    figure: cell,
  }));
  const answer = OPTION_LABELS[answerIdx];
  // With no stem figure the puzzle lives in the options, so they make it unique.
  const content = figure.cells.length ? JSON.stringify(figure.cells) : JSON.stringify(opts.map((o) => JSON.stringify(o)).sort());
  return {
    id: uid(),
    subtest: 'TIU',
    topic,
    difficulty,
    stem,
    options,
    answer,
    explanation: typeof explanation === 'function' ? explanation(answer) : explanation,
    figure,
    flags: [],
    locked: false,
    starred: false,
    hash: hashText(stem + content),
    source: 'procedural',
    createdAt: now,
    updatedAt: now,
  };
}

/** The answer among four of its distractors, shuffled. */
function withDistractors(answer: FigureCell, r: Rand, preferred: FigureCell[] = []): { opts: FigureCell[]; answerIdx: number } {
  const picked: FigureCell[] = [];
  for (const c of [...shuffle(preferred, r), ...distractors(answer, r)]) {
    if (looksSame(c, answer) || picked.some((p) => looksSame(p, c))) continue;
    picked.push(c);
    if (picked.length === 4) break;
  }
  const opts = shuffle([answer, ...picked], r);
  return { opts, answerIdx: opts.findIndex((o) => sameCell(o, answer)) };
}

export function generateFiguralSeries(difficulty: Difficulty, r: Rand = Math.random): Question {
  const rule = pickRule(difficulty, r);
  const base = rule.base(r);
  const seq = [0, 1, 2, 3, 4].map((i) => rule.apply(base, i));
  const answer = seq[4];
  const cells = [...seq.slice(0, 4), null];
  const { opts, answerIdx } = withDistractors(answer, r);
  return buildQuestion(
    'Deret Figural',
    difficulty,
    'Perhatikan deret gambar berikut. Gambar manakah yang tepat untuk mengisi tanda tanya?',
    { layout: 'series', cells },
    opts,
    answerIdx,
    `Pola: ${rule.describe}.\n\nLangkah 1: ${describeCell(seq[0])}.\nLangkah 4: ${describeCell(seq[3])}.\nMaka langkah ke-5 adalah ${describeCell(answer)}.`,
  );
}

export function generateFiguralAnalogy(difficulty: Difficulty, r: Rand = Math.random): Question {
  const rule = pickRule(difficulty, r);
  const a = rule.base(r);
  let c = rule.base(r);
  for (let i = 0; i < 10 && (sameCell(a, c) || sameCell(rule.apply(a, 1), c)); i++) {
    c = rule.key === 'count' ? { ...rule.base(r), fill: FILLS[(FILLS.indexOf(a.fill) + 1) % 3] } : { ...rule.base(r), count: (c.count % 4) + 1 };
  }
  const b = rule.apply(a, 1);
  const d = rule.apply(c, 1);
  const { opts, answerIdx } = withDistractors(d, r);
  return buildQuestion(
    'Analogi Figural',
    difficulty,
    'Gambar pertama berhubungan dengan gambar kedua. Dengan hubungan yang sama, gambar ketiga berhubungan dengan gambar manakah?',
    { layout: 'analogy', cells: [a, b, c, null] },
    opts,
    answerIdx,
    `Hubungan gambar 1 → gambar 2: ${rule.describe} (satu langkah).\n\nTerapkan pada gambar 3 (${describeCell(c)}) sehingga hasilnya ${describeCell(d)}.`,
  );
}

/* ------------------------------------------------------------- matrix 3×3 */

type Attr = 'shape' | 'fill' | 'count' | 'rotation';
const ATTR_NAMES: Record<Attr, string> = { shape: 'bentuk', fill: 'arsiran', count: 'jumlah bangun', rotation: 'arah' };
type AttrValue = ShapeKind | Fill | number;

function valueName(attr: Attr, v: AttrValue): string {
  if (attr === 'shape') return SHAPE_NAMES[v as ShapeKind];
  if (attr === 'fill') return FILL_NAMES[v as Fill];
  if (attr === 'count') return `${v} bangun`;
  return v === 0 ? 'tegak' : `diputar ${v}°`;
}

const withAttr = (c: FigureCell, attr: Attr, v: AttrValue): FigureCell => ({ ...c, [attr]: v });

/** A property as a phrase about a figure: "berbentuk lingkaran", "berisi 3 bangun". */
function trait(attr: Attr, v: AttrValue): string {
  if (attr === 'shape') return `berbentuk ${SHAPE_NAMES[v as ShapeKind]}`;
  if (attr === 'fill') return `berarsiran ${FILL_NAMES[v as Fill]}`;
  if (attr === 'count') return `berisi ${v} bangun`;
  return valueName(attr, v);
}

/** Three distinct values of an attribute. Rotation is only used on the arrow, whose direction is unambiguous. */
function threeValues(attr: Attr, r: Rand): AttrValue[] {
  if (attr === 'shape')
    return shuffle(
      SHAPES.filter((x) => x !== 'arrow'),
      r,
    ).slice(0, 3);
  if (attr === 'fill') return shuffle([...FILLS], r);
  if (attr === 'count') return [1, 2, 3];
  return [0, 90, 180];
}

/** The rule of a matrix: which attribute changes along rows and columns, and how. */
export interface MatrixRule {
  row: { attr: Attr; values: AttrValue[] };
  col: { attr: Attr; values: AttrValue[] };
  /** mudah: rows and columns; sedang: rows, and each row cycles the column values; sulit: both cycle. */
  kind: 'grid' | 'row-cycle' | 'latin';
  base: FigureCell;
}

export function matrixCell(m: MatrixRule, i: number, j: number): FigureCell {
  const [ri, ci] = m.kind === 'grid' ? [i, j] : m.kind === 'row-cycle' ? [i, (i + j) % 3] : [(i + j) % 3, (2 * i + j) % 3];
  return withAttr(withAttr(m.base, m.row.attr, m.row.values[ri]), m.col.attr, m.col.values[ci]);
}

function matrixRule(difficulty: Difficulty, r: Rand): MatrixRule {
  // Shape and rotation never vary together: rotation needs the arrow.
  const pairs: [Attr, Attr][] = [
    ['shape', 'fill'],
    ['shape', 'count'],
    ['fill', 'count'],
    ['fill', 'rotation'],
    ['count', 'rotation'],
    ['count', 'fill'],
    ['fill', 'shape'],
    ['count', 'shape'],
  ];
  const [a, b] = pick(pairs, r);
  const rotates = a === 'rotation' || b === 'rotation';
  const base: FigureCell = {
    shape: rotates
      ? 'arrow'
      : pick(
          SHAPES.filter((x) => x !== 'arrow'),
          r,
        ),
    fill: pick(FILLS, r),
    rotation: 0,
    count: 1,
  };
  return {
    row: { attr: a, values: threeValues(a, r) },
    col: { attr: b, values: threeValues(b, r) },
    kind: difficulty === 'mudah' ? 'grid' : difficulty === 'sedang' ? 'row-cycle' : 'latin',
    base,
  };
}

function describeMatrix(m: MatrixRule): string {
  const list = (x: MatrixRule['row']) => x.values.map((v) => valueName(x.attr, v)).join(', ');
  const row = ATTR_NAMES[m.row.attr];
  const col = ATTR_NAMES[m.col.attr];
  if (m.kind === 'grid') return `${row} sama dalam setiap baris (baris 1 sampai 3: ${list(m.row)}), dan ${col} sama dalam setiap kolom (kolom 1 sampai 3: ${list(m.col)})`;
  if (m.kind === 'row-cycle')
    return `${row} sama dalam setiap baris (baris 1 sampai 3: ${list(m.row)}), dan setiap baris memuat ketiga ${col} (${list(m.col)}) masing-masing satu kali`;
  return `setiap baris dan setiap kolom memuat ketiga ${row} (${list(m.row)}) dan ketiga ${col} (${list(m.col)}), masing-masing tepat satu kali`;
}

export function generateFiguralMatrix(difficulty: Difficulty, r: Rand = Math.random): Question {
  const m = matrixRule(difficulty, r);
  const cells = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => matrixCell(m, i, j)));
  const answer = cells[8];
  // Near misses: the right cell with one of the varying properties taken from elsewhere in the grid.
  const preferred = [m.row, m.col].flatMap((x) => x.values.filter((v) => v !== answer[x.attr]).map((v) => withAttr(answer, x.attr, v)));
  const { opts, answerIdx } = withDistractors(answer, r, preferred);
  return buildQuestion(
    'Matriks Figural',
    difficulty,
    'Gambar-gambar berikut tersusun dalam tiga baris dan tiga kolom menurut suatu pola. Gambar manakah yang tepat untuk mengisi tanda tanya?',
    { layout: 'matrix', cells: [...cells.slice(0, 8), null] },
    opts,
    answerIdx,
    `Pola: ${describeMatrix(m)}.\n\nJadi gambar di baris ketiga, kolom ketiga adalah ${describeCell(answer)}.`,
  );
}

/* --------------------------------------------------------- rotate and mirror */

/**
 * The arrow is symmetric about its own axis, so every mirror image of it is again the arrow at some
 * angle: mirroring left-right turns angle θ into −θ, and top-bottom into 180° − θ.
 */
export const TRANSFORMS = {
  rot90: { name: 'diputar 90° searah jarum jam', apply: (t: number) => t + 90 },
  rot180: { name: 'diputar 180°', apply: (t: number) => t + 180 },
  rot270: { name: 'diputar 90° berlawanan arah jarum jam', apply: (t: number) => t + 270 },
  mirrorH: { name: 'dicerminkan terhadap garis tegak (kiri jadi kanan)', apply: (t: number) => -t },
  mirrorV: { name: 'dicerminkan terhadap garis mendatar (atas jadi bawah)', apply: (t: number) => 180 - t },
  rot90mirrorH: { name: 'diputar 90° searah jarum jam, lalu dicerminkan terhadap garis tegak', apply: (t: number) => -(t + 90) },
} as const;
export type TransformKey = keyof typeof TRANSFORMS;

export function generateFiguralTransform(difficulty: Difficulty, r: Rand = Math.random): Question {
  const keys: TransformKey[] = difficulty === 'mudah' ? ['rot90', 'rot180', 'rot270'] : difficulty === 'sedang' ? ['mirrorH', 'mirrorV'] : ['rot90mirrorH'];
  const key = pick(keys, r);
  const angles = difficulty === 'mudah' ? [0, 90, 180, 270] : [0, 45, 90, 135, 180, 225, 270, 315];
  const fill = pick(FILLS, r);
  const at = (rotation: number): FigureCell => ({ shape: 'arrow', fill, count: 1, rotation: norm(rotation) });
  // A mirror that leaves the figure unchanged would make the source itself the answer.
  const sources = angles.filter((t) => norm(TRANSFORMS[key].apply(t)) !== norm(t));
  const source = at(pick(sources, r));
  const answer = at(TRANSFORMS[key].apply(source.rotation));
  const preferred = [source, ...Object.values(TRANSFORMS).map((x) => at(x.apply(source.rotation)))];
  const { opts, answerIdx } = withDistractors(answer, r, preferred);
  return buildQuestion(
    'Transformasi Figural',
    difficulty,
    `Gambar berikut ${TRANSFORMS[key].name}. Gambar manakah hasilnya?`,
    { layout: 'transform', cells: [source, null] },
    opts,
    answerIdx,
    `Gambar awal: ${describeCell(source)}. Setelah ${TRANSFORMS[key].name}, hasilnya ${describeCell(answer)}.`,
  );
}

/* --------------------------------------------------------------- odd one out */

const ATTR_VALUES: Record<Exclude<Attr, 'rotation'>, AttrValue[]> = {
  shape: SHAPES.filter((x) => x !== 'arrow'),
  fill: FILLS,
  count: [1, 2, 3, 4],
};

/** The one cell whose `attr` differs while the other four agree on it, if there is exactly one. */
export function singledOut(cells: FigureCell[], attr: Attr): number | null {
  for (let i = 0; i < cells.length; i++) {
    const others = cells.filter((_, k) => k !== i);
    if (others.every((c) => c[attr] === others[0][attr]) && cells[i][attr] !== others[0][attr]) return i;
  }
  return null;
}

export function generateFiguralOddOne(difficulty: Difficulty, r: Rand = Math.random): Question {
  // mudah: same shape; sedang: same fill or count; sulit: same fill and count, with the odd one breaking one of them.
  const shared: Exclude<Attr, 'rotation'>[] = difficulty === 'mudah' ? ['shape'] : difficulty === 'sedang' ? [pick(['fill', 'count'] as const, r)] : ['fill', 'count'];
  const broken = pick(shared, r);
  const varying = (['shape', 'fill', 'count'] as const).filter((a) => !shared.includes(a));
  for (;;) {
    const common = Object.fromEntries(shared.map((a) => [a, pick(ATTR_VALUES[a], r)])) as Partial<FigureCell>;
    const odd = Math.floor(r() * 5);
    const cells: FigureCell[] = Array.from({ length: 5 }, () => {
      const c: FigureCell = { shape: 'circle', fill: 'solid', count: 1, rotation: 0, ...common };
      for (const a of varying) Object.assign(c, { [a]: pick(ATTR_VALUES[a], r) });
      return c;
    });
    cells[odd] = withAttr(
      cells[odd],
      broken,
      pick(
        ATTR_VALUES[broken].filter((v) => v !== common[broken]),
        r,
      ),
    );
    const distinct = cells.every((c, i) => cells.every((d, k) => k === i || !looksSame(c, d)));
    // Only the intended property may single out an option, or two answers could be argued for.
    const fair = singledOut(cells, broken) === odd && (['shape', 'fill', 'count'] as const).every((a) => a === broken || singledOut(cells, a) === null);
    if (!distinct || !fair) continue;
    const label = OPTION_LABELS[odd];
    return buildQuestion(
      'Figural Berbeda',
      difficulty,
      'Empat dari lima gambar pada pilihan jawaban mengikuti pola yang sama. Gambar manakah yang tidak sesuai dengan pola itu?',
      { layout: 'odd-one-out', cells: [] },
      cells,
      odd,
      `Gambar selain ${label} sama-sama ${shared.map((a) => trait(a, common[a] as AttrValue)).join(' dan ')}. Gambar ${label} ${trait(broken, cells[odd][broken])}, jadi tidak sesuai.`,
    );
  }
}

const GENERATORS: Record<FiguralTopic, (d: Difficulty) => Question> = {
  'Deret Figural': generateFiguralSeries,
  'Analogi Figural': generateFiguralAnalogy,
  'Matriks Figural': generateFiguralMatrix,
  'Transformasi Figural': generateFiguralTransform,
  'Figural Berbeda': generateFiguralOddOne,
};

export function generateFigural(topic: string, difficulty: Difficulty, count: number): Question[] {
  const gen = GENERATORS[topic as FiguralTopic] ?? generateFiguralSeries;
  const out: Question[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < count && tries < count * 10; tries++) {
    const q = gen(difficulty);
    if (seen.has(q.hash)) continue;
    seen.add(q.hash);
    out.push(q);
  }
  return out;
}
