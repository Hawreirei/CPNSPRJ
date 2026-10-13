import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDB } from '../db';
import type { Attempt, CardState, QSet, Question, ReviewItem } from '../domain/types';
import {
  adopt,
  clearLocalData,
  getSyncState,
  MAX_ROW_CHARS,
  pendingCount,
  planAttach,
  stampMissing,
  syncOnce,
  type Counts,
  type Cursor,
  type PulledRow,
  type PushRow,
  type SyncServer,
} from '../sync/engine';

/**
 * A server with the same rules as sync_push / sync_pull in supabase/migrations: a write with an older
 * stamp is skipped, every write gets a later server time, pages are ordered by (updated_at, tbl, id).
 */
class FakeServer implements SyncServer {
  rows = new Map<string, PulledRow>();
  pushes: PushRow[][] = [];
  private clock = 0;
  /** Called before each push is stored; throw to fail it. */
  beforePush?: (rows: PushRow[], n: number) => void | Promise<void>;

  async push(rows: PushRow[]) {
    await this.beforePush?.(rows, this.pushes.length);
    this.pushes.push(structuredClone(rows));
    const applied: { tbl: string; id: string; mtime: number }[] = [];
    for (const r of rows) {
      const key = `${r.tbl}/${r.id}`;
      const cur = this.rows.get(key);
      if (cur && r.mtime < cur.mtime) continue;
      const at = new Date(Date.UTC(2026, 9, 12) + ++this.clock * 1000).toISOString();
      this.rows.set(key, { tbl: r.tbl, id: r.id, data: r.deleted ? null : JSON.parse(JSON.stringify(r.data)), deleted: r.deleted, mtime: r.mtime, updated_at: at });
      applied.push({ tbl: r.tbl, id: r.id, mtime: r.mtime });
    }
    return applied;
  }

  async pull(after: Cursor, max: number) {
    const key = (r: { updated_at?: string; at?: string; tbl: string; id: string }) => [r.updated_at ?? r.at ?? '', r.tbl, r.id] as const;
    const gt = (a: readonly string[], b: readonly string[]) => (a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2]);
    return [...this.rows.values()]
      .filter((r) => gt(key(r), key(after)))
      .sort((a, b) => (gt(key(a), key(b)) ? 1 : -1))
      .slice(0, max)
      .map((r) => structuredClone(r));
  }

  async counts(): Promise<Counts> {
    const live = [...this.rows.values()].filter((r) => !r.deleted);
    const n = (t: string) => live.filter((r) => r.tbl === t).length;
    return { sets: n('sets'), questions: n('questions'), attempts: n('attempts') };
  }

  /** Every pushed payload as one string, for checking what was sent. */
  sent = () => JSON.stringify(this.pushes);
}

const T = Date.UTC(2026, 9, 12, 2);
const USER = 'user-1';
let n = 0;
const device = () => new AppDB(`device-${++n}`);
let server: FakeServer;

