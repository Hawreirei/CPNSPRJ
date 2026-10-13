import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, saveSettings } from '../db';
import { exportBackup, getBackupState, importBackup, markBackedUp, snoozeBackupReminder, updateBackupState } from '../db/backup';
import { backupReminder, fmtAgo, PERSIST_TIP_HIDE_DAYS, persistTip, REMIND_AFTER_DAYS, SNOOZE_DAYS } from '../domain/backupReminder';
import type { Attempt } from '../domain/types';
import { canShareBackup, isAutoBackupSupported, lastChangeAt, recordAutoResult, setupAutoBackup, shareBackup, writeBackupTo } from '../lib/autoBackup';

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 8, 12).getTime();

describe('backup reminder rule', () => {
  const r = (o: Partial<Parameters<typeof backupReminder>[0]>) => backupReminder({ setCreatedAt: [], now: NOW, ...o });

  it('stays quiet without data or right after the first set', () => {
    expect(r({})).toBeNull();
    expect(r({ setCreatedAt: [NOW - DAY] })).toBeNull();
  });

  it('starts the clock at the first set when never backed up', () => {
    expect(r({ setCreatedAt: [NOW - REMIND_AFTER_DAYS * DAY] })).toMatchObject({ reason: 'days', days: 7, newSets: 1 });
    expect(r({ setCreatedAt: [NOW - 3 * DAY, NOW - DAY, NOW] })).toMatchObject({ reason: 'sets', newSets: 3 });
  });

  it('reminds a week after the last backup, or after three new sets', () => {
    expect(r({ lastBackupAt: NOW - 6 * DAY, setCreatedAt: [NOW - 30 * DAY] })).toBeNull();
    expect(r({ lastBackupAt: NOW - 8 * DAY, setCreatedAt: [NOW - 30 * DAY] })).toMatchObject({ reason: 'days', days: 8, newSets: 0 });
    expect(r({ lastBackupAt: NOW - DAY, setCreatedAt: [NOW - 30 * DAY, NOW - 3600, NOW - 60] })).toBeNull();
    expect(r({ lastBackupAt: NOW - DAY, setCreatedAt: [NOW - 30 * DAY, NOW - 7200, NOW - 3600, NOW - 60] })).toMatchObject({ reason: 'sets', newSets: 3 });
  });

  it('does not remind when nothing changed since the backup', () => {
    expect(r({ lastBackupAt: NOW - 30 * DAY, lastChangeAt: NOW - 31 * DAY, setCreatedAt: [NOW - 40 * DAY] })).toBeNull();
    expect(r({ lastBackupAt: NOW - 30 * DAY, lastChangeAt: NOW - DAY, setCreatedAt: [NOW - 40 * DAY] })).not.toBeNull();
  });

  it('respects a snooze', () => {
    const due = { lastBackupAt: NOW - 30 * DAY, setCreatedAt: [NOW - 40 * DAY] };
    expect(r({ ...due, snoozedUntil: NOW + DAY })).toBeNull();
    expect(r({ ...due, snoozedUntil: NOW - 1 })).not.toBeNull();
  });

  it('reminds as soon as an exam or practice is finished after the last backup', () => {
    const backedUp = { lastBackupAt: NOW - DAY, setCreatedAt: [NOW - 30 * DAY] };
    expect(r({ ...backedUp, finishedAt: [NOW - 2 * DAY] })).toBeNull();
    expect(r({ ...backedUp, finishedAt: [NOW - 2 * DAY, NOW - 3600] })).toMatchObject({ reason: 'attempts', newAttempts: 1 });
    expect(r({ ...backedUp, finishedAt: [NOW - 7200, NOW - 3600] })).toMatchObject({ reason: 'attempts', newAttempts: 2 });
    // Never backed up: the first finished exam is enough, even right after the first set.
    expect(r({ setCreatedAt: [NOW - 3600], finishedAt: [NOW - 60] })).toMatchObject({ reason: 'attempts', newAttempts: 1 });
    // Three new sets still say so first.
    expect(r({ lastBackupAt: NOW - DAY, setCreatedAt: [NOW - 3, NOW - 2, NOW - 1], finishedAt: [NOW] })).toMatchObject({ reason: 'sets', newAttempts: 1 });
  });

  it('lets a finished exam end a snooze early, but nothing else', () => {
    const snoozedUntil = NOW + (SNOOZE_DAYS - 1) * DAY; // "Nanti" pressed a day ago
    const due = { lastBackupAt: NOW - 30 * DAY, setCreatedAt: [NOW - 40 * DAY], snoozedUntil };
    expect(r({ ...due, finishedAt: [NOW - 2 * DAY] })).toBeNull();
    expect(r({ ...due, finishedAt: [NOW - 3600] })).toMatchObject({ reason: 'attempts' });
  });

  it('formats elapsed time', () => {
    expect(fmtAgo(NOW - 10_000, NOW)).toBe('baru saja');
    expect(fmtAgo(NOW - 5 * 60_000, NOW)).toBe('5 menit lalu');
    expect(fmtAgo(NOW - 3 * 3_600_000, NOW)).toBe('3 jam lalu');
    expect(fmtAgo(NOW - DAY, NOW)).toBe('kemarin');
    expect(fmtAgo(NOW - 4 * DAY, NOW)).toBe('4 hari lalu');
  });
});

