import { isGraded, maxPerQuestion } from './examPackage';
import { attemptMode } from './practice';
import { isCorrect, scoreQuestion } from './scoring';
import type { Attempt, OptionLabel, Question, Subtest } from './types';

/*
 * Two exams on the same set, question by question (#46): what the learner now gets right that they
 * got wrong before, and the reverse. Keyed questions are right or wrong; graded ones (TKP and the
 * graded sub-tests of other packages) have no wrong answer, so they compare by score instead.
 */

/** `improved`: wrong → right, or a higher graded score. `worsened`: the reverse. */
export type Change = 'improved' | 'worsened' | 'still-wrong' | 'still-right';

export interface QuestionChange {
  id: string;
  subtest: Subtest;
  /** 1-based number in the newer attempt. */
  no: number;
  change: Change;
  before: { answer?: OptionLabel; score: number };
  after: { answer?: OptionLabel; score: number };
}

export interface AttemptComparison {
  total: { before: number; after: number };
  /** Sub-tests scored in both attempts, in the newer attempt's order. */
  perSubtest: { subtest: Subtest; before: number; after: number; max: number }[];
  durationMs: { before: number; after: number };
  changes: QuestionChange[];
  /** Questions in only one of the two attempts, e.g. after the set was edited. */
  notInBoth: number;
}

/** Exams finished on the same set before `a`, newest first: what `a` can be compared with. Practice never counts. */
export function earlierExams(a: Attempt, all: readonly Attempt[]): Attempt[] {
  return all.filter((x) => x.id !== a.id && x.setId === a.setId && x.result && attemptMode(x) === 'exam' && x.startedAt < a.startedAt).sort((x, y) => y.startedAt - x.startedAt);
}

export const attemptDuration = (a: Pick<Attempt, 'startedAt' | 'finishedAt' | 'endsAt'>) => (a.finishedAt ?? a.endsAt) - a.startedAt;

function changeOf(q: Question, before?: OptionLabel, after?: OptionLabel): Change {
  if (isGraded(q.subtest)) {
    const [b, n] = [scoreQuestion(q, before), scoreQuestion(q, after)];
    if (n > b) return 'improved';
    if (n < b) return 'worsened';
    return n === maxPerQuestion(q.subtest) ? 'still-right' : 'still-wrong';
  }
  const [b, n] = [isCorrect(q, before), isCorrect(q, after)];
  return b === n ? (n ? 'still-right' : 'still-wrong') : n ? 'improved' : 'worsened';
}

/**
 * Compare `after` with an earlier exam `before` on the same set. Each question is judged by its
 * current key and scores, so a key corrected since the earlier exam does not show up as a change.
 */
export function compareAttempts(before: Attempt, after: Attempt, questions: readonly Question[]): AttemptComparison {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const earlier = new Set(before.questionIds);
  const changes: QuestionChange[] = [];
  after.questionIds.forEach((id, i) => {
    const q = byId.get(id);
    if (!q || !earlier.has(id)) return;
    const [b, n] = [before.answers[id], after.answers[id]];
    changes.push({
      id,
      subtest: q.subtest,
      no: i + 1,
      change: changeOf(q, b, n),
      before: { answer: b, score: scoreQuestion(q, b) },
      after: { answer: n, score: scoreQuestion(q, n) },
    });
  });
  const later = new Set(after.questionIds);
  const notInBoth = after.questionIds.filter((id) => !earlier.has(id)).length + before.questionIds.filter((id) => !later.has(id)).length;
  const prev = new Map((before.result?.perSubtest ?? []).map((s) => [s.subtest, s]));
  return {
    total: { before: before.result?.total ?? 0, after: after.result?.total ?? 0 },
    perSubtest: (after.result?.perSubtest ?? [])
      .filter((s) => prev.has(s.subtest))
      .map((s) => ({ subtest: s.subtest, before: prev.get(s.subtest)!.score, after: s.score, max: s.max })),
    durationMs: { before: attemptDuration(before), after: attemptDuration(after) },
    changes,
    notInBoth,
  };
}

/** Questions worth practising again after a comparison: those that got worse, then those still wrong. */
export const toPractise = (c: AttemptComparison): string[] => [
  ...c.changes.filter((x) => x.change === 'worsened').map((x) => x.id),
  ...c.changes.filter((x) => x.change === 'still-wrong').map((x) => x.id),
];

/** "+5", "−3" or "±0", with a real minus sign. */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');