const q = (id: string, extra: Partial<Question> = {}) =>
  ({
    id,
    subtest: 'TIU',
    topic: 'Deret Angka',
    difficulty: 'sedang',
    stem: `Soal ${id}`,
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
const set = (id: string, questionIds: string[] = []) =>
  ({
    id,
    name: `Set ${id}`,
    questionIds,
    status: 'ready',
    source: 'ai',
    batches: [],
    usage: { inputTokens: 0, outputTokens: 0, requests: 0 },
    createdAt: T,
    updatedAt: T,
  }) as unknown as QSet;
const attempt = (id: string, extra: Partial<Attempt> = {}): Attempt => ({
  id,
  setId: 's',
  setName: 'Set s',
  mode: 'exam',
  questionIds: ['q1'],
  startedAt: T,
  endsAt: 0,
  answers: {},
  flagged: [],
  timeSpent: {},
  currentIndex: 0,
  passing: {},
  ...extra,
});

/** Sign `db` in as `user` the way the app does: plan, agree to merge when asked, then one round. */
async function signIn(db: AppDB, user = USER) {
  const plan = await planAttach(db, user);
  if (plan.kind !== 'ready') await adopt(db, user);
  return syncOnce(db, server, db.name, { checkStamps: true });
}
const sync = (db: AppDB) => syncOnce(db, server, db.name);

/** All synced rows of a device, for comparing two devices. */
async function snapshot(db: AppDB) {
  const settings = (await db.meta.get('settings'))?.value as Record<string, unknown> | undefined;
  return {
    sets: await db.sets.orderBy('id').toArray(),
    questions: await db.questions.orderBy('id').toArray(),
    attempts: await db.attempts.orderBy('id').toArray(),
    reviews: await db.reviews.orderBy('questionId').toArray(),
    cards: await db.cards.orderBy('cardId').toArray(),
    settings: settings && { ...settings, lastSeenVersion: undefined },
    reviewDays: (await db.meta.get('reviewDays'))?.value,
  };
}

beforeEach(() => {
  server = new FakeServer();
});
afterEach(() => vi.useRealTimers());

describe('sync between devices (#99, #100, #102)', () => {
  it('restores everything on a new, empty device and then has nothing left to send', async () => {
    const a = device();
    await a.questions.bulkPut([q('q1'), q('q2', { image: { src: 'data:image/jpeg;base64,AAAA', alt: 'gambar', width: 10, height: 10 } })]);
    await a.sets.put(set('s', ['q1', 'q2']));
    await a.attempts.put(attempt('x', { finishedAt: T + 1, answers: { q1: 'A' } }));
    await a.reviews.put({ questionId: 'q1', due: T, interval: 1, ease: 2.5, reps: 1, lapses: 0, reasonTags: ['hitung'], addedAt: T } as ReviewItem);
    await a.cards.put({ cardId: 'pancasila-1', due: T, interval: 1, ease: 2.5, reps: 1, lapses: 0, addedAt: T } as CardState);
    await a.meta.put({ key: 'settings', value: { brandName: 'Bimbel A', studyPlan: { examDate: '2026-11-20' }, lastSeenVersion: '1.9.0' } });
    await a.meta.put({ key: 'reviewDays', value: ['2026-10-10', '2026-10-11'] });
    await signIn(a);
    expect(await pendingCount(a)).toBe(0);

    // The browser of device B lost everything; it opens the app (which writes its own default settings) and signs in.
    const b = device();
    await b.meta.put({ key: 'settings', value: { brandName: '', lastSeenVersion: '2.0.0' } });
    expect((await planAttach(b, USER)).kind).toBe('ready');
    await sync(b);
    expect(await snapshot(b)).toEqual(await snapshot(a));
    const bSettings = (await b.meta.get('settings'))!.value as { lastSeenVersion: string };
    expect(bSettings.lastSeenVersion).toBe('2.0.0');

    const pushesBefore = server.pushes.length;
    await sync(b);
    await sync(a);
    expect(server.pushes.length).toBe(pushesBefore);
    expect(await pendingCount(b)).toBe(0);
  });

  it('lets the later of two edits to the same row win on both devices', async () => {
    const a = device();
    await a.questions.put(q('q1'));
    await signIn(a);
    const b = device();
    await signIn(b);

    await a.questions.update('q1', { stem: 'versi A' });
    await b.questions.update('q1', { stem: 'versi B' });
    await sync(a);
    await sync(b);
    await sync(a);
    expect((await a.questions.get('q1'))?.stem).toBe('versi B');
    expect((await b.questions.get('q1'))?.stem).toBe('versi B');
  });

  it('carries a deletion to the other device, and an older offline edit does not bring the row back', async () => {
    const a = device();
    await a.questions.bulkPut([q('q1'), q('q2')]);
    await signIn(a);
    const b = device();
    await signIn(b);

    await b.questions.update('q1', { starred: true }); // B edits first, offline
    await a.questions.delete('q1'); // A deletes later
    await sync(a);
    await sync(b);
    await sync(a);
    expect(await a.questions.get('q1')).toBeUndefined();
    expect(await b.questions.get('q1')).toBeUndefined();
    expect(await b.questions.get('q2')).toBeDefined();
  });

  it('never lets an exam left open on one device undo the result finished on another', async () => {
    const a = device();
    await a.attempts.put(attempt('x'));
    await signIn(a);
    const b = device();
    await signIn(b);

    await b.attempts.update('x', { answers: { q1: 'A' }, finishedAt: T + 60_000, result: { perSubtest: [], topics: [], total: 5, maxTotal: 5 } });
    await sync(b);
    await a.attempts.update('x', { currentIndex: 1, timeSpent: { q1: 30 } }); // the stale tab ticks on, later
    await sync(a);
    await sync(b);
    for (const d of [a, b]) expect((await d.attempts.get('x'))?.finishedAt).toBe(T + 60_000);
  });

  it('joins study days and question notes from both devices', async () => {
    const a = device();
    await a.questions.put(q('q1'));
    await a.meta.put({ key: 'reviewDays', value: ['2026-10-01'] });
    await signIn(a);
    const b = device();
    await signIn(b);

    await a.meta.put({ key: 'reviewDays', value: ['2026-10-01', '2026-10-02'] });
    await a.questions.update('q1', { notes: [{ text: 'dari HP', at: 1 }] });
    await b.meta.put({ key: 'reviewDays', value: ['2026-10-01', '2026-10-03'] });
    await b.questions.update('q1', { notes: [{ text: 'dari laptop', at: 2 }] });
    await sync(a);
    await sync(b);
    await sync(a);
    for (const d of [a, b]) {
      expect((await d.meta.get('reviewDays'))?.value).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
      expect((await d.questions.get('q1'))?.notes?.map((x) => x.text)).toEqual(['dari HP', 'dari laptop']);
    }
  });

  it('keeps edits winning when this device clock is behind the one that wrote last', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T + 86_400_000); // device A's clock is a day ahead
    const a = device();
    await a.questions.put(q('q1', { stem: 'A' }));
    await signIn(a);
    vi.setSystemTime(T);
    const b = device();
    await signIn(b);
    await b.questions.update('q1', { stem: 'B, lebih baru' });
    await sync(b);
    await sync(a);
    expect((await a.questions.get('q1'))?.stem).toBe('B, lebih baru');
  });

  it('sends what is left after a failed push, and a row changed while it was being sent', async () => {
    const a = device();
    await signIn(a);
    await a.questions.bulkPut(Array.from({ length: 250 }, (_, i) => q(`q${i}`)));
    server.beforePush = (_rows, i) => {
      if (i === 0) throw new Error('offline');
    };
    await expect(sync(a)).rejects.toThrow('offline');
    expect(await pendingCount(a)).toBe(250);

    let edited = false;
    server.beforePush = async (rows) => {
      if (edited || !rows.some((r) => r.id === 'q0')) return;
      edited = true;
      await a.questions.update('q0', { stem: 'diubah saat dikirim' });
    };
    await sync(a);
    expect(await pendingCount(a)).toBe(1);
    await sync(a);
    expect(await pendingCount(a)).toBe(0);
    expect(server.rows.size).toBe(250);
    expect((server.rows.get('questions/q0')!.data as Question).stem).toBe('diubah saat dikirim');
  });

  it('pulls more rows than fit on one page', async () => {
    const a = device();
    await a.questions.bulkPut(Array.from({ length: 620 }, (_, i) => q(`q${String(i).padStart(4, '0')}`)));
    await signIn(a);
    const b = device();
    await signIn(b);
    expect(await b.questions.count()).toBe(620);
  }, 20_000);

  it('never sends API keys, the request log, or device-only meta rows', async () => {
    const a = device();
    await a.keys.put({ id: 'k1', provider: 'gemini', label: 'Kunci', model: 'm', isDefault: true, createdAt: T, cipher: new Uint8Array([1, 2]).buffer, iv: new Uint8Array(12) });
    await a.requests.add({ keyId: 'k1', at: T, inputTokens: 5 });
    await a.meta.bulkPut([
      { key: 'deviceKey', value: 'rahasia' },
      { key: 'errorLog', value: ['galat'] },
      { key: 'settings', value: { brandName: 'x', lastSeenVersion: '1.9.0' } },
    ]);
    await a.questions.put(q('q1'));
    await signIn(a);
    const sent = server.sent();
    expect(sent).toContain('Soal q1');
    expect(sent).not.toMatch(/k1|cipher|rahasia|galat|deviceKey|errorLog|inputTokens|lastSeenVersion/);
    expect([...server.rows.keys()].sort()).toEqual(['meta/settings', 'questions/q1']);
  });

  it('ignores server rows it cannot store', async () => {
    server.rows.set('questions/q9', { tbl: 'questions', id: 'q9', data: { id: 'lain' }, deleted: false, mtime: 5, updated_at: '2026-10-12T00:00:01.000Z' });
    server.rows.set('meta/deviceKey', { tbl: 'meta', id: 'deviceKey', data: { key: 'deviceKey', value: 'x' }, deleted: false, mtime: 5, updated_at: '2026-10-12T00:00:02.000Z' });
    const a = device();
    await signIn(a);
    expect(await a.questions.count()).toBe(0);
    expect(await a.meta.get('deviceKey')).toBeUndefined();
  });

  it('keeps a row too large for the server here, and says which', async () => {
    const a = device();
    await a.questions.put(q('besar', { explanation: 'x'.repeat(MAX_ROW_CHARS + 10) }));
    await a.questions.put(q('kecil'));
    const r = await signIn(a);
    expect(r.tooLarge).toEqual(['questions/besar']);
    expect(server.rows.has('questions/kecil')).toBe(true);
    expect(server.rows.has('questions/besar')).toBe(false);
  });

  it('uploads rows written by an older cached app without a stamp, and their deletion', async () => {
    const a = device();
    await a.questions.bulkPut([q('q1'), q('q2')]);
    await signIn(a);
    // An older version of the app wrote q3 and removed q2 without stamping either.
    await a.syncStamps.put({ tbl: 'questions', id: 'q2', mtime: 1, dirty: 0, deleted: 0 });
    await a.transaction('rw', a.questions, a.syncStamps, async () => {
      await a.questions.put(q('q3'));
      await a.questions.delete('q2');
      await a.syncStamps.bulkDelete([
        ['questions', 'q3'],
        ['questions', 'q2'],
      ]);
      await a.syncStamps.put({ tbl: 'questions', id: 'q2', mtime: 1, dirty: 0, deleted: 0 });
    });
    expect(await stampMissing(a)).toBe(2);
    await sync(a);
    expect(server.rows.get('questions/q3')?.deleted).toBe(false);
    expect(server.rows.get('questions/q2')?.deleted).toBe(true);
  });
});