describe('tip to install the app when storage is not persistent', () => {
  const tip = (o: Partial<Parameters<typeof persistTip>[0]>) => persistTip({ persisted: false, installed: false, hasData: true, now: NOW, ...o });

  it('shows only when the browser says it may clear the data, there is data, and the app is not installed', () => {
    expect(tip({})).toBe(true);
    expect(tip({ persisted: true })).toBe(false);
    expect(tip({ persisted: null })).toBe(false);
    expect(tip({ installed: true })).toBe(false);
    expect(tip({ hasData: false })).toBe(false);
  });

  it('stays hidden for a while after "Mengerti", then comes back', () => {
    expect(tip({ dismissedAt: NOW - DAY })).toBe(false);
    expect(tip({ dismissedAt: NOW - PERSIST_TIP_HIDE_DAYS * DAY })).toBe(true);
  });
});

/** Stand-in for a FileSystemFileHandle. */
function fakeHandle(opts: { perm?: PermissionState; grant?: PermissionState; createError?: string } = {}) {
  const h = {
    name: 'cadangan.json',
    kind: 'file' as const,
    written: undefined as string | undefined,
    requested: 0,
    perm: opts.perm ?? 'granted',
    async queryPermission() {
      return h.perm;
    },
    async requestPermission() {
      h.requested++;
      h.perm = opts.grant ?? 'denied';
      return h.perm;
    },
    async createWritable() {
      if (opts.createError) throw Object.assign(new Error(opts.createError), { name: opts.createError });
      let buf = '';
      return {
        async write(b: Blob) {
          buf += await b.text();
        },
        async close() {
          h.written = buf;
        },
      };
    },
  };
  return h;
}
const asHandle = (h: ReturnType<typeof fakeHandle>) => h as unknown as FileSystemFileHandle;

