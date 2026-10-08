import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, saveSettings } from '../db';
import { parseTime, reminderContent, reminderDue } from '../domain/reminder';
import { newReview } from '../engine/srs';
import { dayKey } from '../engine/streak';
import { todayPlan } from '../engine/today';

const at = (h: number, m = 0, d = 9) => new Date(2026, 9, d, h, m).getTime(); // October 2026, local

describe('schedule', () => {
  it('parses HH:MM and rejects anything else', () => {
    expect(parseTime('19:30')).toBe(19 * 60 + 30);
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('7:30')).toBeNull();
    expect(parseTime(undefined)).toBeNull();
  });

  it('is due from the chosen minute on, at most once per local day', () => {
    const today = dayKey(at(19));
    expect(reminderDue(at(18, 59), '19:00', undefined, today)).toBe(false);
    expect(reminderDue(at(19, 0), '19:00', undefined, today)).toBe(true);
    expect(reminderDue(at(23, 59), '19:00', '2026-10-08', today)).toBe(true);
    // Already shown (or skipped) today.
    expect(reminderDue(at(21), '19:00', today, today)).toBe(false);
    // Next day, after midnight but before the time: not yet.
    expect(reminderDue(at(0, 30, 10), '19:00', today, dayKey(at(0, 30, 10)))).toBe(false);
    expect(reminderDue(at(19, 5, 10), '19:00', today, dayKey(at(19, 5, 10)))).toBe(true);
    expect(reminderDue(at(20), 'nanti', undefined, today)).toBe(false);
  });
});

describe('content', () => {
  it('lists what is left from today’s plan and opens the notebook when reviews are due', () => {
    expect(
      reminderContent([
        { kind: 'review', count: 12, minutes: 18, done: false },
        { kind: 'practice', topics: ['Deret Angka', 'Silogisme', 'Analogi'], setId: 's', minutes: 40, done: false },
      ]),
    ).toEqual({ title: 'Waktunya belajar SKD', body: '12 ulangan jatuh tempo, latih Deret Angka dan Silogisme.', hash: '#/review' });
  });

  it('leaves out finished items and opens the dashboard otherwise', () => {
    expect(
      reminderContent([
        { kind: 'review', count: 0, minutes: 2, done: true },
        { kind: 'simulation', minutes: 100, done: false },
      ]),
    ).toEqual({ title: 'Waktunya belajar SKD', body: 'Simulasi SKD penuh hari ini.', hash: '#/' });
    expect(reminderContent([{ kind: 'start', minutes: 30, done: false }])?.body).toBe('Kerjakan satu set Latihan Singkat.');
  });

  it('says nothing when the day is done or empty', () => {
    expect(reminderContent([{ kind: 'review', count: 0, minutes: 2, done: true }])).toBeNull();
    expect(reminderContent([])).toBeNull();
  });
});

describe('today’s plan from the database', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('is null without a plan, and counts due reviews with one', async () => {
    expect(await todayPlan(at(19))).toBeNull();
    await saveSettings({ studyPlan: { minutesPerDay: 60, simulationDay: 6, reminder: { enabled: true, time: '19:00' } } });
    await db.reviews.bulkPut([newReview('q1', at(8)), newReview('q2', at(8))]);
    const items = await todayPlan(at(19));
    expect(items).toContainEqual(expect.objectContaining({ kind: 'review', count: 2, done: false }));
    expect(reminderContent(items!)?.body).toContain('2 ulangan jatuh tempo');
  });
});

describe('service worker click handler (public/sw-notify.js)', () => {
  type Handler = (e: unknown) => void;
  function load(windows: { url: string; focus: () => Promise<void>; postMessage: (m: unknown) => void }[]) {
    let onClick: Handler | undefined;
    const openWindow = vi.fn(async () => {});
    const self = {
      registration: { scope: 'https://app.example/skd/' },
      clients: { matchAll: async () => windows, openWindow },
      addEventListener: (type: string, h: Handler) => type === 'notificationclick' && (onClick = h),
    };
    new Function('self', readFileSync('public/sw-notify.js', 'utf8'))(self);
    const click = async (data: unknown) => {
      let done: Promise<unknown> = Promise.resolve();
      const close = vi.fn();
      onClick!({ notification: { data, close }, waitUntil: (p: Promise<unknown>) => (done = p) });
      await done;
      return close;
    };
    return { click, openWindow };
  }

  it('focuses an open app window and sends it the page to show', async () => {
    const w = { url: 'https://app.example/skd/#/', focus: vi.fn(async () => {}), postMessage: vi.fn() };
    const { click, openWindow } = load([{ url: 'https://other.example/', focus: vi.fn(), postMessage: vi.fn() }, w]);
    const close = await click({ hash: '#/review' });
    expect(close).toHaveBeenCalled();
    expect(w.focus).toHaveBeenCalled();
    expect(w.postMessage).toHaveBeenCalledWith({ type: 'open-hash', hash: '#/review' });
    expect(openWindow).not.toHaveBeenCalled();
  });

  it('opens the app on that page when no window is open, the dashboard by default', async () => {
    const { click, openWindow } = load([]);
    await click({ hash: '#/review' });
    expect(openWindow).toHaveBeenCalledWith('https://app.example/skd/#/review');
    await click(null);
    expect(openWindow).toHaveBeenLastCalledWith('https://app.example/skd/#/');
  });
});
