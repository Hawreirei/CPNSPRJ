import type { Difficulty, NumCell, Pic, Question } from '../types';
import { chance, chooseOptions, pick, randInt, type Archetype, type Draft, type Lure, type Rand } from './build';

/*
 * Tabel Angka: a 3×3 table where each row (or each column) turns its first two numbers into the
 * third by one formula, and one number is "?". The solver reads the table both ways with every
 * formula in the library; a table is kept only when all readings that fit agree on one number.
 * Formulas that fit the first line but not the second are the traps, and the wrong options.
 */

type Show = (a: string, b: string) => string;
export interface Formula {
  id: string;
  /** 0 mudah, 1 sedang, 2 sulit: the level that makes it. Every formula is tried when solving. */
  level: 0 | 1 | 2;
  /** Simpler formulas explain first (docs/rancangan-figural-v2.md §5, K2). */
  c: number;
  family: 'jumlah' | 'kali' | 'konstanta' | 'kuadrat' | 'campuran';
  f: (a: number, b: number) => number;
  show: Show;
}

const sq = (x: string) => (x.length > 1 && /\D/.test(x) ? `(${x})²` : `${x}²`);
export const FORMULAS: Formula[] = (() => {
  const out: Formula[] = [];
  const add = (id: string, level: Formula['level'], c: number, family: Formula['family'], f: Formula['f'], show: Show) => out.push({ id, level, c, family, f, show });
  add(
    'a+b',
    0,
    1,
    'jumlah',
    (a, b) => a + b,
    (a, b) => `${a} + ${b}`,
  );
  add(
    'a-b',
    0,
    1,
    'jumlah',
    (a, b) => a - b,
    (a, b) => `${a} − ${b}`,
  );
  add(
    'b-a',
    0,
    1,
    'jumlah',
    (a, b) => b - a,
    (a, b) => `${b} − ${a}`,
  );
  add(
    'a*b',
    0,
    1,
    'kali',
    (a, b) => a * b,
    (a, b) => `${a} × ${b}`,
  );
  // Doubling and tripling are easy enough for mudah; larger constants come later.
  for (const k of [2, 3, 4, 5]) {
    add(
      `(a+b)*${k}`,
      k <= 3 ? 0 : 1,
      2,
      'konstanta',
      (a, b) => (a + b) * k,
      (a, b) => `(${a} + ${b}) × ${k}`,
    );
    add(
      `(a-b)*${k}`,
      k <= 3 ? 0 : 1,
      2,
      'konstanta',
      (a, b) => (a - b) * k,
      (a, b) => `(${a} − ${b}) × ${k}`,
    );
  }
  for (const k of [2, 3, 4]) {
    add(
      `a*${k}+b`,
      k <= 3 ? 0 : 1,
      2,
      'konstanta',
      (a, b) => a * k + b,
      (a, b) => `${a} × ${k} + ${b}`,
    );
    add(
      `a*${k}-b`,
      k <= 3 ? 0 : 1,
      2,
      'konstanta',
      (a, b) => a * k - b,
      (a, b) => `${a} × ${k} − ${b}`,
    );
  }
  for (const k of [1, 2, 3]) {
    add(
      `a*b+${k}`,
      1,
      2,
      'kali',
      (a, b) => a * b + k,
      (a, b) => `${a} × ${b} + ${k}`,
    );
    add(
      `a*b-${k}`,
      1,
      2,
      'kali',
      (a, b) => a * b - k,
      (a, b) => `${a} × ${b} − ${k}`,
    );
  }
  add(
    'a*b+a',
    1,
    2,
    'kali',
    (a, b) => a * b + a,
    (a, b) => `${a} × ${b} + ${a}`,
  );
  add(
    'a*b+b',
    1,
    2,
    'kali',
    (a, b) => a * b + b,
    (a, b) => `${a} × ${b} + ${b}`,
  );
  add(
    'a*b-a',
    1,
    2,
    'kali',
    (a, b) => a * b - a,
    (a, b) => `${a} × ${b} − ${a}`,
  );
  add(
    'a*b-b',
    1,
    2,
    'kali',
    (a, b) => a * b - b,
    (a, b) => `${a} × ${b} − ${b}`,
  );
  add(
    'a^2+b',
    1,
    2,
    'kuadrat',
    (a, b) => a * a + b,
    (a, b) => `${sq(a)} + ${b}`,
  );
  add(
    'a^2-b',
    1,
    2,
    'kuadrat',
    (a, b) => a * a - b,
    (a, b) => `${sq(a)} − ${b}`,
  );
  add(
    'a+b^2',
    1,
    2,
    'kuadrat',
    (a, b) => a + b * b,
    (a, b) => `${a} + ${sq(b)}`,
  );
  add(
    'b^2-a',
    2,
    2,
    'kuadrat',
    (a, b) => b * b - a,
    (a, b) => `${sq(b)} − ${a}`,
  );
  add(
    'a^2+b^2',
    2,
    3,
    'kuadrat',
    (a, b) => a * a + b * b,
    (a, b) => `${sq(a)} + ${sq(b)}`,
  );
  add(
    'a^2-b^2',
    2,
    3,
    'kuadrat',
    (a, b) => a * a - b * b,
    (a, b) => `${sq(a)} − ${sq(b)}`,
  );
  add(
    '(a+b)^2',
    2,
    3,
    'kuadrat',
    (a, b) => (a + b) ** 2,
    (a, b) => `(${a} + ${b})²`,
  );
  add(
    '(a-b)^2',
    2,
    3,
    'kuadrat',
    (a, b) => (a - b) ** 2,
    (a, b) => `(${a} − ${b})²`,
  );
  add(
    'a*b+a+b',
    2,
    3,
    'campuran',
    (a, b) => a * b + a + b,
    (a, b) => `${a} × ${b} + ${a} + ${b}`,
  );
  add(
    'a*b-a-b',
    2,
    3,
    'campuran',
    (a, b) => a * b - a - b,
    (a, b) => `${a} × ${b} − ${a} − ${b}`,
  );
  add(
    'a*(a+b)',
    2,
    3,
    'campuran',
    (a, b) => a * (a + b),
    (a, b) => `${a} × (${a} + ${b})`,
  );
  add(
    'a*(a-b)',
    2,
    3,
    'campuran',
    (a, b) => a * (a - b),
    (a, b) => `${a} × (${a} − ${b})`,
  );
  return out;
})();
const byId = new Map(FORMULAS.map((f) => [f.id, f]));