describe('writing to the chosen file', () => {
  beforeEach(async () => {
    await Promise.all([db.sets.clear(), db.questions.clear(), db.attempts.clear(), db.reviews.clear(), db.meta.clear()]);
  });

  it('writes a backup identical to a manual export, which imports back', async () => {
    await saveSettings({ brandName: 'Bimbel Uji' });
    await db.reviews.add({ questionId: 'q1', due: 0, interval: 0, ease: 2.5, reps: 0, lapses: 0, reasonTags: ['hitung'], addedAt: 0 });
    const h = fakeHandle();
    expect(await writeBackupTo(asHandle(h))).toEqual({ ok: true });
    const auto = JSON.parse(h.written!);
    const manual = JSON.parse(await (await exportBackup()).text());
    expect({ ...auto, exportedAt: 0 }).toEqual({ ...manual, exportedAt: 0 });

    await db.reviews.clear();
    const r = await importBackup(new File([h.written!], 'cadangan.json'));
    expect(r.reviews).toBe(1);
    expect((await db.reviews.get('q1'))?.reasonTags).toEqual(['hitung']);
  });

  it('reports a missing permission instead of prompting', async () => {
    const h = fakeHandle({ perm: 'prompt', grant: 'granted' });
    expect(await writeBackupTo(asHandle(h))).toMatchObject({ ok: false, kind: 'permission' });
    expect(h.requested).toBe(0);
    expect(h.written).toBeUndefined();
  });

  it('asks for permission only when the user clicked', async () => {
    const granted = fakeHandle({ perm: 'prompt', grant: 'granted' });
    expect(await writeBackupTo(asHandle(granted), { request: true })).toEqual({ ok: true });
    expect(granted.requested).toBe(1);
    const denied = fakeHandle({ perm: 'prompt', grant: 'denied' });
    expect(await writeBackupTo(asHandle(denied), { request: true })).toMatchObject({ ok: false, kind: 'permission' });
  });

  it('tells a moved or deleted file apart from other failures', async () => {
    expect(await writeBackupTo(asHandle(fakeHandle({ createError: 'NotFoundError' })))).toMatchObject({ ok: false, kind: 'missing' });
    expect(await writeBackupTo(asHandle(fakeHandle({ createError: 'NotAllowedError' })))).toMatchObject({ ok: false, kind: 'permission' });
    expect(await writeBackupTo(asHandle(fakeHandle({ createError: 'QuotaExceededError' })))).toMatchObject({ ok: false, kind: 'other' });
  });

  it('records successes as backups and keeps the last good write on failure', async () => {
    await recordAutoResult({ ok: true }, 'cadangan.json', NOW);
    expect(await getBackupState()).toMatchObject({ lastBackupAt: NOW, lastBackupKind: 'auto', auto: { fileName: 'cadangan.json', lastWriteAt: NOW } });
    await recordAutoResult({ ok: false, kind: 'permission', message: 'izin' }, 'cadangan.json', NOW + DAY);
    const s = await getBackupState();
    expect(s.lastBackupAt).toBe(NOW);
    expect(s.auto).toMatchObject({ lastWriteAt: NOW, error: { kind: 'permission' } });
    await recordAutoResult({ ok: true }, 'cadangan.json', NOW + 2 * DAY);
    expect((await getBackupState()).auto?.error).toBeUndefined();
  });

  it('clears a snooze when a backup is made', async () => {
    await snoozeBackupReminder(NOW);
    expect((await getBackupState()).snoozedUntil).toBeGreaterThan(NOW);
    await markBackedUp('manual', NOW);
    expect((await getBackupState()).snoozedUntil).toBeUndefined();
  });

  it('keeps backup bookkeeping out of the backup file', async () => {
    await updateBackupState({ lastBackupAt: NOW });
    const data = JSON.parse(await (await exportBackup()).text());
    expect(JSON.stringify(data)).not.toContain(String(NOW));
  });

  it('is unavailable without the File System Access API', () => {
    expect(isAutoBackupSupported()).toBe(false);
  });
});

