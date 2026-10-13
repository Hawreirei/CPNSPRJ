import { describe, expect, it } from 'vitest';
import { cellDistance, cellKey, generateFiguralAnalogy, generateFiguralMatrix, generateFiguralSeries, generateFiguralTransform, type Rand } from '../domain/figural';
import { centrality } from '../domain/figural/options';
import type { Difficulty, FigureCell, Question } from '../domain/types';

/*
 * Whether the key can be found without solving the question. Two shortcuts a test-wise learner
 * uses: pick the option most like all the others (the medoid), or the option that agrees with the
 * most common value of each property (majority vote). By chance an option is the key 20% of the time.
 */

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
const N = 400;

/** Index of the single option with the lowest (or highest) score, or -1 on a tie. */
function uniqueBest(scores: number[], lowest: boolean): number {
  const best = lowest ? Math.min(...scores) : Math.max(...scores);
  return scores.filter((s) => s === best).length === 1 ? scores.indexOf(best) : -1;
}

function majority(cells: FigureCell[]): number[] {
  const props = [(c: FigureCell) => c.shape, (c: FigureCell) => c.fill, (c: FigureCell) => c.count, (c: FigureCell) => cellKey(c).split('|')[3]];
  return cells.map((c) =>
    props.reduce((s, f) => {
      const counts = new Map<unknown, number>();
      for (const x of cells) counts.set(f(x), (counts.get(f(x)) ?? 0) + 1);
      const top = Math.max(...counts.values());
      return s + +(counts.get(f(c)) === top);
    }, 0),
  );
}

function shortcutRates(make: (r: Rand) => Question) {
  let medoid = 0;
  let outlier = 0;
  let vote = 0;
  for (let seed = 0; seed < N; seed++) {
    const q = make(seeded(seed));
    const cells = q.options.map((o) => o.figure as FigureCell);
    const key = q.options.findIndex((o) => o.label === q.answer);
    const c = centrality(cells, cellDistance);
    medoid += +(uniqueBest(c, true) === key);
    outlier += +(uniqueBest(c, false) === key);
    vote += +(uniqueBest(majority(cells), false) === key);
  }
  return { medoid: medoid / N, outlier: outlier / N, vote: vote / N };
}

const GENERATORS: [string, (d: Difficulty, r: Rand) => Question][] = [
  ['Deret', generateFiguralSeries],
  ['Analogi', generateFiguralAnalogy],
  ['Matriks', generateFiguralMatrix],
  ['Transformasi', generateFiguralTransform],
];

describe('the key cannot be found without solving', () => {
  for (const [name, gen] of GENERATORS)
    for (const d of LEVELS)
      it(`${name} ${d}`, () => {
        const rates = shortcutRates((r) => gen(d, r));
        // Chance is 20%; allow some room for small samples and for ties the draw cannot break.
        expect(rates.medoid, 'most like the others').toBeLessThanOrEqual(0.3);
        expect(rates.outlier, 'least like the others').toBeLessThanOrEqual(0.3);
        expect(rates.vote, 'majority vote per property').toBeLessThanOrEqual(0.35);
      });
});
