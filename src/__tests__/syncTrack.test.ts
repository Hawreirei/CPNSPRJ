import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDB, db } from '../db';
import { exportBackup } from '../db/backup';
import type { QSet, Question, ReviewItem } from '../domain/types';
import { setupAutoBackup } from '../lib/autoBackup';
import { nextStamp, type SyncStamp } from '../sync/track';

const T = new Date(2026, 9, 12, 9).getTime();

const q = (id: string, extra: Partial<Question> = {}) =>
  ({
    id,
    subtest: 'TIU',
    topic: 'Deret Angka',
    difficulty: 'sedang',
    stem: id,
    options: [],
    explanation: '',
    flags: [],
    locked: false,
    starred: false,
    hash: id,
    source: 'manual',
    createdAt: T,
    updatedAt: T,
    ...extra,
  }) as Question;
const set = (id: string) =>
  ({
    id,
    name: id,
    questionIds: [],
    status: 'ready',
    source: 'ai',
    batches: [],
    usage: { inputTokens: 0, outputTokens: 0, requests: 0 },
    createdAt: T,
    updatedAt: T,
  }) as unknown as QSet;
const stamp = (tbl: string, id: string) => db.syncStamps.get([tbl, id]);
const allStamps = () => db.syncStamps.toArray();

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.syncStamps.clear();
});
afterEach(() => vi.useRealTimers());

