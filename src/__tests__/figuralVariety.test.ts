import { describe, expect, it } from 'vitest';
import { ARCHETYPES, generateFigural, makeWith, type Rand } from '../domain/figural';
import { picDistance, picFeats } from '../domain/figural/features';
import { centrality } from '../domain/figural/options';
import type { Difficulty, Pic, Question } from '../domain/types';
import { seeded } from './figuralHelpers';

/*
 * Whether the key can be found without solving the question, and whether a topic's questions vary.
 * Two shortcuts a test-wise learner uses: pick the option most like all the others (the medoid), or
 * the option that agrees with the most common value of each property (majority vote). By chance an
 * option is the key 20% of the time.
 */

const LEVELS: Difficulty[] = ['mudah', 'sedang', 'sulit'];
const N = 200;

/** Index of the single option with the lowest (or highest) score, or -1 on a tie. */
function uniqueBest(scores: number[], lowest: boolean): number {
  const best = lowest ? Math.min(...scores) : Math.max(...scores);
  return scores.filter((s) => s === best).length === 1 ? scores.indexOf(best) : -1;
}

function majority(pics: Pic[]): number[] {
  const feats = pics.map((p) => new Map(picFeats(p).map((f) => [f.key, f.value])));
  const keys = [...new Set(feats.flatMap((f) => [...f.keys()]))];
  return feats.map((f) =>
    keys.reduce((s, k) => {
      const counts = new Map<unknown, number>();
      for (const x of feats) counts.set(x.get(k), (counts.get(x.get(k)) ?? 0) + 1);
      return s + +(counts.get(f.get(k)) === Math.max(...counts.values()));
    }, 0),
  );
}

function shortcutRates(make: (r: Rand) => Question) {
  let medoid = 0;
  let outlier = 0;
  let vote = 0;
  for (let seed = 0; seed < N; seed++) {
    const q = make(seeded(seed));
    const pics = q.options.map((o) => o.figure!);
    const key = q.options.findIndex((o) => o.label === q.answer);
    const c = centrality(pics, picDistance);
    medoid += +(uniqueBest(c, true) === key);
    outlier += +(uniqueBest(c, false) === key);
    vote += +(uniqueBest(majority(pics), false) === key);
  }
  return { medoid: medoid / N, outlier: outlier / N, vote: vote / N };
}

describe('the key cannot be found without solving', () => {
  // In odd-one-out questions the key is meant to differ from the rest; the shortcut is the question.
  for (const a of ARCHETYPES.filter((x) => !['glyph-odd', 'not-a-turn'].includes(x.id)))
    for (const d of a.levels)
      it(`${a.id} ${d}`, { timeout: 60_000 }, () => {
        const rates = shortcutRates((r) => makeWith(a, d, r));
        // Chance is 20%; allow room for small samples and for ties the draw cannot break.
        expect(rates.medoid, 'most like the others').toBeLessThanOrEqual(0.32);
        expect(rates.outlier, 'least like the others').toBeLessThanOrEqual(0.32);
        expect(rates.vote, 'majority vote per property').toBeLessThanOrEqual(0.36);
      });
});

describe('a topic varies', () => {
  const TOPICS = ['Deret Figural', 'Analogi Figural', 'Matriks Figural', 'Transformasi Figural', 'Figural Berbeda', 'Ruang dan Kubus', 'Gabungan Gambar'];
  for (const t of TOPICS)
    for (const d of LEVELS)
      it(`${t} ${d}`, { timeout: 60_000 }, () => {
        // Sets of ten questions, as a learner would make them.
        const sigs = new Map<string, number>();
        let total = 0;
        // Cubes take longer to make; fifteen sets show their spread just as well.
        for (let s = 0; s < (t === 'Ruang dan Kubus' ? 15 : 30); s++)
          for (const q of generateFigural(t, d, 10, { rand: seeded(1000 + s) })) {
            sigs.set(q.figureMeta!.signature, (sigs.get(q.figureMeta!.signature) ?? 0) + 1);
            total++;
          }
        const top = Math.max(...sigs.values()) / total;
        // Odd-one-out, cube and overlay questions have few rules by nature; there the settings and recipes vary.
        const odd = t === 'Figural Berbeda' || t === 'Ruang dan Kubus' || t === 'Gabungan Gambar';
        expect(top, 'share of the most common pattern').toBeLessThanOrEqual(odd ? 0.3 : 0.12);
        expect(sigs.size, 'different patterns in 300 questions').toBeGreaterThanOrEqual(odd ? 6 : 20);
      });
});
