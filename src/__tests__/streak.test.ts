import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { exportBackup, importBackup } from '../db/backup';
import { DEFAULT_SETTINGS } from '../domain/blueprint';
import { computeResult } from '../domain/scoring';
import type { Attempt, OptionLabel, Question, ReviewItem, Subtest } from '../domain/types';
import { getReviewDays, gradeReview } from '../engine/review';
import { newReview } from '../engine/srs';
import { activityDays, answeredCount, badgeLabel, dayKey, earnedBadges, endPause, inPause, logDay, MAX_LOGGED_DAYS, startPause, streak } from '../engine/streak';

const at = (y: number, m: number, d: number, h = 9, min = 0) => new Date(y, m - 1, d, h, min).getTime();
// Friday 9 October 2026.
const FRI = at(2026, 10, 9, 20);
const days = (...keys: string[]) => new Set(keys);

describe('days', () => {
  it('keys by local calendar date, switching at local midnight', () => {
    expect(dayKey(at(2026, 10, 9, 23, 59))).toBe('2026-10-09');
    expect(dayKey(at(2026, 10, 10, 0, 1))).toBe('2026-10-10');
    expect(dayKey(at(2027, 1, 1, 0, 0))).toBe('2027-01-01');
  });

  it('collects activity from finished attempts, reviews and the review log', () => {
    const set = activityDays(
      [
        { finishedAt: at(2026, 10, 7), result: {} as Attempt['result'] },
        { finishedAt: at(2026, 10, 6) }, // unfinished: no result
      ],
      [{ lastReviewedAt: at(2026, 10, 8, 23, 30) }, {}],
      ['2026-10-01'],
    );
    expect([...set].sort()).toEqual(['2026-10-01', '2026-10-07', '2026-10-08']);
  });

  it('keeps the log unique, sorted and bounded', () => {
    expect(logDay(['2026-10-02'], '2026-10-01')).toEqual(['2026-10-01', '2026-10-02']);
    expect(logDay(['2026-10-01'], '2026-10-01')).toEqual(['2026-10-01']);
    const long = Array.from({ length: MAX_LOGGED_DAYS }, (_, i) => dayKey(at(2025, 1, 1 + i)));
    const next = logDay(long, '2099-01-01');
    expect(next).toHaveLength(MAX_LOGGED_DAYS);
    expect(next.at(-1)).toBe('2099-01-01');
    expect(next[0]).toBe(long[1]);
  });
});

describe('streak', () => {
  it('counts consecutive days, and today without activity yet does not break it', () => {
    expect(streak(days('2026-10-07', '2026-10-08', '2026-10-09'), undefined, [], FRI)).toEqual({ days: 3, activeToday: true, paused: false });
    expect(streak(days('2026-10-07', '2026-10-08'), undefined, [], FRI)).toMatchObject({ days: 2, activeToday: false });
    expect(streak(days('2026-10-06', '2026-10-08'), undefined, [], FRI).days).toBe(1);
    expect(streak(days('2026-10-07'), undefined, [], FRI).days).toBe(0);
    expect(streak(days(), undefined, [], FRI).days).toBe(0);
  });

  it('crosses midnight by the local date, not by 24 hours', () => {
    // 23:59 then 00:01 two minutes later: two days.
    const s = days(dayKey(at(2026, 10, 8, 23, 59)), dayKey(at(2026, 10, 9, 0, 1)));
    expect(streak(s, undefined, [], at(2026, 10, 9, 0, 2)).days).toBe(2);
    // Across a month and a year.
    expect(streak(days('2026-12-30', '2026-12-31', '2027-01-01'), undefined, [], at(2027, 1, 1, 8)).days).toBe(3);
  });

  it('skips inactive days outside the plan’s study days, but counts activity on them', () => {
    const weekdays = { studyDays: [1, 2, 3, 4, 5] }; // Mon–Fri
    // Thu 8, Fri 9 … Mon 12: the weekend in between does not break it.
    const mon = at(2026, 10, 12, 20);
    expect(streak(days('2026-10-08', '2026-10-09', '2026-10-12'), weekdays, [], mon).days).toBe(3);
    // Without the plan it does.
    expect(streak(days('2026-10-08', '2026-10-09', '2026-10-12'), undefined, [], mon).days).toBe(1);
    // Saturday study still adds a day.
    expect(streak(days('2026-10-09', '2026-10-10', '2026-10-12'), weekdays, [], mon).days).toBe(3);
    // A missed weekday breaks it.
    expect(streak(days('2026-10-07', '2026-10-09'), weekdays, [], FRI).days).toBe(1);
  });

  it('skips paused days, open or closed', () => {
    const s = days('2026-10-01', '2026-10-02', '2026-10-06', '2026-10-07');
    expect(streak(s, undefined, [], at(2026, 10, 7)).days).toBe(2);
    expect(streak(s, undefined, [{ from: '2026-10-03', to: '2026-10-05' }], at(2026, 10, 7)).days).toBe(4);
    expect(streak(s, undefined, [{ from: '2026-10-04', to: '2026-10-05' }], at(2026, 10, 7)).days).toBe(2);
    // Paused since yesterday and still paused.
    const open = streak(days('2026-10-01', '2026-10-02'), undefined, [{ from: '2026-10-03' }], at(2026, 10, 9));
    expect(open).toEqual({ days: 2, activeToday: false, paused: true });
  });

  it('starts and ends pauses so that each covers whole days', () => {
    const p = startPause([], at(2026, 10, 3));
    expect(p).toEqual([{ from: '2026-10-03' }]);
    expect(inPause('2026-10-20', p)).toBe(true);
    const ended = endPause(p, at(2026, 10, 6));
    expect(ended).toEqual([{ from: '2026-10-03', to: '2026-10-05' }]);
    expect(inPause('2026-10-06', ended)).toBe(false);
    // Resumed on the same day it started: nothing was paused.
    expect(endPause(startPause([], FRI), FRI)).toEqual([]);
    // Pausing again on the same day does not stack.
    expect(startPause(startPause([], FRI), FRI)).toEqual([{ from: '2026-10-09' }]);
  });

  describe('time zones', () => {
    const tz = process.env.TZ;
    afterEach(() => {
      process.env.TZ = tz;
    });

    it('keeps one day per calendar day across a DST change', () => {
      process.env.TZ = 'America/New_York'; // clocks go back on 1 Nov 2026
      const s = days('2026-10-31', '2026-11-01', '2026-11-02');
      expect(streak(s, undefined, [], at(2026, 11, 2, 23, 30)).days).toBe(3);
      expect(dayKey(at(2026, 11, 1, 23, 30))).toBe('2026-11-01');
    });

    it('uses the device’s local date, e.g. WIB', () => {
      process.env.TZ = 'Asia/Jakarta';
      // 23:30 WIB on the 8th is 16:30 UTC; still the 8th locally.
      expect(dayKey(Date.UTC(2026, 9, 8, 16, 30))).toBe('2026-10-08');
      expect(dayKey(Date.UTC(2026, 9, 8, 17, 30))).toBe('2026-10-09');
    });
  });
});

