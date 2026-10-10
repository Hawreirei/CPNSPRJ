import type { Attempt, Question, Subtest, TabAway } from './types';

/**
 * "Mode CAT": exam conditions on top of an ordinary exam attempt. Pure helpers only; the page
 * owns full screen and the visibility listener.
 *
 * With a locked order the learner works through each sub-test's block in turn and cannot go
 * back to an earlier one. This is an opt-in drill, not a copy of the official CAT: no official
 * BKN source found says the real exam locks sub-tests, so the app never presents it as such.
 */

/** Questions the learner may move to, inclusive. Without a locked order, all of them. */
export function allowedRange(attempt: Pick<Attempt, 'lockedOrder' | 'currentIndex'>, questions: Pick<Question, 'subtest'>[]): { from: number; to: number } {
  const last = questions.length - 1;
  if (!attempt.lockedOrder || !questions.length) return { from: 0, to: Math.max(0, last) };
  const i = Math.min(Math.max(attempt.currentIndex, 0), last);
  const s = questions[i].subtest;
  let from = i;
  while (from > 0 && questions[from - 1].subtest === s) from--;
  let to = i;
  while (to < last && questions[to + 1].subtest === s) to++;
  return { from, to };
}

export const canGo = (attempt: Pick<Attempt, 'lockedOrder' | 'currentIndex'>, questions: Pick<Question, 'subtest'>[], i: number): boolean => {
  const r = allowedRange(attempt, questions);
  return i >= r.from && i <= r.to;
};

/** With a locked order: the first question of the next sub-test block, if any. */
export function nextSection(attempt: Pick<Attempt, 'lockedOrder' | 'currentIndex'>, questions: Pick<Question, 'subtest'>[]): { index: number; subtest: Subtest } | null {
  if (!attempt.lockedOrder) return null;
  const { to } = allowedRange(attempt, questions);
  return to + 1 < questions.length ? { index: to + 1, subtest: questions[to + 1].subtest } : null;
}

/** Times away and their total, for the score report. */
export function tabAwaySummary(aways: TabAway[] = []): { count: number; totalMs: number; longestMs: number } {
  return {
    count: aways.length,
    totalMs: aways.reduce((n, a) => n + a.ms, 0),
    longestMs: aways.reduce((n, a) => Math.max(n, a.ms), 0),
  };
}
