import { describe, expect, it } from 'vitest';
import { ARCHETYPES, makeWith } from '../domain/figural';
import { describeFigure } from '../domain/describe';
import { cellSvg, figureSvg, hasStemFigure } from '../lib/figureSvg';
import type { Difficulty } from '../domain/types';
import { expectWellFormed, seeded } from './figuralHelpers';

/*
 * Every recipe, at every level it makes: five different options with one key, words for screen
 * readers, a drawing, and the recipe's own judge (the solver, or the stated steps) agreeing.
 */

const RUNS = 40;

describe('every figural recipe', () => {
  for (const a of ARCHETYPES)
    it(`${a.id}`, () => {
      for (const d of a.levels)
        for (let seed = 0; seed < RUNS; seed++) {
          const q = makeWith(a, d, seeded(seed));
          const ctx = `${a.id} ${d} seed ${seed}`;
          expectWellFormed(q, ctx);
          expect(q.topic).toBe(a.topic);
          expect(a.verify(q), `${ctx}: the recipe's own judge disagrees`).toBe(true);
          if (q.figure && hasStemFigure(q.figure)) {
            expect(describeFigure(q.figure)).not.toContain('undefined');
            expect(figureSvg(q.figure, 64)).toMatch(/^<svg /);
          }
          for (const o of q.options) {
            expect(cellSvg(o.figure!, 56)).not.toContain('NaN');
            expect(o.text).not.toContain('undefined');
          }
        }
    });
});

describe('levels', () => {
  const avg = (id: string, d: Difficulty) => {
    const a = ARCHETYPES.find((x) => x.id === id)!;
    const qs = Array.from({ length: 30 }, (_, i) => makeWith(a, d, seeded(100 + i)));
    return qs.reduce((s, q) => s + q.figureMeta!.complexity, 0) / qs.length;
  };
  for (const a of ARCHETYPES.filter((x) => x.levels.length === 3))
    it(`${a.id}: sulit is harder than mudah`, () => {
      expect(avg(a.id, 'sulit')).toBeGreaterThan(avg(a.id, 'mudah'));
    });
});
