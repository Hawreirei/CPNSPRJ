/*
 * Kamus Rumus TIU (#47): the formulas and patterns TIU questions keep using, written and checked by
 * hand (never by AI). The entries live in src/data/kamusTiu.ts and load with the page; only this
 * list of topics is needed elsewhere, to link an explanation to the right part of the dictionary.
 */

/** TIU topics the dictionary covers, in the order it shows them. */
export const KAMUS_TOPICS = ['Deret Angka', 'Aritmetika', 'Soal Cerita', 'Perbandingan Kuantitatif', 'Silogisme'] as const;
export type KamusTopic = (typeof KAMUS_TOPICS)[number];

export const hasKamus = (subtest: string, topic: string): topic is KamusTopic => subtest === 'TIU' && (KAMUS_TOPICS as readonly string[]).includes(topic);

export const kamusPath = (topic: KamusTopic) => `/kamus?topik=${encodeURIComponent(topic)}`;

export interface KamusEntry {
  id: string;
  topic: KamusTopic;
  title: string;
  /** Text with $...$ for math, shown with KaTeX. */
  formula: string;
  /** When to use it, or the trap to avoid. */
  note?: string;
  example: {
    question: string;
    solution: string;
    /** The example's arithmetic in mathjs syntax; a unit test checks it gives `answer`. Absent for logic. */
    expression?: string;
    answer?: number;
  };
}
