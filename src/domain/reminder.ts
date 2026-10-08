import type { PlanItem } from '../engine/studyPlan';

/**
 * Daily study reminder. Pure; the browser side lives in lib/reminder.ts.
 *
 * Browsers only let a web app show a notification while it runs, so the reminder is shown when
 * the app is open (or next opened) at or after the chosen time, once per local day.
 */

export const DEFAULT_REMINDER_TIME = '19:00';

/** "19:30" → minutes after midnight; null when malformed. */
export function parseTime(s: string | undefined): number | null {
  const m = s?.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Whether today's reminder is due: the time has passed and nothing was shown (or skipped) today. */
export function reminderDue(now: number, time: string, lastDay: string | undefined, today: string): boolean {
  const at = parseTime(time);
  if (at === null || lastDay === today) return false;
  const d = new Date(now);
  return d.getHours() * 60 + d.getMinutes() >= at;
}

export interface ReminderContent {
  title: string;
  body: string;
  /** Page the notification opens. */
  hash: string;
}

/** Text from today's plan items still to do; null when nothing is left, so no reminder is needed. */
export function reminderContent(items: PlanItem[]): ReminderContent | null {
  const left = items.filter((it) => !it.done);
  if (!left.length) return null;
  const parts = left.map((it) => {
    switch (it.kind) {
      case 'start':
        return 'kerjakan satu set Latihan Singkat';
      case 'simulation':
        return 'simulasi SKD penuh hari ini';
      case 'review':
        return `${it.count} ulangan jatuh tempo`;
      case 'practice':
        return `latih ${it.topics.slice(0, 2).join(' dan ')}`;
    }
  });
  const body = parts.join(', ');
  return {
    title: 'Waktunya belajar SKD',
    body: body.charAt(0).toUpperCase() + body.slice(1) + '.',
    hash: left.some((it) => it.kind === 'review') ? '#/review' : '#/',
  };
}
