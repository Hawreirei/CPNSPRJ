import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { buildPreset, DEFAULT_SETTINGS } from '../domain/blueprint';
import type { Attempt, QSet, Question } from '../domain/types';
import { newReview } from '../engine/srs';
import {
  cleanupPreview,
  cleanupStorage,
  errorText,
  fmtBytes,
  getStorageInfo,
  isQuotaError,
  OLD_REQUEST_MS,
  QUOTA_MESSAGE,
  STALE_ATTEMPT_DAYS,
  storageStatus,
} from '../engine/storage';

const NOW = new Date(2026, 9, 9, 12).getTime();
const DAY = 86_400_000;

describe('storage status', () => {
  it('warns from 80% of the quota', () => {
    expect(storageStatus({ usage: 79, quota: 100 })).toMatchObject({ ratio: 0.79, warn: false });
    expect(storageStatus({ usage: 80, quota: 100 })).toMatchObject({ warn: true });
    expect(storageStatus({ usage: 0, quota: 100 })).toMatchObject({ warn: false });
  });

  it('says nothing when the browser does not report', () => {
    expect(storageStatus(undefined)).toBeNull();
    expect(storageStatus({ usage: 5 })).toBeNull();
    expect(storageStatus({ quota: 0, usage: 0 })).toBeNull();
  });

  describe('from navigator.storage', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('reads a fake estimate and the persisted flag', async () => {
      vi.stubGlobal('navigator', { storage: { estimate: async () => ({ usage: 900, quota: 1000 }), persisted: async () => true } });
      expect(await getStorageInfo()).toEqual({ status: { usage: 900, quota: 1000, ratio: 0.9, warn: true }, persisted: true, images: { count: 0, bytes: 0 } });
    });

    it('copes with no Storage API at all', async () => {
      vi.stubGlobal('navigator', {});
      expect(await getStorageInfo()).toEqual({ status: null, persisted: null, images: { count: 0, bytes: 0 } });
    });
  });

  it('formats sizes', () => {
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(2048)).toBe('2 KB');
    expect(fmtBytes(5.5 * 1024 ** 2)).toBe('5,5 MB');
    expect(fmtBytes(2 * 1024 ** 3)).toBe('2,0 GB');
  });
});

describe('quota errors', () => {
  it('are recognised directly or wrapped by Dexie, and explained', () => {
    const raw = new DOMException('full', 'QuotaExceededError');
    expect(isQuotaError(raw)).toBe(true);
    expect(isQuotaError({ name: 'AbortError', inner: { name: 'QuotaExceededError' } })).toBe(true);
    expect(isQuotaError(new Error('something else'))).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
    expect(errorText(raw)).toBe(QUOTA_MESSAGE);
    expect(errorText(new Error('Kunci salah'))).toBe('Kunci salah');
  });
});

describe('clean-up', () => {
  const q: Question = {
    id: 'q1',
    subtest: 'TWK',
    topic: 't',
    difficulty: 'sedang',
    stem: 'Soal',
    options: [{ label: 'A', text: 'a', score: 5 }],
    answer: 'A',
    explanation: '',
    flags: [],
    locked: false,
    starred: false,
    hash: 'h',
    source: 'ai',
    createdAt: 0,
    updatedAt: 0,
  };
  const attempt = (id: string, startedAt: number, finished: boolean): Attempt => ({
    id,
    setId: 's',
    setName: 'S',
    mode: 'exam',
    questionIds: ['q1'],
    startedAt,
    endsAt: startedAt + 1e6,
    ...(finished && { finishedAt: startedAt + 1e5 }),
    answers: {},
    flagged: [],
    timeSpent: {},
    currentIndex: 0,
    passing: { TWK: 0, TIU: 0, TKP: 0 },
  });

  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    const set: QSet = {
      id: 's',
      name: 'S',
      blueprint: buildPreset('mini', DEFAULT_SETTINGS),
      questionIds: ['q1'],
      status: 'ready',
      source: 'bank',
      batches: [],
      usage: { inputTokens: 0, outputTokens: 0, requests: 0 },
      createdAt: 0,
      updatedAt: 0,
    };
    await db.sets.put(set);
    await db.questions.put(q);
    await db.reviews.put(newReview('q1', 0));
    const old = NOW - (STALE_ATTEMPT_DAYS + 1) * DAY;
    await db.attempts.bulkPut([attempt('old-open', old, false), attempt('old-done', old, true), attempt('new-open', NOW - DAY, false)]);
    await db.requests.bulkAdd([
      { keyId: 'k', at: NOW - OLD_REQUEST_MS - 1, inputTokens: 100 },
      { keyId: 'k', at: NOW - 60_000, inputTokens: 100 },
    ]);
  });

  it('previews, then removes only old request logs and long-abandoned unfinished attempts', async () => {
    const preview = await cleanupPreview(NOW);
    expect(preview).toMatchObject({ requests: 1, attempts: 1 });
    expect(preview.bytes).toBeGreaterThan(0);
    // Nothing removed by a preview.
    expect(await db.attempts.count()).toBe(3);

    expect(await cleanupStorage(NOW)).toEqual(preview);
    expect((await db.attempts.toArray()).map((a) => a.id).sort()).toEqual(['new-open', 'old-done']);
    expect(await db.requests.count()).toBe(1);
    // Sets, questions and the notebook are untouched.
    expect(await db.sets.count()).toBe(1);
    expect(await db.questions.count()).toBe(1);
    expect(await db.reviews.count()).toBe(1);
    expect(await cleanupPreview(NOW)).toEqual({ requests: 0, attempts: 0, bytes: 0 });
  });
});
