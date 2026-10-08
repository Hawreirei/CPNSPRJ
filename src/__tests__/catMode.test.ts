import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { exportBackup, importBackup } from '../db/backup';
import { buildPreset, DEFAULT_SETTINGS } from '../domain/blueprint';
import { allowedRange, canGo, nextSection, tabAwaySummary } from '../domain/catMode';
import type { OptionLabel, QSet, Question, Subtest } from '../domain/types';
import { startAttempt } from '../engine/attempts';

const qs = (...subtests: Subtest[]) => subtests.map((subtest) => ({ subtest }));
// TWK 0–2, TIU 3–4, TKP 5–7.
const SKD = qs('TWK', 'TWK', 'TWK', 'TIU', 'TIU', 'TKP', 'TKP', 'TKP');
const at = (currentIndex: number, lockedOrder = true) => ({ currentIndex, lockedOrder });

describe('allowedRange', () => {
  it('allows every question without a locked order', () => {
    expect(allowedRange(at(4, false), SKD)).toEqual({ from: 0, to: 7 });
    expect(canGo(at(7, false), SKD, 0)).toBe(true);
    expect(nextSection(at(2, false), SKD)).toBeNull();
  });

  it('keeps a locked order inside the current sub-test', () => {
    expect(allowedRange(at(0), SKD)).toEqual({ from: 0, to: 2 });
    expect(allowedRange(at(2), SKD)).toEqual({ from: 0, to: 2 });
    expect(allowedRange(at(4), SKD)).toEqual({ from: 3, to: 4 });
    expect(allowedRange(at(5), SKD)).toEqual({ from: 5, to: 7 });
  });

  it('never allows going back to an earlier sub-test, nor skipping ahead', () => {
    expect(canGo(at(3), SKD, 2)).toBe(false);
    expect(canGo(at(3), SKD, 0)).toBe(false);
    expect(canGo(at(3), SKD, 4)).toBe(true);
    expect(canGo(at(0), SKD, 3)).toBe(false);
    expect(canGo(at(0), SKD, 6)).toBe(false);
  });

  it('names the next sub-test, and none after the last', () => {
    expect(nextSection(at(1), SKD)).toEqual({ index: 3, subtest: 'TIU' });
    expect(nextSection(at(3), SKD)).toEqual({ index: 5, subtest: 'TKP' });
    expect(nextSection(at(6), SKD)).toBeNull();
  });

  it('copes with a single sub-test and an empty attempt', () => {
    expect(allowedRange(at(1), qs('TIU', 'TIU'))).toEqual({ from: 0, to: 1 });
    expect(nextSection(at(1), qs('TIU', 'TIU'))).toBeNull();
    expect(allowedRange(at(0), [])).toEqual({ from: 0, to: 0 });
  });
});

describe('tab-away summary', () => {
  it('counts, totals and finds the longest', () => {
    expect(tabAwaySummary()).toEqual({ count: 0, totalMs: 0, longestMs: 0 });
    expect(tabAwaySummary([{ at: 1, ms: 3000 }, { at: 9, ms: 12000 }])).toEqual({ count: 2, totalMs: 15000, longestMs: 12000 });
  });
});

describe('starting an exam in Mode CAT', () => {
  const LABELS: OptionLabel[] = ['A', 'B', 'C', 'D', 'E'];
  const q = (id: string, subtest: Subtest): Question => ({
    id,
    subtest,
    topic: 't',
    difficulty: 'sedang',
    stem: id,
    options: LABELS.map((label) => ({ label, text: label, score: label === 'A' ? 5 : 0 })),
    answer: 'A',
    explanation: '',
    flags: [],
    locked: false,
    starred: false,
    hash: id,
    source: 'ai',
    createdAt: 0,
    updatedAt: 0,
  });

  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    // Out of sub-test order on purpose.
    const questions = [q('k1', 'TKP'), q('w1', 'TWK'), q('i1', 'TIU'), q('w2', 'TWK')];
    await db.questions.bulkPut(questions);
    const set: QSet = {
      id: 's',
      name: 'S',
      blueprint: buildPreset('mini', DEFAULT_SETTINGS),
      questionIds: questions.map((x) => x.id),
      status: 'ready',
      source: 'bank',
      batches: [],
      usage: { inputTokens: 0, outputTokens: 0, requests: 0 },
      createdAt: 0,
      updatedAt: 0,
    };
    await db.sets.put(set);
  });

  it('records the options and orders sub-tests as blocks when the order is locked', async () => {
    const a = await startAttempt('s', { shuffleQuestions: false, durationMinutes: 10, catMode: true, lockedOrder: true });
    expect(a).toMatchObject({ catMode: true, lockedOrder: true, tabAways: [] });
    expect(a.questionIds).toEqual(['w1', 'w2', 'i1', 'k1']);
  });

  it('leaves ordinary exams and practice untouched', async () => {
    const exam = await startAttempt('s', { shuffleQuestions: false, durationMinutes: 10 });
    expect(exam.catMode).toBeUndefined();
    expect(exam.questionIds).toEqual(['k1', 'w1', 'i1', 'w2']);
    const practice = await startAttempt('s', { shuffleQuestions: false, durationMinutes: 0, mode: 'practice', catMode: true, lockedOrder: true });
    expect(practice.catMode).toBeUndefined();
    expect(practice.lockedOrder).toBeUndefined();
  });

  it('keeps the tab-away log in backups', async () => {
    const a = await startAttempt('s', { shuffleQuestions: false, durationMinutes: 10, catMode: true });
    await db.attempts.update(a.id, { tabAways: [{ at: 5, ms: 4000 }] });
    const blob = await exportBackup();
    await db.attempts.clear();
    await importBackup(new File([await blob.text()], 'b.json'));
    expect((await db.attempts.get(a.id))?.tabAways).toEqual([{ at: 5, ms: 4000 }]);
  });
});