describe('badges', () => {
  const { counts } = DEFAULT_SETTINGS;
  const LABELS: OptionLabel[] = ['A', 'B', 'C', 'D', 'E'];
  let n = 0;
  const q = (subtest: Subtest): Question => ({
    id: `q${++n}`,
    subtest,
    topic: 't',
    difficulty: 'sedang',
    stem: 'Soal',
    options: LABELS.map((label) => ({ label, text: label, score: label === 'A' ? 5 : 0 })),
    answer: 'A',
    explanation: '',
    flags: [],
    locked: false,
    starred: false,
    hash: 'x',
    source: 'ai',
    createdAt: 0,
    updatedAt: 0,
  });
  /** An exam of 10 TIU questions with `right` correct. */
  function exam(right: number, startedAt: number, mode: Attempt['mode'] = 'exam'): Attempt {
    const qs = Array.from({ length: 10 }, () => q('TIU'));
    const answers = Object.fromEntries(qs.map((x, i) => [x.id, (i < right ? 'A' : 'B') as OptionLabel]));
    const passing = { TWK: 0, TIU: 0, TKP: 0 };
    return {
      id: `a${++n}`,
      setId: 's',
      setName: 'S',
      mode,
      questionIds: qs.map((x) => x.id),
      startedAt,
      endsAt: startedAt + 1e6,
      finishedAt: startedAt + 1e5,
      answers,
      flagged: [],
      timeSpent: {},
      currentIndex: 0,
      passing,
      result: computeResult(qs, answers, passing),
    };
  }

  it('earns nothing without a record', () => {
    expect(earnedBadges({ streakDays: 0, attempts: [], counts })).toEqual([]);
  });

  it('earns streak, volume, rise and pass badges from the record', () => {
    const first = exam(2, 1);
    const later = exam(9, 2);
    const ids = earnedBadges({ streakDays: 7, attempts: [first, later], counts });
    expect(ids).toContain('first-exam');
    expect(ids).toContain('streak-7');
    expect(ids).not.toContain('streak-30');
    expect(ids).toContain('rise-TIU');
    expect(ids).toContain('all-pass'); // pass marks are 0 in this fixture
    expect(ids).not.toContain('answered-100');
  });

  it('counts answered questions in finished attempts only', () => {
    const many = Array.from({ length: 10 }, (_, i) => exam(5, i, 'practice'));
    expect(answeredCount(many)).toBe(100);
    expect(earnedBadges({ streakDays: 0, attempts: many, counts })).toEqual(['answered-100']);
    expect(answeredCount([{ ...many[0], result: undefined }])).toBe(0);
  });

  it('needs the full rise, and a later exam, for the rise badge', () => {
    expect(earnedBadges({ streakDays: 0, attempts: [exam(9, 1)], counts })).not.toContain('rise-TIU');
    expect(earnedBadges({ streakDays: 0, attempts: [exam(9, 1), exam(2, 2)], counts })).not.toContain('rise-TIU');
  });

  it('names every badge', () => {
    expect(badgeLabel('rise-TWK')).toBe('TWK naik 20 poin');
    expect(badgeLabel('streak-30')).toBe('30 hari beruntun');
    expect(badgeLabel('all-pass')).toBe('Semua sub-tes di atas ambang');
  });
});

describe('review-day log', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('records each day a review is graded, and keeps it in backups', async () => {
    const item: ReviewItem = newReview('q1', at(2026, 10, 1));
    await db.reviews.put(item);
    await gradeReview('q1', 'baik', at(2026, 10, 7, 23, 50));
    await gradeReview('q1', 'baik', at(2026, 10, 8, 0, 10));
    await gradeReview('q1', 'baik', at(2026, 10, 8, 12));
    expect(await getReviewDays()).toEqual(['2026-10-07', '2026-10-08']);
    // lastReviewedAt alone would only remember the 8th.
    expect([...activityDays([], await db.reviews.toArray())]).toEqual(['2026-10-08']);

    const blob = await exportBackup();
    await Promise.all(db.tables.map((t) => t.clear()));
    await db.meta.put({ key: 'reviewDays', value: ['2026-10-09'] });
    await importBackup(new File([await blob.text()], 'b.json'));
    expect(await getReviewDays()).toEqual(['2026-10-07', '2026-10-08', '2026-10-09']);
  });
});
