import { attemptMode } from '../domain/practice';
import { SUBTESTS } from '../domain/types';
import type { Attempt, ReviewItem, StreakPause, StudyPlan, Subtest } from '../domain/types';
import { examSeries } from './analytics';
import { addDays } from './srs';

/**
 * Study streak and badges. Pure; days are local calendar days ("YYYY-MM-DD"), like the plan
 * and the notebook schedule. Activity is read from what the app already keeps: finished
 * attempts, the notebook's last review per question, and a log of the days reviews were graded
 * (a review overwrites `lastReviewedAt`, so without the log earlier review days would be lost).
 */

/** Most days kept in the review-day log; far more than any badge or streak display needs. */
export const MAX_LOGGED_DAYS = 400;
/** Most pauses kept; older ones lie before any streak worth counting. */
export const MAX_PAUSES = 20;
/** How far back a streak is followed (a guard, not a limit anyone will reach). */
const MAX_STREAK_DAYS = 3 * 366;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date of `t`, e.g. "2026-10-09". Sorts like the dates it names. */
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The review-day log with `day` added: unique, sorted, the latest MAX_LOGGED_DAYS. */
export function logDay(log: readonly string[], day: string): string[] {
  if (log.includes(day)) return [...log];
  return [...log, day].sort().slice(-MAX_LOGGED_DAYS);
}

/** Days with finished practice or exams, or graded reviews. */
export function activityDays(attempts: Pick<Attempt, 'finishedAt' | 'result'>[], reviews: Pick<ReviewItem, 'lastReviewedAt'>[], reviewLog: readonly string[] = []): Set<string> {
  const days = new Set(reviewLog);
  for (const a of attempts) if (a.result && a.finishedAt) days.add(dayKey(a.finishedAt));
  for (const r of reviews) if (r.lastReviewedAt) days.add(dayKey(r.lastReviewedAt));
  return days;
}

export function isStudyDay(t: number, plan?: StudyPlan): boolean {
  const days = plan?.studyDays;
  return !days?.length || days.includes(new Date(t).getDay());
}

/** Whether local day `day` falls in a pause; a pause without an end lasts until resumed. */
export function inPause(day: string, pauses: readonly StreakPause[] = []): boolean {
  return pauses.some((p) => p.from <= day && (!p.to || day <= p.to));
}

export interface Streak {
  /** Consecutive days with activity, not counting excused days. */
  days: number;
  activeToday: boolean;
  /** A pause covers today. */
  paused: boolean;
}

/**
 * Walks back from today. Today without activity yet does not break the streak (the day is not
 * over); nor does an inactive day that is not a study day in the plan, or that is paused. Any
 * day with activity counts, study day or not. The first inactive study day ends it.
 */
export function streak(days: ReadonlySet<string>, plan: StudyPlan | undefined, pauses: readonly StreakPause[] | undefined, now: number): Streak {
  const today = dayKey(now);
  const activeToday = days.has(today);
  const paused = inPause(today, pauses);
  const earliest = [...days].sort()[0];
  let count = activeToday ? 1 : 0;
  if (earliest) {
    for (let i = 1; i <= MAX_STREAK_DAYS; i++) {
      const t = addDays(now, -i);
      const key = dayKey(t);
      if (key < earliest) break;
      if (days.has(key)) count++;
      else if (isStudyDay(t, plan) && !inPause(key, pauses)) break;
    }
  }
  return { days: count, activeToday, paused };
}

/** Pause from today on. Open pauses are closed first, so at most one is open. */
export function startPause(pauses: readonly StreakPause[] = [], now: number): StreakPause[] {
  const today = dayKey(now);
  const closed = pauses.filter((p) => p.to || p.from < today).map((p) => (p.to ? p : { ...p, to: dayKey(addDays(now, -1)) }));
  return [...closed, { from: today }].slice(-MAX_PAUSES);
}

/** End the open pause yesterday, so today counts as an ordinary day again; drops a pause that never covered a day. */
export function endPause(pauses: readonly StreakPause[] = [], now: number): StreakPause[] {
  const yesterday = dayKey(addDays(now, -1));
  return pauses.map((p) => (p.to ? p : { ...p, to: yesterday })).filter((p) => p.from <= p.to!);
}

export interface BadgeInput {
  streakDays: number;
  /** Finished attempts, any order. */
  attempts: Attempt[];
  counts: Record<Subtest, number>;
}

/** Points a sub-test's exam score must rise, on the full-length scale, for its badge. */
export const RISE_POINTS = 20;

/** Answered questions across finished attempts. */
export const answeredCount = (attempts: Pick<Attempt, 'answers' | 'result'>[]) => attempts.reduce((n, a) => n + (a.result ? Object.keys(a.answers).length : 0), 0);

/** Ids of every badge the record supports today, in display order. */
export function earnedBadges({ streakDays, attempts, counts }: BadgeInput): string[] {
  const finished = attempts.filter((a) => a.result);
  const exams = finished.filter((a) => attemptMode(a) === 'exam');
  const answered = answeredCount(finished);
  const series = examSeries(finished, counts);
  const ids: string[] = [];
  if (exams.length) ids.push('first-exam');
  if (streakDays >= 7) ids.push('streak-7');
  if (streakDays >= 30) ids.push('streak-30');
  if (answered >= 100) ids.push('answered-100');
  if (answered >= 500) ids.push('answered-500');
  for (const s of SUBTESTS) {
    const [first, ...later] = series[s];
    if (first && later.some((p) => p.value - first.value >= RISE_POINTS)) ids.push(`rise-${s}`);
  }
  if (exams.some((a) => a.result!.passedAll)) ids.push('all-pass');
  return ids;
}

const LABELS: Record<string, string> = {
  'first-exam': 'Ujian pertama selesai',
  'streak-7': '7 hari beruntun',
  'streak-30': '30 hari beruntun',
  'answered-100': '100 soal dibahas',
  'answered-500': '500 soal dibahas',
  'all-pass': 'Semua sub-tes di atas ambang',
};

export function badgeLabel(id: string): string {
  const rise = id.match(/^rise-(TWK|TIU|TKP)$/);
  return rise ? `${rise[1]} naik ${RISE_POINTS} poin` : (LABELS[id] ?? id);
}