export type Dir = 'row' | 'col';
/** The three numbers of line `i` read by rows or by columns: first, second, result. */
const lineCells = (dir: Dir, i: number) => [0, 1, 2].map((j) => (dir === 'row' ? i * 3 + j : j * 3 + i));
/** The largest number the "?" may stand for when solving backwards. */
const SEARCH = 200;

export interface Reading {
  dir: Dir;
  formula: Formula;
  /** What "?" must be under this reading (more than one when solving backwards has several answers). */
  values: number[];
}

/** Every way of reading the table (direction and formula) that fits its complete lines. */
export function readTable(cells: (number | null)[]): Reading[] {
  const gap = cells.indexOf(null);
  const out: Reading[] = [];
  for (const dir of ['row', 'col'] as Dir[]) {
    const lines = [0, 1, 2].map((i) => lineCells(dir, i));
    const q = lines.findIndex((l) => l.includes(gap));
    const pos = lines[q].indexOf(gap);
    const full = lines.filter((_, i) => i !== q);
    for (const formula of FORMULAS) {
      if (!full.every(([a, b, r]) => formula.f(cells[a]!, cells[b]!) === cells[r])) continue;
      const [a, b, r] = lines[q].map((i) => cells[i]);
      let values: number[];
      if (pos === 2) values = [formula.f(a!, b!)];
      else {
        values = [];
        for (let x = 0; x <= SEARCH; x++) if ((pos === 0 ? formula.f(x, b!) : formula.f(a!, x)) === r) values.push(x);
      }
      if (values.length) out.push({ dir, formula, values });
    }
  }
  return out;
}

/** The number the table asks for, when every fitting reading gives the same one. */
export function tableAnswer(cells: (number | null)[]): number | null {
  const vals = new Set(readTable(cells).flatMap((r) => r.values));
  return vals.size === 1 ? [...vals][0] : null;
}

/* ---------------------------------------------------------------- recipe */

const LIMIT: Record<Difficulty, number> = { mudah: 60, sedang: 100, sulit: 150 };
const LEVEL: Record<Difficulty, number> = { mudah: 0, sedang: 1, sulit: 2 };
const num = (value: number): NumCell => ({ kind: 'num', value });
const lineWord = (dir: Dir) => (dir === 'row' ? 'baris' : 'kolom');
/** A number as written: a minus sign, not a hyphen. */
const n$ = (x: number) => (x < 0 ? `−${-x}` : `${x}`);