describe('change stamps for cloud sync (#96)', () => {
  it('stamps every kind of write to a synced table, dirty and not deleted', async () => {
    await db.questions.add(q('a'));
    await db.questions.bulkPut([q('b'), q('c')]);
    await db.sets.put(set('s'));
    await db.reviews.put({ questionId: 'a', due: T, interval: 0, ease: 2.5, reps: 0, lapses: 0, reasonTags: [], addedAt: T } as ReviewItem);
    await db.attempts.put({ id: 'x', setId: 's', setName: 's', questionIds: [], startedAt: T, endsAt: 0, answers: {}, flagged: [], timeSpent: {}, currentIndex: 0, passing: {} });
    await db.cards.put({ cardId: 'pancasila-1', due: T, interval: 0, ease: 2.5, reps: 0, lapses: 0, addedAt: T });
    const s = await allStamps();
    expect(s.map((x) => `${x.tbl}/${x.id}`).sort()).toEqual(['attempts/x', 'cards/pancasila-1', 'questions/a', 'questions/b', 'questions/c', 'reviews/a', 'sets/s']);
    expect(s.every((x) => x.dirty === 1 && x.deleted === 0 && x.mtime > 0)).toBe(true);
  });

  it('gives updates and modify() a newer stamp', async () => {
    await db.questions.put(q('a'));
    const first = (await stamp('questions', 'a'))!.mtime;
    await db.questions.update('a', { starred: true });
    const second = (await stamp('questions', 'a'))!.mtime;
    await db.questions
      .where('id')
      .equals('a')
      .modify((x) => void (x.rating = 4));
    const third = (await stamp('questions', 'a'))!.mtime;
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it('marks deletes, including deletes by range and clear()', async () => {
    await db.questions.bulkPut([q('a'), q('b'), q('c')]);
    await db.sets.bulkPut([set('s1'), set('s2')]);
    await db.questions.delete('a');
    await db.questions.where('id').anyOf('b').delete();
    await db.sets.clear();
    const s = Object.fromEntries((await allStamps()).map((x) => [`${x.tbl}/${x.id}`, x.deleted]));
    expect(s).toEqual({ 'questions/a': 1, 'questions/b': 1, 'questions/c': 0, 'sets/s1': 1, 'sets/s2': 1 });
  });

  it('still marks deletes when the backup hooks are on the same tables', async () => {
    setupAutoBackup();
    await db.questions.bulkPut([q('a'), q('b')]);
    await db.questions.where('id').equals('a').delete();
    expect((await stamp('questions', 'a'))?.deleted).toBe(1);
    expect((await stamp('questions', 'b'))?.deleted).toBe(0);
  });

  it('stamps only the meta rows that are synced', async () => {
    await db.meta.put({ key: 'settings', value: { brandName: 'x' } });
    await db.meta.put({ key: 'reviewDays', value: ['2026-10-12'] });
    await db.meta.put({ key: 'errorLog', value: [] });
    await db.meta.put({ key: 'backup', value: {} });
    expect((await allStamps()).map((x) => x.id).sort()).toEqual(['reviewDays', 'settings']);
  });

  it('never stamps API keys or the request log', async () => {
    await db.keys.put({ id: 'k', provider: 'gemini', label: 'k', model: 'm', isDefault: true, createdAt: T });
    await db.requests.add({ keyId: 'k', at: T, inputTokens: 1 });
    expect(await allStamps()).toEqual([]);
  });

  it('leaves the stored objects and the backup file exactly as before', async () => {
    const row = q('a');
    await db.questions.put(row);
    expect(await db.questions.get('a')).toEqual(row);
    const file = JSON.parse(await (await exportBackup()).text());
    expect(file.questions).toEqual([row]);
    expect(JSON.stringify(file)).not.toMatch(/mtime|dirty|syncStamps/);
  });

  it('rolls the stamp back with the write when a transaction fails', async () => {
    await expect(
      db.transaction('rw', db.questions, async () => {
        await db.questions.put(q('a'));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await allStamps()).toEqual([]);
  });

  it('does not stamp rows a bulk write failed to store', async () => {
    await db.questions.add(q('a'));
    await expect(db.questions.bulkAdd([q('a'), q('b')])).rejects.toThrow();
    expect((await allStamps()).map((x) => x.id).sort()).toEqual(['a', 'b']);
    const a = (await stamp('questions', 'a'))!;
    await db.questions.bulkAdd([q('a')]).catch(() => undefined);
    expect((await stamp('questions', 'a'))!.mtime).toBe(a.mtime);
  });

  it('keeps stamps rising for a row when the clock goes back', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T + 60_000);
    await db.questions.put(q('a'));
    const before = (await stamp('questions', 'a'))!.mtime;
    vi.setSystemTime(T - 86_400_000);
    await db.questions.update('a', { starred: true });
    expect((await stamp('questions', 'a'))!.mtime).toBeGreaterThan(before);
  });

  it('nextStamp never repeats and passes a given stamp', () => {
    const a = nextStamp();
    const b = nextStamp();
    expect(b).toBeGreaterThan(a);
    expect(nextStamp(b + 1_000_000)).toBe(b + 1_000_001);
  });
});

describe('upgrade from Dexie v4 (#96)', () => {
  it('stamps rows that were already stored, with their own last-change time', async () => {
    const name = 'upgrade-test';
    const v4 = new Dexie(name);
    v4.version(4).stores({
      questions: 'id, subtest, topic, difficulty, hash, starred, originSetId, createdAt',
      sets: 'id, updatedAt, status',
      attempts: 'id, setId, startedAt, finishedAt',
      keys: 'id, provider',
      meta: 'key',
      requests: '++id, keyId, at, [keyId+at]',
      reviews: 'questionId, due, lastReviewedAt',
      cards: 'cardId, due, lastReviewedAt',
    });
    await v4.table('questions').put(q('old', { updatedAt: T - 5000 }));
    await v4.table('sets').put(set('s'));
    await v4.table('attempts').put({ id: 'done', startedAt: T - 9000, finishedAt: T - 8000 });
    await v4.table('reviews').put({ questionId: 'old', addedAt: T - 7000 });
    await v4.table('meta').bulkPut([
      { key: 'settings', value: {} },
      { key: 'deviceKey', value: 'secret' },
    ]);
    await v4.table('keys').put({ id: 'k', provider: 'gemini' });
    v4.close();

    const upgraded = new AppDB(name);
    const stamps: SyncStamp[] = await upgraded.syncStamps.toArray();
    const byId = Object.fromEntries(stamps.map((s) => [`${s.tbl}/${s.id}`, s.mtime]));
    expect(byId).toEqual({ 'questions/old': T - 5000, 'sets/s': T, 'attempts/done': T - 8000, 'reviews/old': T - 7000, 'meta/settings': 1 });
    expect(stamps.every((s) => s.dirty === 1 && s.deleted === 0)).toBe(true);
    expect(await upgraded.questions.get('old')).toEqual(q('old', { updatedAt: T - 5000 }));
    upgraded.close();
  });

  it('lets a still-cached older version of the app open and write the v5 database', async () => {
    const name = 'downgrade-test';
    const current = new AppDB(name);
    await current.questions.put(q('a'));
    current.close();

    const old = new Dexie(name, { cache: 'disabled' });
    old.version(4).stores({ questions: 'id', sets: 'id', attempts: 'id', keys: 'id', meta: 'key', requests: '++id', reviews: 'questionId', cards: 'cardId' });
    expect(await old.table('questions').count()).toBe(1);
    await old.table('questions').put(q('b'));
    old.close();

    const reopened = new AppDB(name);
    expect(await reopened.questions.count()).toBe(2);
    reopened.close();
  });
});
