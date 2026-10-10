import { attemptMode } from '../domain/practice';
import { MAX_PER_QUESTION } from '../domain/scoring';
import { SUBTESTS } from '../domain/types';
import type { Attempt, StudyPlan, Subtest } from '../domain/types';
import { examSeries } from './analytics';
import { addDays, startOfDay } from './srs';

/**
 * Daily targets and readiness from the learner's plan. Pure; days are local calendar days,
 * like the mistake notebook's schedule. The CPNS 2026 schedule was not announced when this
 * was written, so the exam date is optional and nothing here depends on it being set.
 */

export const DEFAULT_MINUTES_PER_DAY = 60;
export const DEFAULT_SIMULATION_DAY = 6; // Saturday
/** Default target: pass mark plus this share, so a good day is not needed just to pass. */
export const TARGET_MARGIN = 0.1;
/** Rough minutes per notebook review: answer, read the explanation, grade. */
export const MINUTES_PER_REVIEW = 1.5;
/** Practice is only suggested when at least this much of the daily budget is left. */
export const MIN_PRACTICE_MINUTES = 10;
/** Recent exams used for readiness. */
export const READINESS_EXAMS = 3;
/** From this many days before the exam, advise reviewing over new material. */
export const FINAL_WEEK_DAYS = 7;

export const WEEKDAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** "2026-11-21" → local midnight of that day; null when malformed. */
export function parseLocalDate(s: string | undefined): number | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d.getTime() : null;
}

/** Whole calendar days from today to `date`: 0 on the day, negative once past. */
export function daysUntil(date: number, now: number): number {
  return Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
}

export function targetFor(s: Subtest, plan: StudyPlan, passing: Record<Subtest, number>, counts: Record<Subtest, number>): number {
  const max = counts[s] * MAX_PER_QUESTION;
  return Math.min(max, plan.targets?.[s] ?? Math.ceil(passing[s] * (1 + TARGET_MARGIN)));
}

export type PlanItem =
  | { kind: 'start'; minutes: number; done: false }
  | { kind: 'review'; count: number; minutes: number; done: boolean }
  | { kind: 'practice'; topics: string[]; setId: string; minutes: number; done: boolean }
  | { kind: 'simulation'; minutes: number; done: boolean };

export interface DayInput {
  plan: StudyPlan;
  now: number;
  /** Finished attempts, any order. */
  attempts: Attempt[];
  /** Today's notebook queue (already capped by the daily limit) and reviews done today. */
  reviewQueue: number;
  reviewedToday: number;
  /** Topics to practise and the set to practise them on, from the latest attempt. */
  weak?: { topics: string[]; setId: string };
  /** Length of a full simulation in minutes. */
  simulationMinutes: number;
}

/**
 * What to do today, within the daily budget: the weekly simulation on its day, then the
 * notebook queue, then practice on weak topics with whatever time is left. Items finished
 * today stay on the list, marked done, so the day's progress is visible.
 */
export function dailyPlan(d: DayInput): PlanItem[] {
  const budget = d.plan.minutesPerDay ?? DEFAULT_MINUTES_PER_DAY;
  const today = startOfDay(d.now);
  const finishedToday = (mode: 'exam' | 'practice') => d.attempts.some((a) => a.result && attemptMode(a) === mode && (a.finishedAt ?? 0) >= today);
  const items: PlanItem[] = [];
  if (!d.attempts.some((a) => a.result)) items.push({ kind: 'start', minutes: 30, done: false });

  const simDay = d.plan.simulationDay ?? DEFAULT_SIMULATION_DAY;
  let used = 0;
  if (new Date(d.now).getDay() === simDay) {
    items.push({ kind: 'simulation', minutes: d.simulationMinutes, done: finishedToday('exam') });
    used += d.simulationMinutes;
  }
  if (d.reviewQueue > 0 || d.reviewedToday > 0) {
    const minutes = Math.ceil(Math.max(d.reviewQueue, 1) * MINUTES_PER_REVIEW);
    items.push({ kind: 'review', count: d.reviewQueue, minutes, done: d.reviewQueue === 0 });
    used += d.reviewQueue ? minutes : 0;
  }
  const left = budget - used;
  if (d.weak?.topics.length && left >= MIN_PRACTICE_MINUTES) {
    items.push({ kind: 'practice', topics: d.weak.topics, setId: d.weak.setId, minutes: left, done: finishedToday('practice') });
  }
  return items;
}

export interface Readiness {
  subtest: Subtest;
  /** Recent exams considered (at most READINESS_EXAMS). */
  n: number;
  average: number;
  target: number;
  /** How many of those exams reached the target. */
  reached: number;
}

/** Recent exam scores against the targets. Empty without exams; never a probability of passing. */
export function readiness(attempts: Attempt[], plan: StudyPlan, passing: Record<Subtest, number>, counts: Record<Subtest, number>): Readiness[] {
  const series = examSeries(attempts, counts);
  return SUBTESTS.flatMap((s) => {
    const recent = series[s].slice(-READINESS_EXAMS);
    if (!recent.length) return [];
    const target = targetFor(s, plan, passing, counts);
    const average = Math.round(recent.reduce((n, p) => n + p.value, 0) / recent.length);
    return [{ subtest: s, n: recent.length, average, target, reached: recent.filter((p) => p.value >= target).length }];
  });
}

/** First date on or after `from` that falls on `weekday`. */
export function nextWeekday(from: number, weekday: number): number {
  const d = new Date(startOfDay(from)).getDay();
  return addDays(from, (weekday - d + 7) % 7);
}
