import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  applyTransforms,
  describeFigure,
  generateFigural,
  generateFiguralMatrix,
  generateFiguralOddOne,
  generateFiguralTransform,
  makeWith,
  singledOut,
  TRANSFORMS,
  type TransformKey,
} from '../domain/figural';
import { picFeats, termFeats } from '../domain/figural/features';
import { judgeAnalogy, judgeMatrix, judgeSeries, oddOnes } from '../domain/figural/solver';
import { PROCEDURAL_TOPICS, TOPICS } from '../domain/blueprint';
import { isLegacy, picKey } from '../domain/pic';
import { newFigural } from '../domain/share';
import { figureSvg, hasStemFigure } from '../lib/figureSvg';
import type { Difficulty, FigureCell, Pic } from '../domain/types';
import { expectWellFormed, keyIdx, pics, seeded } from './figuralHelpers';

const LEVELS: Difficulty[] = ['mudah', 'sedang', 'sulit'];
const RUNS = 60;

describe('first-kind recipes', () => {
  const glyph = ARCHETYPES.filter((a) => a.id.startsWith('glyph-'));
  for (const a of glyph)
    it(`${a.id}: well formed and judged fair by the solver`, () => {
      for (let seed = 0; seed < RUNS; seed++)
        for (const d of LEVELS) {
          const q = makeWith(a, d, seeded(seed));
          const ctx = `${a.id} ${d} seed ${seed}`;
          expectWellFormed(q, ctx);
          const f = q.figure!;
          const k = keyIdx(q);
          if (f.layout === 'series') expect(judgeSeries<Pic>(f.cells, pics(q), k, termFeats).ok, ctx).toBe(true);
          if (f.layout === 'analogy') expect(judgeAnalogy<Pic>([[f.cells[0]!, f.cells[1]!]], f.cells[2]!, pics(q), k, picFeats).ok, ctx).toBe(true);
          if (f.layout === 'matrix') expect(judgeMatrix<Pic>(f.cells, pics(q), k, picFeats).ok, ctx).toBe(true);
          if (f.layout === 'odd-one-out') expect(oddOnes<Pic>(pics(q), picFeats), ctx).toEqual([k]);
          // The first kind still draws for older versions of the app, unless it uses a new shape, fill or count.
          expect(pics(q).every(isLegacy)).toBe(true);
        }
    });

  it('makes the sulit series harder than the mudah one', () => {
    const avg = (d: Difficulty) => {
      const qs = Array.from({ length: 40 }, (_, i) => makeWith(glyph[0], d, seeded(i)));
      return qs.reduce((s, q) => s + q.figureMeta!.complexity, 0) / qs.length;
    };
    expect(avg('sulit')).toBeGreaterThan(avg('sedang'));
    expect(avg('sedang')).toBeGreaterThan(avg('mudah'));
  });
});

describe('matrix 3×3', () => {
  it('describes the grid row by row for screen readers', () => {
    const q = generateFiguralMatrix('sedang', seeded(1));
    expect(describeFigure(q.figure!)).toMatch(/^Baris 1: .*\. Baris 2: .*\. Baris 3: .*; tanda tanya$/);
  });
});

describe('rotate and mirror', () => {
  it('answers with the stated steps applied to the arrow, and nothing else does', () => {
    for (let seed = 0; seed < RUNS; seed++) {
      for (const d of LEVELS) {
        const q = generateFiguralTransform(d, seeded(seed));
        const [source] = q.figure!.cells as FigureCell[];
        const steps = q.figureMeta!.signature.split('|')[1].split('+') as TransformKey[];
        expect(q.stem, `seed ${seed}`).toContain(steps.map((k) => TRANSFORMS[k].name).join(', lalu '));
        const key = q.options[keyIdx(q)].figure as FigureCell;
        expect(key.rotation).toBe(applyTransforms(steps, source.rotation));
        expect(picKey(key) === picKey(source), `seed ${seed}: the answer must change the figure`).toBe(false);
      }
    }
  });

  it('mirrors the arrow correctly', () => {
    // An arrow pointing up-right (45°) mirrored left-right points up-left (315°), and top-bottom down-right (135°).
    expect(applyTransforms(['mirrorH'], 45)).toBe(315);
    expect(applyTransforms(['mirrorV'], 45)).toBe(135);
    expect(applyTransforms(['rot90'], 270)).toBe(0);
    // Order matters: turn then mirror is not mirror then turn.
    expect(applyTransforms(['rot90', 'mirrorH'], 0)).toBe(270);
    expect(applyTransforms(['mirrorH', 'rot90'], 0)).toBe(90);
  });
});

