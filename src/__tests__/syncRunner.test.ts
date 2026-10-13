import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import type { Question } from '../domain/types';
import type { Counts, Cursor, PulledRow, PushRow, SyncServer } from '../sync/engine';
import { attach, confirmAttach, DEBOUNCE_MS, detach, getSyncStatus, kick, RETRY_MS, setServerFactory } from '../sync/runner';

/** Same rules as the server; `down` makes every call fail like a dropped connection. */
class FakeServer implements SyncServer {
  rows = new Map<string, PulledRow>();
  calls: string[] = [];
  down = false;
  private clock = 0;
  async push(rows: PushRow[]) {
    this.calls.push(`push ${rows.length}`);
    if (this.down) throw Object.assign(new Error('TypeError: Failed to fetch'), { status: 0 });
    for (const r of rows) {
      const cur = this.rows.get(`${r.tbl}/${r.id}`);
      if (cur && r.mtime < cur.mtime) continue;
      this.rows.set(`${r.tbl}/${r.id}`, { ...r, data: r.data && structuredClone(r.data), updated_at: new Date(Date.UTC(2026, 9, 12) + ++this.clock * 1000).toISOString() });
    }
    return [];
  }
  async pull(after: Cursor, max: number) {
    this.calls.push('pull');
    if (this.down) throw Object.assign(new Error('TypeError: Failed to fetch'), { status: 0 });
    const k = (r: { updated_at: string; tbl: string; id: string }) => `${r.updated_at}|${r.tbl}|${r.id}`;
    const from = `${after.at}|${after.tbl}|${after.id}`;
    return [...this.rows.values()]
      .filter((r) => k(r) > from)
      .sort((a, b) => (k(a) > k(b) ? 1 : -1))
      .slice(0, max);
  }
  async counts(): Promise<Counts> {
    return { sets: 0, questions: [...this.rows.values()].filter((r) => r.tbl === 'questions' && !r.deleted).length, attempts: 0 };
  }
}

const q = (id: string) =>
  ({
    id,
    subtest: 'TIU',
    topic: 'x',
    difficulty: 'sedang',
    stem: id,
    options: [],
    explanation: '',
    flags: [],
    locked: false,
    starred: false,
    hash: id,
    source: 'manual',
    createdAt: 1,
    updatedAt: 1,
  }) as unknown as Question;

let server: FakeServer;
/** Let fake-indexeddb and the promises around it finish, including a sync round under way. */
const settle = async () => {
  for (let i = 0; i < 500; i++) {
    await new Promise((r) => setImmediate(r));
    if (i >= 20 && !['syncing', 'starting'].includes(getSyncStatus().phase)) return;
  }
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  server = new FakeServer();
  setServerFactory(async () => server);
  await Promise.all(db.tables.map((t) => t.clear()));
});
afterEach(() => {
  detach();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('sync scheduler (#101)', () => {
  it('syncs right after sign-in on an empty device, and again a few seconds after a change', async () => {
    await attach('u1');
    await settle();
    expect(getSyncStatus()).toMatchObject({ phase: 'idle', pending: 0 });
    expect(getSyncStatus().lastSyncAt).toBeGreaterThan(0);

    server.calls = [];
    await db.questions.put(q('q1'));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1000);
    expect(server.calls).toEqual([]);
    expect(getSyncStatus().pending).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(server.calls).toEqual(['pull', 'push 1']);
    expect(getSyncStatus()).toMatchObject({ phase: 'idle', pending: 0 });
    expect(server.rows.has('questions/q1')).toBe(true);
  });

  it('waits offline with the changes kept, and sends them when the connection is back', async () => {
    await attach('u1');
    await settle();
    server.down = true;
    await db.questions.put(q('q1'));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    await settle();
    expect(getSyncStatus()).toMatchObject({ phase: 'offline', pending: 1 });
    expect(getSyncStatus().error).toMatch(/koneksi internet/);

    server.down = false;
    window.dispatchEvent(new Event('online'));
    await settle();
    expect(getSyncStatus()).toMatchObject({ phase: 'idle', pending: 0 });
  });

  it('tries again by itself after a failure', async () => {
    await attach('u1');
    await settle();
    server.down = true;
    kick();
    await settle();
    expect(getSyncStatus().phase).toBe('offline');
    server.down = false;
    await vi.advanceTimersByTimeAsync(RETRY_MS[0]);
    await settle();
    expect(getSyncStatus().phase).toBe('idle');
  });

  it('asks before combining a device that has data, keeps a backup, then syncs', async () => {
    await db.questions.bulkPut([q('q1'), q('q2')]);
    server.rows.set('questions/q9', {
      tbl: 'questions',
      id: 'q9',
      data: q('q9') as unknown as Record<string, unknown>,
      deleted: false,
      mtime: 1,
      updated_at: '2026-10-12T00:00:00.000Z',
    });
    await attach('u1');
    await settle();
    expect(getSyncStatus().phase).toBe('confirm');
    expect(getSyncStatus().confirm).toEqual({ kind: 'merge', local: { sets: 0, questions: 2, attempts: 0 }, remote: { sets: 0, questions: 1, attempts: 0 } });
    expect(server.calls.filter((c) => c !== 'pull')).toEqual([]);

    await confirmAttach();
    await settle();
    expect(getSyncStatus()).toMatchObject({ phase: 'idle', pending: 0 });
    expect(getSyncStatus().snapshotAt).toBeGreaterThan(0);
    expect(((await db.meta.get('syncSnapshot'))!.value as { blob: Blob }).blob).toBeInstanceOf(Blob);
    expect((await db.questions.toCollection().primaryKeys()).sort()).toEqual(['q1', 'q2', 'q9']);
    expect(server.rows.size).toBe(3);
  });

  it('stops on sign-out: later changes stay here', async () => {
    await attach('u1');
    await settle();
    detach();
    server.calls = [];
    await db.questions.put(q('q1'));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await settle();
    expect(server.calls).toEqual([]);
    expect(getSyncStatus().phase).toBe('off');
  });
});
