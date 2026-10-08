import { hashText, shuffle, uid } from '../lib/id';
import { OPTION_LABELS } from './types';
import type { Difficulty, FigureCell, Fill, Question, ShapeKind } from './types';

const SHAPES: ShapeKind[] = ['circle', 'square', 'triangle', 'diamond', 'star', 'arrow', 'pentagon'];
const FILLS: Fill[] = ['solid', 'empty', 'striped'];
const SHAPE_NAMES: Record<ShapeKind, string> = {
  circle: 'lingkaran', square: 'persegi', triangle: 'segitiga', diamond: 'belah ketupat',
  star: 'bintang', arrow: 'panah', pentagon: 'segi lima',
};
const FILL_NAMES: Record<Fill, string> = { solid: 'hitam penuh', empty: 'kosong', striped: 'arsir' };

type Rand = () => number;
const pick = <T,>(arr: T[], r: Rand) => arr[Math.floor(r() * arr.length)];
const sameCell = (a: FigureCell, b: FigureCell) =>
  a.shape === b.shape && a.fill === b.fill && a.count === b.count && norm(a.rotation) === norm(b.rotation);
const norm = (deg: number) => ((deg % 360) + 360) % 360;

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
  ['rotate', 'fill'], ['rotate', 'count'], ['count', 'fill'], ['shape', 'fill'], ['shape', 'count'],
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

function distractors(answer: FigureCell, r: Rand): FigureCell[] {
  const variants: FigureCell[] = [
    { ...answer, rotation: norm(answer.rotation + 90) },
    { ...answer, rotation: norm(answer.rotation + 180) },
    { ...answer, fill: FILLS[(FILLS.indexOf(answer.fill) + 1) % 3] },
    { ...answer, fill: FILLS[(FILLS.indexOf(answer.fill) + 2) % 3] },
    { ...answer, count: (answer.count % 4) + 1 },
    { ...answer, count: answer.count === 1 ? 3 : answer.count - 1 },
    { ...answer, shape: pick(SHAPES.filter((s) => s !== answer.shape), r) },
  ];
  const isSymmetric = !ROTATABLE.includes(answer.shape);
  const out: FigureCell[] = [];
  for (const v of shuffle(variants, r)) {
    if (isSymmetric && v.rotation !== answer.rotation && v.shape === answer.shape) continue;
    if (sameCell(v, answer) || out.some((o) => sameCell(o, v))) continue;
    out.push(v);
    if (out.length === 4) break;
  }
  return out;
}

export function describeCell(c: FigureCell): string {
  const rot = c.rotation ? `, diputar ${c.rotation}°` : '';
  return `${c.count} ${SHAPE_NAMES[c.shape]} ${FILL_NAMES[c.fill]}${rot}`;
}

function buildQuestion(
  topic: 'Deret Figural' | 'Analogi Figural',
  difficulty: Difficulty,
  stem: string,
  cells: (FigureCell | null)[],
  layout: 'series' | 'analogy',
  answerCell: FigureCell,
  explanation: string,
  r: Rand,
): Question {
  const opts = shuffle([answerCell, ...distractors(answerCell, r)], r);
  const answerIdx = opts.findIndex((o) => sameCell(o, answerCell));
  const now = Date.now();
  const options = opts.map((figure, i) => ({
    label: OPTION_LABELS[i],
    text: describeCell(figure),
    score: i === answerIdx ? 5 : 0,
    figure,
  }));
  return {
    id: uid(),
    subtest: 'TIU',
    topic,
    difficulty,
    stem,
    options,
    answer: OPTION_LABELS[answerIdx],
    explanation,
    figure: { layout, cells },
    flags: [],
    locked: false,
    starred: false,
    hash: hashText(stem + JSON.stringify(cells)),
    source: 'procedural',
    createdAt: now,
    updatedAt: now,
  };
}

export function generateFiguralSeries(difficulty: Difficulty, r: Rand = Math.random): Question {
  const rule = pickRule(difficulty, r);
  const base = rule.base(r);
  const seq = [0, 1, 2, 3, 4].map((i) => rule.apply(base, i));
  const answer = seq[4];
  const cells = [...seq.slice(0, 4), null];
  return buildQuestion(
    'Deret Figural',
    difficulty,
    'Perhatikan deret gambar berikut. Gambar manakah yang tepat untuk mengisi tanda tanya?',
    cells,
    'series',
    answer,
    `Pola: ${rule.describe}.\n\nLangkah 1: ${describeCell(seq[0])}.\nLangkah 4: ${describeCell(seq[3])}.\nMaka langkah ke-5 adalah ${describeCell(answer)}.`,
    r,
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
  return buildQuestion(
    'Analogi Figural',
    difficulty,
    'Gambar pertama berhubungan dengan gambar kedua. Dengan hubungan yang sama, gambar ketiga berhubungan dengan gambar manakah?',
    [a, b, c, null],
    'analogy',
    d,
    `Hubungan gambar 1 → gambar 2: ${rule.describe} (satu langkah).\n\nTerapkan pada gambar 3 (${describeCell(c)}) sehingga hasilnya ${describeCell(d)}.`,
    r,
  );
}

export function generateFigural(topic: string, difficulty: Difficulty, count: number): Question[] {
  const out: Question[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < count && tries < count * 10; tries++) {
    const q = topic === 'Analogi Figural' ? generateFiguralAnalogy(difficulty) : generateFiguralSeries(difficulty);
    const key = JSON.stringify(q.figure);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}
