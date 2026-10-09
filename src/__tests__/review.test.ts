import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { exportBackup, importBackup } from '../db/backup';
import { buildPreset, DEFAULT_SETTINGS } from '../domain/blueprint';
import type { Grade, OptionLabel, QSet, Question, ReviewItem } from '../domain/types';
import { finishAttempt, startAttempt } from '../engine/attempts';
import { backfillFromHistory, gradeReview, recordMistakes } from '../engine/review';
import { deleteSet } from '../engine/sets';
import { addDays, dueQueue, fmtDue, isDue, MIN_EASE, mistakesInAttempt, newReview, nextInterval, relapse, reviewedToday, schedule, startOfDay } from '../engine/srs';

const LABELS: OptionLabel[] = ['A', 'B', 'C', 'D', 'E'];
const NOW = new Date(2026, 9, 8, 14, 30).getTime(); // 8 Oct 2026, 14:30 local
const DAY = (n: number) => addDays(NOW, n);

function mkQ(partial: Partial<Question>): Question {
  return {
    id: Math.random().toString(36).slice(2),
    subtest: 'TIU',
    topic: 'Aritmetika',
    difficulty: 'sedang',
    stem: 'Berapa 2 + 2?',
    options: LABELS.map((label, i) => ({ label, text: String(i + 3), score: label === 'B' ? 5 : 0 })),
    answer: 'B',
    explanation: '',
    flags: [],
    locked: false,
    starred: false,
    hash: 'x',
    source: 'ai',
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}
const tkp = (partial: Partial<Question> = {}) =>
  mkQ({ subtest: 'TKP', topic: 'Pelayanan Publik', answer: undefined, options: LABELS.map((label, i) => ({ label, text: label, score: i + 1 })), ...partial });

/** Grade an item repeatedly, each review on the day it falls due. */
function run(grades: Grade[], start = newReview('q', NOW)): ReviewItem {
  let item = start;
  let t = NOW;
  for (const g of grades) {
    item = schedule(item, g, t);
    t = item.due + 10 * 3_600_000;
  }
  return item;
}

describe('days', () => {
  it('works in local calendar days', () => {
    expect(new Date(startOfDay(NOW)).getHours()).toBe(0);
    expect(new Date(DAY(1)).getDate()).toBe(9);
    expect(new Date(DAY(30)).getMonth()).toBe(10);
    expect(new Date(DAY(30)).getHours()).toBe(0);
  });
  it('describes due dates relative to today', () => {
    expect(fmtDue(startOfDay(NOW), NOW)).toBe('hari ini');
    expect(fmtDue(DAY(1), NOW)).toBe('besok');
    expect(fmtDue(DAY(5), NOW)).toBe('dalam 5 hari');
    expect(fmtDue(DAY(-2), NOW)).toBe('terlambat 2 hari');
  });
});

describe('scheduling', () => {
  it('makes new items due today', () => {
    const r = newReview('q', NOW);
    expect(isDue(r, NOW)).toBe(true);
    expect(r.due).toBe(startOfDay(NOW));
  });

  it('grows the interval on repeated "Baik"', () => {
    expect(run(['baik']).interval).toBe(1);
    expect(run(['baik', 'baik']).interval).toBe(3);
    expect(run(['baik', 'baik', 'baik']).interval).toBe(8); // round(3 * 2.5)
    const r = run(['baik', 'baik', 'baik', 'baik']);
    expect(r.interval).toBe(20);
    expect(r.reps).toBe(4);
  });

  it('schedules the next review interval days after the review day', () => {
    const r = schedule(newReview('q', NOW), 'mudah', NOW);
    expect(r.due).toBe(DAY(3));
    expect(r.lastReviewedAt).toBe(NOW);
    expect(r.lastGrade).toBe('mudah');
  });

  it('orders intervals Lupa ≤ Sulit ≤ Baik < Mudah for any state', () => {
    for (const state of [newReview('q', NOW), run(['baik']), run(['baik', 'baik', 'baik']), run(['sulit', 'sulit', 'sulit', 'sulit', 'sulit'])]) {
      const [l, s, b, m] = (['lupa', 'sulit', 'baik', 'mudah'] as Grade[]).map((g) => nextInterval(state, g).interval);
      expect(l).toBeLessThanOrEqual(s);
      expect(s).toBeLessThanOrEqual(b);
      expect(b).toBeLessThan(m);
    }
  });

  it('resets on "Lupa" and counts the lapse', () => {
    const before = run(['baik', 'baik', 'baik']);
    const after = schedule(before, 'lupa', NOW);
    expect(after.interval).toBe(1);
    expect(after.reps).toBe(0);
    expect(after.lapses).toBe(before.lapses + 1);
    expect(after.ease).toBeLessThan(before.ease);
    expect(after.due).toBe(DAY(1));
  });

  it('never lets ease drop below the minimum', () => {
    const r = run(Array(20).fill('lupa'));
    expect(r.ease).toBe(MIN_EASE);
    expect(run(Array(20).fill('sulit')).ease).toBe(MIN_EASE);
  });

  it('caps the interval at a year', () => {
    expect(run(Array(30).fill('mudah')).interval).toBe(365);
  });

  it('restarts an item missed again, keeping it due today at the latest', () => {
    const r = relapse(run(['baik', 'baik', 'baik']), NOW + 2 * 86_400_000);
    expect(r.reps).toBe(0);
    expect(r.lapses).toBe(1);
    expect(r.due).toBeLessThanOrEqual(startOfDay(NOW + 2 * 86_400_000));
  });
});

describe('daily queue', () => {
  const item = (id: string, due: number, extra: Partial<ReviewItem> = {}): ReviewItem => ({ ...newReview(id, NOW), due, ...extra });

  it('holds only due items, most overdue first, then most forgotten', () => {
    const items = [item('a', DAY(0)), item('b', DAY(-3)), item('c', DAY(1)), item('d', DAY(0), { lapses: 2 })];
    expect(dueQueue(items, NOW, 20).map((r) => r.questionId)).toEqual(['b', 'd', 'a']);
  });

  it('respects the daily limit, counting reviews already done today', () => {
    const items = [item('a', DAY(0)), item('b', DAY(0)), item('c', DAY(0)), item('done', DAY(3), { lastReviewedAt: NOW - 3_600_000 })];
    expect(reviewedToday(items, NOW)).toBe(1);
    expect(dueQueue(items, NOW, 3)).toHaveLength(2);
    expect(dueQueue(items, NOW, 1)).toHaveLength(0);
    // Yesterday's reviews do not count against today.
    expect(reviewedToday([item('y', DAY(2), { lastReviewedAt: DAY(0) - 1 })], NOW)).toBe(0);
  });
});

describe('mistakes in an attempt', () => {
  it('takes wrong, unanswered and unsure questions, and TKP picks below the top option', () => {
    const right = mkQ({});
    const wrong = mkQ({});
    const empty = mkQ({});
    const unsure = mkQ({});
    const tkpTop = tkp();
    const tkpLow = tkp();
    const ids = mistakesInAttempt([right, wrong, empty, unsure, tkpTop, tkpLow], { [right.id]: 'B', [wrong.id]: 'A', [unsure.id]: 'B', [tkpTop.id]: 'E', [tkpLow.id]: 'D' }, [
      unsure.id,
    ]);
    expect(ids.sort()).toEqual([wrong.id, empty.id, unsure.id, tkpLow.id].sort());
  });
});

describe('notebook storage', () => {
  let qs: Question[];

  beforeEach(async () => {
    await Promise.all([db.sets.clear(), db.questions.clear(), db.attempts.clear(), db.reviews.clear(), db.meta.clear()]);
    qs = [mkQ({}), mkQ({ topic: 'Deret Angka' }), tkp(), tkp({ topic: 'Jejaring Kerja' })];
    await db.questions.bulkAdd(qs);
    const set: QSet = {
      id: 's1',
      name: 'Set uji',
      blueprint: buildPreset('mini', DEFAULT_SETTINGS),
      questionIds: qs.map((q) => q.id),
      status: 'ready',
      source: 'bank',
      batches: [],
      usage: { inputTokens: 0, outputTokens: 0, requests: 0 },
      createdAt: 0,
      updatedAt: 0,
    };
    await db.sets.add(set);
  });

  async function finish(mode: 'exam' | 'practice', answers: Record<string, OptionLabel>, flagged: string[] = []) {
    const a = await startAttempt('s1', { shuffleQuestions: false, durationMinutes: mode === 'exam' ? 10 : 0, mode });
    await db.attempts.update(a.id, { answers, flagged });
    return finishAttempt(a.id);
  }

  it.each(['exam', 'practice'] as const)('adds mistakes when a %s finishes, due today', async (mode) => {
    // q0 right, q1 wrong, q2 TKP top, q3 TKP unanswered but flagged.
    await finish(mode, { [qs[0].id]: 'B', [qs[1].id]: 'A', [qs[2].id]: 'E' }, [qs[3].id]);
    const rows = await db.reviews.toArray();
    expect(rows.map((r) => r.questionId).sort()).toEqual([qs[1].id, qs[3].id].sort());
    expect(rows.every((r) => isDue(r, Date.now()))).toBe(true);
  });

  it('restarts a question missed again instead of duplicating it', async () => {
    await finish('exam', { [qs[0].id]: 'A' });
    await gradeReview(qs[0].id, 'mudah');
    expect(isDue((await db.reviews.get(qs[0].id))!, Date.now())).toBe(false);
    await finish('practice', { [qs[0].id]: 'C' });
    const r = (await db.reviews.get(qs[0].id))!;
    expect(r.lapses).toBe(1);
    expect(r.reps).toBe(0);
    expect(isDue(r, Date.now())).toBe(true);
  });

  it('backfills older attempts without touching existing schedules', async () => {
    const a = await startAttempt('s1', { shuffleQuestions: false, durationMinutes: 10 });
    // Simulate an attempt finished before the notebook existed.
    await db.attempts.update(a.id, { answers: { [qs[0].id]: 'A', [qs[1].id]: 'B', [qs[2].id]: 'E', [qs[3].id]: 'E' } });
    await finishAttempt(a.id);
    await db.reviews.clear();
    await recordMistakes({ id: 'other', answers: {}, flagged: [] }, [qs[0]]);
    await gradeReview(qs[0].id, 'mudah');
    const graded = await db.reviews.get(qs[0].id);
    expect(await backfillFromHistory()).toBe(0);
    expect(await db.reviews.get(qs[0].id)).toEqual(graded);
    await db.reviews.clear();
    expect(await backfillFromHistory()).toBe(1);
  });

  it('drops notebook entries when their questions are deleted with a set', async () => {
    await finish('exam', {});
    expect(await db.reviews.count()).toBe(4);
    await deleteSet('s1', true);
    expect(await db.reviews.count()).toBe(0);
  });

  it('round-trips the notebook through a backup, and accepts old backups without it', async () => {
    await finish('exam', { [qs[0].id]: 'A' });
    await db.reviews.update(qs[0].id, { reasonTags: ['hitung'] });
    const blob = await exportBackup();
    const saved = await db.reviews.toArray();
    await db.reviews.clear();
    const r = await importBackup(new File([await blob.text()], 'b.json'));
    expect(r.reviews).toBe(saved.length);
    expect(await db.reviews.toArray()).toEqual(saved);

    const old = await importBackup(new File([JSON.stringify({ app: 'cpns-skd-builder', version: 1, sets: [], questions: [], attempts: [] })], 'old.json'));
    expect(old.reviews).toBe(0);
    expect(await db.reviews.count()).toBe(saved.length);
  });
});
