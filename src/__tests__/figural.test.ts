import { describe, expect, it } from 'vitest';
import {
  describeCell,
  describeFigure,
  generateFigural,
  generateFiguralMatrix,
  generateFiguralOddOne,
  generateFiguralTransform,
  looksSame,
  singledOut,
  TRANSFORMS,
  type Rand,
} from '../domain/figural';
import { PROCEDURAL_TOPICS, TOPICS } from '../domain/blueprint';
import { figureSvg, hasStemFigure } from '../lib/figureSvg';
import type { Difficulty, FigureCell, Question } from '../domain/types';

/** Small deterministic generator, so a failure names a seed that reproduces it. */
function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEVELS: Difficulty[] = ['mudah', 'sedang', 'sulit'];
const RUNS = 150;
const keyCell = (q: Question) => q.options.find((o) => o.label === q.answer)!.figure!;
const norm = (d: number) => ((d % 360) + 360) % 360;

function expectWellFormed(q: Question, seed: number) {
  const ctx = `${q.topic} ${q.difficulty} seed ${seed}`;
  expect(q.options, ctx).toHaveLength(5);
  expect(
    q.options.filter((o) => o.score === 5),
    ctx,
  ).toHaveLength(1);
  expect(q.options.find((o) => o.score === 5)?.label, ctx).toBe(q.answer);
  for (const [i, o] of q.options.entries()) {
    expect(o.text).toBe(describeCell(o.figure!));
    for (const p of q.options.slice(i + 1)) expect(looksSame(o.figure!, p.figure!), `${ctx}: ${o.label} and ${p.label} look the same`).toBe(false);
  }
}

/**
 * Whether a full 3×3 grid follows a matrix pattern, judged from the cells alone: every property
 * is either the same in a row (or column) or takes each of its three values once there.
 */
function fitsMatrix(cells: FigureCell[]): boolean {
  const attrs = ['shape', 'fill', 'count', 'rotation'] as const;
  const value = (c: FigureCell, a: (typeof attrs)[number]) => (a === 'rotation' ? norm(c.rotation) : c[a]);
  const lines = [0, 1, 2].flatMap((i) => [[0, 1, 2].map((j) => cells[i * 3 + j]), [0, 1, 2].map((j) => cells[j * 3 + i])]);
  return attrs.every((a) => {
    const all = new Set(cells.map((c) => value(c, a)));
    if (all.size !== 1 && all.size !== 3) return false;
    return lines.every((line) => new Set(line.map((c) => value(c, a))).size !== 2);
  });
}

describe('matrix 3×3', () => {
  it('has exactly one option that completes the pattern', () => {
    for (let seed = 0; seed < RUNS; seed++) {
      for (const d of LEVELS) {
        const q = generateFiguralMatrix(d, seeded(seed));
        expectWellFormed(q, seed);
        expect(q.figure?.layout).toBe('matrix');
        expect(q.figure?.cells).toHaveLength(9);
        expect(q.figure?.cells[8]).toBeNull();
        const visible = q.figure!.cells.slice(0, 8) as FigureCell[];
        for (const o of q.options) {
          expect(fitsMatrix([...visible, o.figure!]), `seed ${seed} ${d} option ${o.label}`).toBe(o.label === q.answer);
        }
      }
    }
  });

  it('describes the grid row by row for screen readers', () => {
    const q = generateFiguralMatrix('sedang', seeded(1));
    expect(describeFigure(q.figure!)).toMatch(/^Baris 1: .*\. Baris 2: .*\. Baris 3: .*; tanda tanya$/);
  });
});

describe('rotate and mirror', () => {
  it('answers with the stated transform of the arrow, and nothing else does', () => {
    for (let seed = 0; seed < RUNS; seed++) {
      for (const d of LEVELS) {
        const q = generateFiguralTransform(d, seeded(seed));
        expectWellFormed(q, seed);
        const [source] = q.figure!.cells as FigureCell[];
        const t = Object.values(TRANSFORMS).find((x) => q.stem.includes(`berikut ${x.name}.`))!;
        expect(t, q.stem).toBeDefined();
        expect(norm(keyCell(q).rotation)).toBe(norm(t.apply(source.rotation)));
        expect(looksSame(keyCell(q), source), `seed ${seed}: the answer must change the figure`).toBe(false);
      }
    }
  });

  it('mirrors the arrow correctly', () => {
    // An arrow pointing up-right (45°) mirrored left-right points up-left (315°), and top-bottom down-right (135°).
    expect(norm(TRANSFORMS.mirrorH.apply(45))).toBe(315);
    expect(norm(TRANSFORMS.mirrorV.apply(45))).toBe(135);
    expect(norm(TRANSFORMS.rot90.apply(270))).toBe(0);
  });
});

describe('odd one out', () => {
  it('singles out the key by exactly one property, and no other option by any property', () => {
    for (let seed = 0; seed < RUNS; seed++) {
      for (const d of LEVELS) {
        const q = generateFiguralOddOne(d, seeded(seed));
        expectWellFormed(q, seed);
        expect(hasStemFigure(q.figure)).toBe(false);
        const cells = q.options.map((o) => o.figure!);
        const key = q.options.findIndex((o) => o.label === q.answer);
        const outs = (['shape', 'fill', 'count'] as const).map((a) => singledOut(cells, a));
        expect(
          outs.filter((x) => x === key),
          `seed ${seed} ${d}`,
        ).toHaveLength(1);
        expect(
          outs.every((x) => x === null || x === key),
          `seed ${seed} ${d}`,
        ).toBe(true);
      }
    }
  });
});

describe('figural topics', () => {
  it('are offered in TIU and drawn by the app', () => {
    for (const t of ['Matriks Figural', 'Transformasi Figural', 'Figural Berbeda']) {
      expect(TOPICS.TIU).toContain(t);
      expect(PROCEDURAL_TOPICS.has(t)).toBe(true);
    }
  });

  it('generates the requested count of distinct questions for each new topic', () => {
    for (const t of ['Matriks Figural', 'Transformasi Figural', 'Figural Berbeda']) {
      const qs = generateFigural(t, 'sedang', 8);
      expect(qs).toHaveLength(8);
      expect(qs.every((q) => q.topic === t && q.source === 'procedural')).toBe(true);
      expect(new Set(qs.map((q) => q.hash)).size).toBe(8);
    }
  });

  it('draws the matrix as a square grid and the transform with an arrow between', () => {
    const m = generateFiguralMatrix('mudah', seeded(3)).figure!;
    expect(figureSvg(m, 80)).toMatch(/^<svg [^>]*width="256" height="256"/);
    const t = generateFiguralTransform('mudah', seeded(3)).figure!;
    expect(figureSvg(t, 80)).toContain('→');
  });
});
