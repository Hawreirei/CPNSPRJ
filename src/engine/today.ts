import { db, getSettings } from '../db';
import { weakTopics } from '../domain/scoring';
import type { Attempt } from '../domain/types';
import { recommendations } from './analytics';
import { attemptQuestions } from './attempts';
import { dueQueue, reviewedToday } from './srs';
import { dailyPlan, type PlanItem } from './studyPlan';

export type WeakFocus = { topics: string[]; setId: string };

/** Topics to practise today: the latest attempt's weak-topic advice, else its weakest topics. Attempts newest first. */
export async function weakFocus(attempts: Attempt[]): Promise<WeakFocus | undefined> {
  const latest = attempts.find((a) => a.result);
  if (!latest || !(await db.sets.get(latest.setId))) return undefined;
  const advice = recommendations(latest, await attemptQuestions(latest)).find((r) => r.kind === 'weak-topic')?.practiceTopics;
  const topics =
    advice ??
    weakTopics(latest.result!.topics)
      .slice(0, 3)
      .map((t) => t.topic);
  return topics.length ? { topics, setId: latest.setId } : undefined;
}

/** Today's plan items, as the dashboard shows them; null without a plan. */
export async function todayPlan(now: number): Promise<PlanItem[] | null> {
  const settings = await getSettings();
  if (!settings.studyPlan) return null;
  const [attempts, reviews] = await Promise.all([db.attempts.orderBy('startedAt').reverse().toArray(), db.reviews.toArray()]);
  return dailyPlan({
    plan: settings.studyPlan,
    now,
    attempts: attempts.filter((a) => a.result),
    reviewQueue: dueQueue(reviews, now, settings.reviewDailyLimit).length,
    reviewedToday: reviewedToday(reviews, now),
    weak: await weakFocus(attempts),
    simulationMinutes: settings.durationMinutes,
  });
}
