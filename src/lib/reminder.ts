import { useEffect } from 'react';
import { db, getSettings } from '../db';
import { reminderContent, reminderDue, type ReminderContent } from '../domain/reminder';
import { dayKey } from '../engine/streak';
import { todayPlan } from '../engine/today';

/**
 * Daily study reminder in the browser. A web app can only show a notification while it runs, so
 * the check happens when the app opens, when its tab becomes visible again, and every minute
 * while it is open. Scheduled notifications (Notification Triggers) were dropped by Chrome, and
 * Periodic Background Sync fires when the browser decides, not at a chosen time, so neither is
 * used: the settings screen says plainly what to expect, and the .ics export remains the reliable way.
 */

/** Meta row with the local day the reminder was last handled. Device state, so not in backups. */
const LAST_KEY = 'reminderLast';

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

export type PermissionResult = 'granted' | 'denied' | 'dismissed' | 'unsupported';

/** Ask for permission, only when the learner switches the reminder on. A denied permission is never asked again. */
export async function askPermission(): Promise<PermissionResult> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  const p = await Notification.requestPermission();
  return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'dismissed';
}

/** Treat today as handled, e.g. when the reminder is switched on after its time has passed. */
export const markHandledToday = (now = Date.now()) => db.meta.put({ key: LAST_KEY, value: dayKey(now) });

const lastHandled = async () => (await db.meta.get(LAST_KEY))?.value as string | undefined;

/** Claim today's reminder once, across tabs: true for the first caller of the day only. */
async function claimToday(time: string, now: number): Promise<boolean> {
  const today = dayKey(now);
  return db.transaction('rw', db.meta, async () => {
    const last = (await db.meta.get(LAST_KEY))?.value as string | undefined;
    if (!reminderDue(now, time, last, today)) return false;
    await db.meta.put({ key: LAST_KEY, value: today });
    return true;
  });
}

function show(c: ReminderContent, reg: ServiceWorkerRegistration | undefined) {
  const options: NotificationOptions = { body: c.body, tag: 'study-reminder', icon: new URL('pwa-192.png', document.baseURI).href, data: { hash: c.hash } };
  // Through the service worker where one is active: its notifications work on phones and handle clicks there.
  if (reg?.active) return reg.showNotification(c.title, options);
  const n = new Notification(c.title, options);
  n.onclick = () => {
    window.focus();
    location.hash = c.hash;
    n.close();
  };
}

/** Show today's reminder if it is due and today's plan still has something to do. */
export async function checkReminder(now = Date.now()): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const reminder = (await getSettings()).studyPlan?.reminder;
  if (!reminder?.enabled || !reminderDue(now, reminder.time, await lastHandled(), dayKey(now))) return;
  // Content first, so the day is claimed only right before the notification goes out.
  const content = reminderContent((await todayPlan(now)) ?? []);
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (!(await claimToday(reminder.time, now)) || !content) return;
  await show(content, reg);
}

/** Runs the check while the app is open; also follows clicks on notifications shown by the service worker. */
export function useStudyReminder(enabled: boolean) {
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'open-hash' && typeof e.data.hash === 'string') location.hash = e.data.hash;
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // The minute timer also runs while the tab is in the background, when a notification helps most.
    const check = () => void checkReminder().catch(() => {});
    // Coming back to the tab checks at once; going away does not, since a closing page may not live to show it.
    const onVisible = () => document.visibilityState === 'visible' && check();
    check();
    document.addEventListener('visibilitychange', onVisible);
    const t = setInterval(check, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(t);
    };
  }, [enabled]);
}