/** Two starting numbers for a formula, in a range that keeps the result reasonable. */
function operands(f: Formula, d: Difficulty, r: Rand): [number, number] {
  const small = f.family === 'kuadrat' || f.family === 'campuran' || f.family === 'kali';
  const hi = small ? (d === 'mudah' ? 9 : 12) : d === 'mudah' ? 20 : 30;
  // From 2: a line with a 1 in it fits too many formulas to teach anything.
  const x = randInt(2, hi, r);
  const y = randInt(2, hi, r);
  // A difference reads naturally with the larger number first.
  return /a-b|a\*\(a-b\)/.test(f.id) ? [Math.max(x, y), Math.min(x, y)] : [x, y];
}

function makeTable(d: Difficulty, r: Rand, want?: string[]): Draft | null {
  const families = want?.filter((w) => ['jumlah', 'kali', 'konstanta', 'kuadrat', 'campuran'].includes(w));
  const dirs = want?.filter((w) => w === 'baris' || w === 'kolom');
  // Asked for kinds of formula, any up to this level will do; otherwise this level's own.
  const pool = FORMULAS.filter((f) => f.id !== 'b-a' && (families?.length ? f.level <= LEVEL[d] && families.includes(f.family) : f.level === LEVEL[d]));
  if (!pool.length) return null;
  const formula = pick(pool, r);
  const dir: Dir = dirs?.length === 1 ? (dirs[0] === 'baris' ? 'row' : 'col') : chance(0.5, r) ? 'row' : 'col';
  // Sulit may ask for one of the starting numbers instead of the result: the formula worked backwards.
  const backwards = (d === 'sulit' && chance(0.35, r)) || !!want?.includes('balik');
  const pos = backwards ? randInt(0, 1, r) : 2;
  const lines: number[][] = [];
  for (let i = 0; i < 3; i++) {
    const [a, b] = operands(formula, d, r);
    const res = formula.f(a, b);
    if (a === b || res <= 0 || res > LIMIT[d] || !Number.isInteger(res)) return null;
    lines.push([a, b, res]);
  }
  if (new Set(lines.map((l) => l.join())).size < 3) return null;
  const cells: (number | null)[] = Array(9).fill(0);
  lines.forEach((l, i) => lineCells(dir, i).forEach((c, j) => (cells[c] = l[j])));
  const gap = lineCells(dir, 2)[pos];
  const key = cells[gap]!;
  cells[gap] = null;
  if (tableAnswer(cells) !== key) return null;
  const readings = readTable(cells);
  const fitting = new Set(readings.flatMap((x) => x.values));

  // Traps: formulas that fit the first line but not the second, read either way.
  const lures: Lure[] = [];
  const firstOnly = (rd: Dir) => {
    const ls = [0, 1, 2].map((i) => lineCells(rd, i));
    const q = ls.findIndex((l) => l.includes(gap));
    const [l1, l2] = ls.filter((_, i) => i !== q);
    const p = ls[q].indexOf(gap);
    for (const f of FORMULAS) {
      const fits1 = f.f(cells[l1[0]]!, cells[l1[1]]!) === cells[l1[2]];
      const fits2 = f.f(cells[l2[0]]!, cells[l2[1]]!) === cells[l2[2]];
      if (!fits1 || fits2) continue;
      const [a, b, res] = ls[q].map((i) => cells[i]);
      const v = p === 2 ? f.f(a!, b!) : [...Array(SEARCH + 1).keys()].find((x) => (p === 0 ? f.f(x, b!) : f.f(a!, x)) === res);
      // A trap is only worth offering when its number looks like a possible answer.
      if (v === undefined || v <= 0 || fitting.has(v) || v > Math.max(LIMIT[d], key * 2) || v > key * 3 + 10) continue;
      const w = lineWord(rd);
      const at = (l: number[]) => f.show(`${cells[l[0]]}`, `${cells[l[1]]}`);
      lures.push({
        pic: num(v),
        why:
          rd === dir
            ? `Rumus ${f.show('a', 'b')} cocok untuk ${w} pertama (${at(l1)} = ${cells[l1[2]]}), tetapi tidak untuk ${w} kedua (${at(l2)} = ${n$(f.f(cells[l2[0]]!, cells[l2[1]]!))}, bukan ${cells[l2[2]]}).`
            : `Ini hasil membaca per ${w}; polanya berlaku per ${lineWord(dir)}.`,
      });
    }
  };
  firstOnly(dir);
  firstOnly(dir === 'row' ? 'col' : 'row');
  // A constant one off, and the usual slips.
  const k = formula.id.match(/\d$/)?.[0];
  if (k && pos === 2) {
    const [a, b] = lineCells(dir, 2).map((i) => cells[i]!);
    for (const kk of [+k - 1, +k + 1]) {
      const other = byId.get(formula.id.replace(/\d$/, `${kk}`));
      if (other) lures.push({ pic: num(other.f(a, b)), why: `Bilangan pengalinya keliru: ${other.show('a', 'b')}, padahal ${formula.show('a', 'b')}.` });
    }
  }
  const slips = [1, -1, 2, -2, 10, -10].map((x) => num(key + x));
  // Wrong options stay positive and near the table's own size.
  const ok = (p: Pic) => {
    const v = (p as NumCell).value;
    return v <= 0 || v > Math.round(LIMIT[d] * 1.1) || fitting.has(v);
  };
  const chosen = chooseOptions(num(key), lures, slips, r, ok);
  if (!chosen) return null;

  const best = [...readings].sort((x, y) => x.formula.c - y.formula.c || +(y.formula.id === formula.id) - +(x.formula.id === formula.id))[0];
  const bw = lineWord(best.dir);
  const allLines = [0, 1, 2].map((i) => lineCells(best.dir, i));
  const qLine = allLines.findIndex((l) => l.includes(gap));
  const shown = (l: number[], i: number) => {
    const [a, b, res] = l.map((c) => (cells[c] === null ? '?' : `${cells[c]}`));
    const label = `${bw[0].toUpperCase()}${bw.slice(1)} ${i + 1}`;
    if (i !== qLine) return `${label}: ${best.formula.show(a, b)} = ${res} ✓`;
    if (pos === 2) return `${label}: ${best.formula.show(a, b)} = ${key}`;
    return `${label}: ${best.formula.show(a, b)} = ${res}, jadi ? = ${key}`;
  };
  const trap = lures.find((l) => l.why.startsWith('Rumus'));
  return {
    stem: pick(
      [
        'Perhatikan tabel berikut. Nilai yang tepat untuk ? adalah …',
        'Angka-angka pada tabel berikut mengikuti aturan yang sama di setiap baris atau di setiap kolom. Berapakah nilai ?',
        'Tentukan bilangan yang tepat untuk menggantikan ? pada tabel berikut.',
      ],
      r,
    ),
    figure: { layout: 'matrix', cells: cells.map((c) => (c === null ? null : num(c))) },
    options: chosen.options,
    answerIdx: chosen.answerIdx,
    rationales: chosen.rationales,
    meta: {
      families: [formula.family, lineWord(dir), ...(pos !== 2 ? ['balik'] : [])],
      signature: `number-table|${dir}|${formula.id}|${pos === 2 ? 'hasil' : 'balik'}`,
      complexity: formula.c + +(dir === 'col') + (pos !== 2 ? 2 : 0),
      tracks: allLines.map((l, i) => {
        const [a, b, res] = l.map((c) => (cells[c] === null ? '?' : `${cells[c]}`));
        return { label: `${bw[0].toUpperCase()}${bw.slice(1)} ${i + 1}`, values: [a, b, i === qLine ? `? = ${key}` : `${best.formula.show(a, b)} = ${res}`] };
      }),
    },
    explanation: (ans) =>
      `Aturan setiap ${bw}: ${best.formula.show('angka pertama', 'angka kedua')} = angka ketiga.\n\n${allLines.map(shown).join('\n')}${
        trap ? `\n\nJebakan: ${trap.why}` : ''
      }\n\nJadi ? = ${key} (${ans}).`,
  };
}