describe('signing in on a device (#102)', () => {
  it('asks before combining a device with data into the account, and then uploads it', async () => {
    const a = device();
    await a.questions.put(q('q1'));
    await a.sets.put(set('s', ['q1']));
    const plan = await planAttach(a, USER);
    expect(plan).toEqual({ kind: 'confirm-merge', local: { sets: 1, questions: 1, attempts: 0 } });
    expect((await getSyncState(a)).owner).toBeUndefined();
    await adopt(a, USER);
    await sync(a);
    expect(await server.counts()).toEqual({ sets: 1, questions: 1, attempts: 0 });
  });

  it('combines two devices that both had data before signing in', async () => {
    const a = device();
    await a.questions.put(q('qa'));
    await signIn(a);
    const b = device();
    await b.questions.put(q('qb'));
    expect((await planAttach(b, USER)).kind).toBe('confirm-merge');
    await adopt(b, USER);
    await sync(b);
    await sync(a);
    for (const d of [a, b]) expect((await d.questions.toCollection().primaryKeys()).sort()).toEqual(['qa', 'qb']);
  });

  it('asks before putting another account’s data into a new one, and drops that account’s deletions', async () => {
    const a = device();
    await a.questions.bulkPut([q('q1'), q('shared')]);
    await signIn(a, 'user-1');
    await a.questions.delete('shared');
    await sync(a);

    // Account 2 already has the question with the same id (from the same shared set).
    const other = device();
    await other.questions.put(q('shared'));
    await signIn(other, 'user-2');

    expect(await planAttach(a, 'user-2')).toEqual({ kind: 'confirm-switch', local: { sets: 0, questions: 1, attempts: 0 } });
    await adopt(a, 'user-2');
    await sync(a);
    expect(await a.questions.get('shared')).toBeDefined();
    expect(server.rows.get('questions/shared')?.deleted).toBe(false);
  });

  it('removes local data only once everything is sent, without deleting it from the account', async () => {
    const a = device();
    await a.questions.put(q('q1'));
    await a.meta.put({ key: 'deviceKey', value: 'tetap' });
    await signIn(a);
    await a.questions.put(q('q2'));
    await expect(clearLocalData(a)).rejects.toThrow('belum terkirim');
    await sync(a);
    await clearLocalData(a);
    expect(await a.questions.count()).toBe(0);
    expect((await a.meta.get('deviceKey'))?.value).toBe('tetap');
    expect(await pendingCount(a)).toBe(0);
    expect(server.rows.get('questions/q1')?.deleted).toBe(false);

    // Signing in again brings it all back.
    expect((await planAttach(a, USER)).kind).toBe('ready');
    await sync(a);
    expect(await a.questions.count()).toBe(2);
  });
});
