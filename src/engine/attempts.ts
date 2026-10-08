import { db, getSetQuestions } from '../db';
import { computeResult } from '../domain/scoring';
import { filterQuestions, UNTIMED, type QuestionFilter } from '../domain/practice';
import { SUBTESTS } from '../domain/types';
import type { Attempt, AttemptMode, Question } from '../domain/types';
import { uid } from '../lib/id';
import { shuffleUnits } from '../domain/groups';
import { recordMistakes } from './review';
import { passingForSet } from './sets';

export async function startAttempt(
  setId: string,
  opts: {
    shuffleQuestions: boolean;
    /** 0 = no time limit (practice only). */
    durationMinutes: number;
    mode?: AttemptMode;
    filter?: QuestionFilter;
  },
): Promise<Attempt> {
  const set = await db.sets.get(setId);
  if (!set) throw new Error('Set tidak ditemukan');
  const mode = opts.mode ?? 'exam';
  let questions = await getSetQuestions(set);
  if (mode === 'practice') questions = filterQuestions(questions, opts.filter);
  if (!questions.length) throw new Error('Tidak ada soal yang cocok dengan pilihan ini.');
  if (opts.shuffleQuestions) {
    // A reading passage's questions move as one block, in their own order.
    questions = SUBTESTS.flatMap((s) => shuffleUnits(questions.filter((q) => q.subtest === s)));
  }
  const now = Date.now();
  const attempt: Attempt = {
    id: uid(),
    setId,
    setName: set.name,
    mode,
    questionIds: questions.map((q) => q.id),
    startedAt: now,
    endsAt: opts.durationMinutes > 0 ? now + opts.durationMinutes * 60_000 : UNTIMED,
    answers: {},
    flagged: [],
    timeSpent: {},
    currentIndex: 0,
    passing: await passingForSet(set, questions),
  };
  await db.attempts.add(attempt);
  return attempt;
}

export async function attemptQuestions(a: Attempt): Promise<Question[]> {
  return (await db.questions.bulkGet(a.questionIds)).filter((q): q is Question => !!q);
}

export async function finishAttempt(id: string): Promise<Attempt | undefined> {
  const a = await db.attempts.get(id);
  if (!a) return;
  if (a.result) return a;
  const questions = await attemptQuestions(a);
  const result = computeResult(questions, a.answers, a.passing);
  const finishedAt = Math.min(Date.now(), a.endsAt);
  // One transaction, so an attempt is never marked finished without its mistakes in the notebook.
  // Runs once per attempt: the early return above skips attempts that already have a result.
  await db.transaction('rw', [db.attempts, db.reviews], async () => {
    await db.attempts.update(id, { result, finishedAt });
    await recordMistakes(a, questions);
  });
  return { ...a, result, finishedAt };
}