describe('change tracking', () => {
  const store = new Map<string, string>();
  beforeAll(() => {
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
    setupAutoBackup();
  });
  beforeEach(async () => {
    await Promise.all([db.sets.clear(), db.questions.clear(), db.attempts.clear(), db.reviews.clear(), db.meta.clear(), db.keys.clear()]);
    store.clear();
  });

  const attempt: Attempt = {
    id: 'a1',
    setId: 's1',
    setName: 'Set',
    questionIds: [],
    startedAt: 0,
    endsAt: 1,
    answers: {},
    flagged: [],
    timeSpent: {},
    currentIndex: 0,
    passing: { TWK: 0, TIU: 0, TKP: 0 },
  };

  it('ignores in-progress answers but counts a finished attempt', async () => {
    await db.attempts.add(attempt);
    await db.attempts.update('a1', { answers: { q: 'A' }, currentIndex: 1 });
    expect(lastChangeAt()).toBeUndefined();
    await db.attempts.update('a1', { result: { perSubtest: [], topics: [], total: 0, maxTotal: 0, passedAll: false } });
    expect(lastChangeAt()).toBeGreaterThan(0);
  });

  it('ignores API keys and backup bookkeeping, counts settings and content', async () => {
    await updateBackupState({ lastBackupAt: NOW });
    await db.meta.put({ key: 'backupHandle', value: 'x' });
    await db.keys.add({ id: 'k', provider: 'gemini', label: 'k', model: 'm', cipher: new ArrayBuffer(1), iv: new Uint8Array(12), isDefault: true, createdAt: 0 });
    expect(lastChangeAt()).toBeUndefined();
    await saveSettings({ brandName: 'X' });
    expect(lastChangeAt()).toBeGreaterThan(0);
    store.clear();
    await db.reviews.add({ questionId: 'q1', due: 0, interval: 0, ease: 2.5, reps: 0, lapses: 0, reasonTags: [], addedAt: 0 });
    expect(lastChangeAt()).toBeGreaterThan(0);
  });
});

describe('sending a backup through the share sheet', () => {
  /** A phone browser's share sheet: which file types it takes, and what the learner does with it. */
  function fakeShare({ types = ['application/json', 'text/plain'], outcome = 'shared' }: { types?: string[]; outcome?: 'shared' | 'closed' | 'broken' } = {}) {
    const shared: File[] = [];
    vi.stubGlobal('navigator', {
      canShare: ({ files }: { files: File[] }) => files.every((f) => types.includes(f.type)),
      share: async ({ files }: { files: File[] }) => {
        if (outcome === 'closed') throw Object.assign(new Error('Share canceled'), { name: 'AbortError' });
        if (outcome === 'broken') throw new Error('Share failed');
        shared.push(...files);
      },
    });
    return shared;
  }

  beforeEach(async () => {
    await db.meta.delete('backup');
    await db.sets.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is not offered where the browser cannot share files', () => {
    vi.stubGlobal('navigator', {});
    expect(canShareBackup()).toBe(false);
    fakeShare({ types: [] });
    expect(canShareBackup()).toBe(false);
  });

  it('shares the backup file and counts it as a backup', async () => {
    const shared = fakeShare();
    expect(canShareBackup()).toBe(true);
    expect(await shareBackup()).toBe(true);
    expect(shared.map((f) => f.name)).toEqual([expect.stringMatching(/^skd-backup-\d{4}-\d{2}-\d{2}\.json$/)]);
    expect((await getBackupState()).lastBackupKind).toBe('manual');
  });

  it('falls back to .txt where JSON cannot be shared (Chrome on Android), and that file restores', async () => {
    await db.sets.put({ id: 's-share', name: 'Set dibagikan' } as never);
    const shared = fakeShare({ types: ['text/plain'] });
    expect(await shareBackup()).toBe(true);
    expect(shared[0].name).toMatch(/\.txt$/);
    expect(shared[0].type).toBe('text/plain');
    await db.sets.clear();
    expect((await importBackup(shared[0])).sets).toBe(1);
    expect((await db.sets.get('s-share'))?.name).toBe('Set dibagikan');
  });

  it('does not count a closed share sheet as a backup', async () => {
    fakeShare({ outcome: 'closed' });
    expect(await shareBackup()).toBe(false);
    expect((await getBackupState()).lastBackupAt).toBeUndefined();
  });

  it('reports a failed share', async () => {
    fakeShare({ outcome: 'broken' });
    await expect(shareBackup()).rejects.toThrow('Share failed');
    expect((await getBackupState()).lastBackupAt).toBeUndefined();
  });
});
