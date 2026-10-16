import { isCorrect } from './scoring';
import type { Difficulty, OptionLabel, Question } from './types';

/*
 * Names of the figural recipes (src/domain/figural), kept apart so pages that only show them, like
 * the score report, need not load the generators. A unit test keeps this in step with the recipes.
 */
export const FIGURAL_RECIPES: Record<string, { name: string; topic: string }> = {
  'glyph-series': { name: 'Deret satu bangun', topic: 'Deret Figural' },
  'glyph-analogy': { name: 'Analogi satu bangun', topic: 'Analogi Figural' },
  'glyph-matrix': { name: 'Matriks 3 × 3', topic: 'Matriks Figural' },
  'glyph-transform': { name: 'Putar dan cermin panah', topic: 'Transformasi Figural' },
  'glyph-odd': { name: 'Bangun yang berbeda', topic: 'Figural Berbeda' },
  orbit: { name: 'Deret orbit', topic: 'Deret Figural' },
  regions: { name: 'Deret ruang', topic: 'Deret Figural' },
  relay: { name: 'Deret estafet', topic: 'Deret Figural' },
  pie: { name: 'Juring berputar', topic: 'Deret Figural' },
  'scene-analogy': { name: 'Analogi adegan', topic: 'Analogi Figural' },
  'not-a-turn': { name: 'Bukan hasil putaran', topic: 'Figural Berbeda' },
  'scene-transform': { name: 'Putar dan cermin adegan', topic: 'Transformasi Figural' },
  'scene-matrix': { name: 'Matriks letak', topic: 'Matriks Figural' },
  'cube-net': { name: 'Jaring menjadi kubus', topic: 'Ruang dan Kubus' },
  'cube-to-net': { name: 'Kubus menjadi jaring', topic: 'Ruang dan Kubus' },
  'cube-opposite': { name: 'Sisi berhadapan', topic: 'Ruang dan Kubus' },
  'strokes-series': { name: 'Deret garis dan titik', topic: 'Deret Figural' },
  'strokes-pairs': { name: 'Pasangan garis dan titik', topic: 'Analogi Figural' },
  'strokes-odd': { name: 'Garis dan titik yang tidak cocok', topic: 'Figural Berbeda' },
  overlay: { name: 'Gabungan garis', topic: 'Gabungan Gambar' },
  'lines-transform': { name: 'Cermin gambar garis', topic: 'Transformasi Figural' },
  'lines-odd': { name: 'Yang tidak simetris', topic: 'Figural Berbeda' },
  fold: { name: 'Kertas dilipat dan dilubangi', topic: 'Transformasi Figural' },
};

/** The figural topics, in the order the app offers them. */
export const FIGURAL_TOPICS = ['Deret Figural', 'Analogi Figural', 'Matriks Figural', 'Transformasi Figural', 'Figural Berbeda', 'Ruang dan Kubus', 'Gabungan Gambar'] as const;

export interface FiguralMiss {
  archetype: string;
  name: string;
  topic: string;
  wrong: number;
  total: number;
  /** The level most of these questions had, to practise at. */
  difficulty: Difficulty;
}

/** Figural questions answered wrong or left blank, by recipe, most missed first. */
export function figuralMisses(questions: Question[], answers: Record<string, OptionLabel>): FiguralMiss[] {
  const by = new Map<string, { wrong: number; total: number; levels: Difficulty[] }>();
  for (const q of questions) {
    const id = q.figureMeta?.archetype;
    if (!id || !FIGURAL_RECIPES[id]) continue;
    const e = by.get(id) ?? { wrong: 0, total: 0, levels: [] };
    e.total++;
    if (!isCorrect(q, answers[q.id])) {
      e.wrong++;
      e.levels.push(q.difficulty);
    }
    by.set(id, e);
  }
  const mode = (ls: Difficulty[]) => (['sedang', 'mudah', 'sulit'] as Difficulty[]).sort((a, b) => ls.filter((x) => x === b).length - ls.filter((x) => x === a).length)[0];
  return [...by]
    .filter(([, e]) => e.wrong > 0)
    .map(([id, e]) => ({ archetype: id, ...FIGURAL_RECIPES[id], wrong: e.wrong, total: e.total, difficulty: mode(e.levels) }))
    .sort((a, b) => b.wrong - a.wrong || a.name.localeCompare(b.name));
}
