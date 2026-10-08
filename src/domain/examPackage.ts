import type { OptionLabel, Question, QuestionOption, Subtest } from './types';

/**
 * Exam packages (#37): an exam's sub-tests and how each is scored, as data rather than as
 * `subtest === 'TKP'` checks spread through the code.
 *
 * Stage 1 (this module): SKD CPNS is the only package and `Subtest` is still the fixed union, so
 * behaviour is exactly as before. Code asks a sub-test's scoring rule instead of naming TKP.
 * Later stages (docs/paket-ujian.md) turn sub-tests into ids from the active package, so another
 * exam (PPPK first) can be added from its official document without touching scoring code.
 */

/**
 * `keyed`: one correct option worth `correct` points, everything else 0 (SKD TWK and TIU).
 * `graded`: every option has its own score from `min` to `max`; no option is "wrong" (SKD TKP).
 */
export type ScoringRule = { kind: 'keyed'; correct: number } | { kind: 'graded'; min: number; max: number };

export interface SubtestSpec {
  id: Subtest;
  name: string;
  scoring: ScoringRule;
}

export interface ExamPackage {
  id: string;
  name: string;
  /** Where the numbers come from; only official documents for anything beyond the built-in package. */
  source: string;
  subtests: SubtestSpec[];
}

/** SKD CPNS as the app has always scored it. Its numbers live in Settings and the syllabus profile. */
export const SKD_CPNS: ExamPackage = {
  id: 'skd-cpns',
  name: 'SKD CPNS',
  source: 'Bawaan aplikasi',
  subtests: [
    { id: 'TWK', name: 'Tes Wawasan Kebangsaan', scoring: { kind: 'keyed', correct: 5 } },
    { id: 'TIU', name: 'Tes Intelegensia Umum', scoring: { kind: 'keyed', correct: 5 } },
    { id: 'TKP', name: 'Tes Karakteristik Pribadi', scoring: { kind: 'graded', min: 1, max: 5 } },
  ],
};

const RULES = new Map(SKD_CPNS.subtests.map((s) => [s.id, s.scoring]));

export function scoringOf(subtest: Subtest): ScoringRule {
  return RULES.get(subtest)!;
}

/** Every option scores (TKP): there is a best option, but no wrong one. */
export const isGraded = (subtest: Subtest) => scoringOf(subtest).kind === 'graded';

/** Most points one question of this sub-test can earn. */
export function maxPerQuestion(subtest: Subtest): number {
  const r = scoringOf(subtest);
  return r.kind === 'keyed' ? r.correct : r.max;
}

/** Whether `option` earns the question's top score: the key, or a graded sub-test's best option. */
export const isTopOption = (q: Pick<Question, 'subtest'>, option: Pick<QuestionOption, 'score'> | undefined) => !!option && option.score === maxPerQuestion(q.subtest);

/** Options that earn the top score: the key for a keyed sub-test, every best option for a graded one. */
export function topOptions(q: Pick<Question, 'subtest' | 'options' | 'answer'>): OptionLabel[] {
  if (isGraded(q.subtest)) return q.options.filter((o) => isTopOption(q, o)).map((o) => o.label);
  return q.answer ? [q.answer] : [];
}

/** Score a keyed option gets: the full mark for the key, nothing for the rest. */
export function keyedScore(subtest: Subtest, isKey: boolean): number {
  const r = scoringOf(subtest);
  return r.kind === 'keyed' && isKey ? r.correct : 0;
}

/** A graded score clamped to the sub-test's range. */
export function clampGraded(subtest: Subtest, score: number): number {
  const r = scoringOf(subtest);
  return r.kind === 'graded' ? Math.max(r.min, Math.min(r.max, Math.round(score))) : score;
}