describe('odd one out', () => {
  it('singles out the key by exactly one property', () => {
    for (let seed = 0; seed < RUNS; seed++) {
      for (const d of LEVELS) {
        const q = generateFiguralOddOne(d, seeded(seed));
        expect(hasStemFigure(q.figure)).toBe(false);
        const cells = pics(q) as FigureCell[];
        const outs = (['shape', 'fill', 'count'] as const).map((a) => singledOut(cells, a));
        expect(outs.filter((x) => x === keyIdx(q)).length, `seed ${seed} ${d}`).toBeGreaterThanOrEqual(1);
        expect(
          outs.every((x) => x === null || x === keyIdx(q)),
          `seed ${seed} ${d}`,
        ).toBe(true);
      }
    }
  });
});

describe('figural topics', () => {
  it('are offered in TIU and drawn by the app', () => {
    for (const t of ['Deret Figural', 'Analogi Figural', 'Matriks Figural', 'Transformasi Figural', 'Figural Berbeda']) {
      expect(TOPICS.TIU).toContain(t);
      expect(PROCEDURAL_TOPICS.has(t)).toBe(true);
    }
  });

  it('generates the requested count of distinct questions with distinct patterns', () => {
    for (const t of ['Deret Figural', 'Analogi Figural', 'Matriks Figural', 'Transformasi Figural', 'Figural Berbeda']) {
      const qs = generateFigural(t, 'sedang', 8, { rand: seeded(7) });
      expect(qs).toHaveLength(8);
      expect(qs.every((q) => q.topic === t && q.source === 'procedural')).toBe(true);
      expect(new Set(qs.map((q) => q.hash)).size).toBe(8);
    }
  });

  it('puts patterns used recently in the bank last', () => {
    const first = generateFigural('Deret Figural', 'sulit', 6, { rand: seeded(3) });
    const recent = first.map((q) => q.figureMeta!.signature);
    const next = generateFigural('Deret Figural', 'sulit', 6, { rand: seeded(3), recent });
    expect(next.filter((q) => recent.includes(q.figureMeta!.signature)).length).toBeLessThan(2);
  });

  it('draws the matrix as a square grid and the transform with an arrow between', () => {
    const m = generateFiguralMatrix('mudah', seeded(3)).figure!;
    expect(figureSvg(m, 80)).toMatch(/^<svg [^>]*width="256" height="256"/);
    const t = generateFiguralTransform('mudah', seeded(3)).figure!;
    expect(figureSvg(t, 80)).toContain('→');
  });

  it('marks sets with pictures older versions cannot draw', () => {
    const old = makeWith(
      ARCHETYPES.find((a) => a.id === 'glyph-transform')!,
      'mudah',
      seeded(1),
    );
    const oldKind = { ...old, options: old.options.map((o) => ({ ...o, figure: { ...(o.figure as FigureCell), fill: 'solid' as const, count: 1 } })) };
    expect(newFigural(oldKind)).toBe(false);
    const hex = { ...oldKind, options: oldKind.options.map((o) => ({ ...o, figure: { ...(o.figure as FigureCell), shape: 'hexagon' as const } })) };
    expect(newFigural(hex)).toBe(true);
  });
});
