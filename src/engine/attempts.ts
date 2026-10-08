import { db, getSetQuestions } from '../db';
import { computeResult } from '../domain/scoring';
import { SUBTESTS } from '../domain/types';
import type { Attempt, Question } from '../domain/types';
import { shuffle, uid } from '../lib/id';
import { passingForSet } from './sets';

export async function startAttempt(setId: string, opts: { shuffleQuestions: boolean; durationMinutes: number }): Promise<Attempt> {
  const set = await db.sets.get(setId);
  if (!set) throw new Error('Set tidak ditemukan');
  let questions = await getSetQuestions(set);
  if (opts.shuffleQuestions) {
    questions = SUBTESTS.flatMap((s) => shuffle(questions.filter((q) => q.subtest === s)));
  }
  const now = Date.now();
  const attempt: Attempt = {
    id: uid(),
    setId,
    setName: set.name,
    questionIds: questions.map((q) => q.id),
    startedAt: now,
    endsAt: now + opts.durationMinutes * 60_000,
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
  await db.attempts.update(id, { result, finishedAt });
  return { ...a, result, finishedAt };
}
