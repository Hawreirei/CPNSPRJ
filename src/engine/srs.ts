import { isCorrect } from '../domain/scoring';
import type { Grade, OptionLabel, Question, ReviewItem } from '../domain/types';

/**
 * Spaced repetition for the mistake notebook: a small SM-2 variant with four grades.
 * Pure functions only; days are local calendar days, so "due tomorrow" flips at local midnight.
 */

export const START_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_INTERVAL = 365;

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local midnight `n` days after `t`'s day. Calendar arithmetic, so DST shifts never skip or repeat a day. */
export function addDays(t: number, n: number): number {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** New entries are due today, so a fresh mistake can be reviewed right away. */
export function newReview(questionId: string, now: number, sourceAttemptId?: string): ReviewItem {
  return { questionId, due: startOfDay(now), interval: 0, ease: START_EASE, reps: 0, lapses: 0, reasonTags: [], addedAt: now, sourceAttemptId };
}

/** The question was missed again in a later attempt: back to the start, due today. */
export function relapse(item: ReviewItem, now: number): ReviewItem {
  return { ...item, due: Math.min(item.due, startOfDay(now)), interval: 0, reps: 0, lapses: item.lapses + 1 };
}

/** Next interval and ease for a grade. Intervals never decrease from Lupa → Sulit → Baik → Mudah. */
export function nextInterval(item: Pick<ReviewItem, 'interval' | 'ease' | 'reps'>, grade: Grade): { interval: number; ease: number } {
  const { interval: i, reps } = item;
  let ease = item.ease;
  const good = reps === 0 ? 1 : reps === 1 ? 3 : Math.max(i + 1, Math.round(i * ease));
  let interval: number;
  switch (grade) {
    case 'lupa':
      ease = Math.max(MIN_EASE, ease - 0.2);
      interval = 1;
      break;
    case 'sulit':
      ease = Math.max(MIN_EASE, ease - 0.15);
      interval = reps === 0 ? 1 : Math.max(i, Math.round(i * 1.2));
      break;
    case 'baik':
      interval = good;
      break;
    case 'mudah':
      ease += 0.15;
      // Always beyond "Baik", even when a low ease makes the multiplier round down.
      interval = reps === 0 ? 3 : reps === 1 ? 6 : Math.max(good + 1, Math.round(i * ease * 1.3));
      break;
  }
  return { interval: Math.min(MAX_INTERVAL, Math.max(1, interval)), ease };
}

export function schedule(item: ReviewItem, grade: Grade, now: number): ReviewItem {
  const { interval, ease } = nextInterval(item, grade);
  return {
    ...item,
    interval,
    ease,
    reps: grade === 'lupa' ? 0 : item.reps + 1,
    lapses: grade === 'lupa' ? item.lapses + 1 : item.lapses,
    due: addDays(now, interval),
    lastReviewedAt: now,
    lastGrade: grade,
  };
}

export const isDue = (item: Pick<ReviewItem, 'due'>, now: number): boolean => item.due <= now;

export const reviewedToday = (items: Pick<ReviewItem, 'lastReviewedAt'>[], now: number): number =>
  items.filter((r) => (r.lastReviewedAt ?? 0) >= startOfDay(now)).length;

/** Today's queue: most overdue first, then most often forgotten, capped by what is left of the daily limit. */
export function dueQueue(items: ReviewItem[], now: number, dailyLimit: number): ReviewItem[] {
  const left = Math.max(0, dailyLimit - reviewedToday(items, now));
  return items
    .filter((r) => isDue(r, now))
    .sort((a, b) => a.due - b.due || b.lapses - a.lapses || a.addedAt - b.addedAt)
    .slice(0, left);
}

/** Questions from an attempt that belong in the notebook: wrong (TKP: not the top option), unanswered, or marked unsure. */
export function mistakesInAttempt(questions: Question[], answers: Record<string, OptionLabel>, flagged: string[]): string[] {
  const unsure = new Set(flagged);
  return questions.filter((q) => unsure.has(q.id) || !isCorrect(q, answers[q.id])).map((q) => q.id);
}

export function fmtInterval(days: number): string {
  if (days <= 1) return '1 hari';
  if (days < 14) return `${days} hari`;
  if (days < 60) return `${Math.round(days / 7)} minggu`;
  return `${Math.round(days / 30)} bulan`;
}

/** "hari ini", "besok", "dalam 5 hari", or "terlambat 2 hari" relative to `now`. */
export function fmtDue(due: number, now: number): string {
  const days = Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000);
  if (days < 0) return `terlambat ${-days} hari`;
  if (days === 0) return 'hari ini';
  if (days === 1) return 'besok';
  return `dalam ${fmtInterval(days)}`;
}