/** The question's table and options read back from it, judged again. */
function verifyTable(q: Question): boolean {
  const cells = (q.figure?.cells ?? []).map((c) => (c && 'kind' in c && c.kind === 'num' ? c.value : null));
  if (cells.length !== 9 || cells.filter((c) => c === null).length !== 1) return false;
  const key = tableAnswer(cells);
  const opts = q.options.map((o) => Number(o.text));
  const k = q.options.findIndex((o) => o.label === q.answer);
  return key !== null && opts[k] === key && opts.filter((v) => v === key).length === 1 && new Set(opts).size === 5;
}

export const TABLE_ARCHETYPES: Archetype[] = [
  {
    id: 'number-table',
    topic: 'Tabel Angka',
    name: 'Tabel angka 3 × 3',
    about: 'Setiap baris atau kolom mengubah dua angka menjadi angka ketiga dengan satu rumus.',
    families: [
      { id: 'jumlah', name: 'Tambah/kurang' },
      { id: 'kali', name: 'Kali' },
      { id: 'konstanta', name: 'Dikali konstanta' },
      { id: 'kuadrat', name: 'Kuadrat' },
      { id: 'campuran', name: 'Campuran' },
      { id: 'baris', name: 'Per baris' },
      { id: 'kolom', name: 'Per kolom' },
      { id: 'balik', name: 'Cari angka awal' },
    ],
    levels: ['mudah', 'sedang', 'sulit'],
    make: makeTable,
    verify: verifyTable,
  },
];
