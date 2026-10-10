import { db } from '../db';
import type { Attempt, Grade, Question, ReasonTag, ReviewItem } from '../domain/types';
import { mistakesInAttempt, newReview, relapse, schedule } from './srs';
import { dayKey, logDay } from './streak';

/** Meta row with the days reviews were graded, for the streak (see engine/streak.ts). */
export const REVIEW_DAYS_KEY = 'reviewDays';

export async function getReviewDays(): Promise<string[]> {
  return ((await db.meta.get(REVIEW_DAYS_KEY))?.value as string[] | undefined) ?? [];
}

/**
 * Add an attempt's mistakes to the notebook. New questions are due today; questions already
 * in the notebook start over, since they were missed again. Returns how many were added or reset.
 */
export async function recordMistakes(a: Pick<Attempt, 'id' | 'answers' | 'flagged'>, questions: Question[], now = Date.now()): Promise<number> {
  const ids = mistakesInAttempt(questions, a.answers, a.flagged);
  if (!ids.length) return 0;
  await db.transaction('rw', db.reviews, async () => {
    const existing = await db.reviews.bulkGet(ids);
    await db.reviews.bulkPut(ids.map((id, i) => (existing[i] ? relapse(existing[i], now) : newReview(id, now, a.id))));
  });
  return ids.length;
}

/**
 * One-time catch-up for attempts finished before the notebook existed.
 * Only adds questions not yet in the notebook; existing schedules are left alone.
 */
export async function backfillFromHistory(now = Date.now()): Promise<number> {
  const attempts = (await db.attempts.orderBy('startedAt').toArray()).filter((a) => a.result);
  const added = new Map<string, ReviewItem>();
  for (const a of attempts) {
    const questions = (await db.questions.bulkGet(a.questionIds)).filter((q): q is Question => !!q);
    for (const id of mistakesInAttempt(questions, a.answers, a.flagged)) if (!added.has(id)) added.set(id, newReview(id, now, a.id));
  }
  let count = 0;
  await db.transaction('rw', db.reviews, async () => {
    const existing = await db.reviews.bulkGet([...added.keys()]);
    const fresh = [...added.values()].filter((_, i) => !existing[i]);
    await db.reviews.bulkAdd(fresh);
    count = fresh.length;
  });
  return count;
}

export async function gradeReview(questionId: string, grade: Grade, now = Date.now()): Promise<ReviewItem | undefined> {
  return db.transaction('rw', db.reviews, db.meta, async () => {
    const item = await db.reviews.get(questionId);
    if (!item) return;
    const next = schedule(item, grade, now);
    await db.reviews.put(next);
    await logReviewDay(now);
    return next;
  });
}

/** Record that reviews were graded today, for the streak (notebook questions and flashcards alike). */
export async function logReviewDay(now = Date.now()): Promise<void> {
  const days = await getReviewDays();
  const today = dayKey(now);
  if (!days.includes(today)) await db.meta.put({ key: REVIEW_DAYS_KEY, value: logDay(days, today) });
}

export async function setReasonTags(questionId: string, reasonTags: ReasonTag[]): Promise<void> {
  await db.reviews.update(questionId, { reasonTags });
}

export async function removeReview(questionId: string): Promise<void> {
  await db.reviews.delete(questionId);
}
