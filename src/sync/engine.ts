import Dexie from 'dexie';
import type { AppDB } from '../db';
import { decide, toServer, type RemoteRow } from './merge';
import { isSynced, nextStamp, SYNC_META_KEYS, SYNC_TABLES, type SyncStamp, type SyncTable } from './track';

/**
 * Push and pull for one device's database against one server (#99, #100, #102). The server is an
 * interface so the same code runs against Supabase in the app and an in-memory fake in tests.
 */

export interface Cursor {
  at: string;
  tbl: string;
  id: string;
}

export interface PushRow {
  tbl: SyncTable;
  id: string;
  data: Record<string, unknown> | null;
  deleted: boolean;
  mtime: number;
  device_id: string;
}

export interface PulledRow extends RemoteRow {
  /** Server time of the write, exactly as the server gave it (microseconds); the pull cursor. */
  updated_at: string;
}

export interface Counts {
  sets: number;
  questions: number;
  attempts: number;
}

export interface SyncServer {
  /** Rows the server wrote; the others lost to a newer version already there. */
  push(rows: PushRow[]): Promise<{ tbl: string; id: string; mtime: number }[]>;
  /** Up to `max` rows written after `after`, in (updated_at, tbl, id) order. */
  pull(after: Cursor, max: number): Promise<PulledRow[]>;
  /** What the account holds, for the first-sign-in summary. */
  counts(): Promise<Counts>;
}

/** This device's sync bookkeeping, in `meta` under a key that is itself never synced. */
export interface SyncState {
  /** The account whose data this device holds. */
  owner?: string;
  cursor?: Cursor;
  lastSyncAt?: number;
}

const STATE_KEY = 'sync';
export const PAGE = 500;
const BATCH_ROWS = 200;
const BATCH_CHARS = 2_000_000;
/** The server refuses rows of 1.5 MB; anything near that is left here and reported. */
export const MAX_ROW_CHARS = 1_400_000;
/** A new pull starts this far before the last row seen: transactions can commit out of order. */
const OVERLAP_MS = 2 * 60_000;

export async function getSyncState(db: AppDB): Promise<SyncState> {
  return ((await db.meta.get(STATE_KEY))?.value as SyncState | undefined) ?? {};
}

export async function setSyncState(db: AppDB, patch: Partial<SyncState>): Promise<SyncState> {
  const next = { ...(await getSyncState(db)), ...patch };
  await db.meta.put({ key: STATE_KEY, value: next });
  return next;
}

const tablesOf = (db: AppDB) => SYNC_TABLES.map((t) => db.table(t));
const pkOf = (db: AppDB, tbl: SyncTable) => db.table(tbl).schema.primKey.keyPath as string;
const stampsOf = (db: AppDB, tbl: SyncTable) => db.syncStamps.where('[tbl+id]').between([tbl, Dexie.minKey], [tbl, Dexie.maxKey]).toArray();

/**
 * Stamps for rows written without one (an older cached version of the app, #96), and deletion stamps for
 * rows that are gone while their stamp says otherwise. Run once per session, before the first push.
 */
export async function stampMissing(db: AppDB): Promise<number> {
  return db.transaction('rw', [...tablesOf(db), db.syncStamps], async () => {
    const fixes: SyncStamp[] = [];
    for (const tbl of SYNC_TABLES) {
      const keys = (tbl === 'meta' ? (await db.meta.bulkGet([...SYNC_META_KEYS])).filter(Boolean).map((r) => r!.key) : await db.table(tbl).toCollection().primaryKeys()).map(
        String,
      );
      const stamps = new Map((await stampsOf(db, tbl)).map((s) => [s.id, s]));
      const present = new Set(keys);
      for (const id of keys) if (!stamps.has(id)) fixes.push({ tbl, id, mtime: nextStamp(), dirty: 1, deleted: 0 });
      for (const s of stamps.values()) if (!s.deleted && !present.has(s.id)) fixes.push({ ...s, mtime: nextStamp(s.mtime), dirty: 1, deleted: 1 });
    }
    await db.syncStamps.bulkPut(fixes);
    return fixes.length;
  });
}

export interface PushResult {
  sent: number;
  /** Rows too large for the server, left unsent. */
  tooLarge: string[];
}

/** Send every change the server does not have yet (#99). */
export async function push(db: AppDB, server: SyncServer, deviceId: string): Promise<PushResult> {
  const dirty = await db.syncStamps.where('dirty').equals(1).toArray();
  const result: PushResult = { sent: 0, tooLarge: [] };
  if (!dirty.length) return result;

  const rows: PushRow[] = [];
  for (const tbl of SYNC_TABLES) {
    const stamps = dirty.filter((s) => s.tbl === tbl);
    if (!stamps.length) continue;
    const stored = (await db.table(tbl).bulkGet(stamps.map((s) => s.id))) as (Record<string, unknown> | undefined)[];
    stamps.forEach((s, i) => {
      const row = stored[i];
      const gone = s.deleted === 1 || !row;
      rows.push({ tbl, id: s.id, data: gone ? null : toServer(tbl, s.id, row), deleted: gone, mtime: s.mtime, device_id: deviceId });
    });
  }

  let batch: PushRow[] = [];
  let chars = 0;
  const flush = async () => {
    if (!batch.length) return;
    await server.push(batch);
    await markSent(db, batch);
    result.sent += batch.length;
    batch = [];
    chars = 0;
  };
  for (const row of rows) {
    const size = JSON.stringify(row.data).length;
    if (size > MAX_ROW_CHARS) {
      result.tooLarge.push(`${row.tbl}/${row.id}`);
      continue;
    }
    if (batch.length >= BATCH_ROWS || chars + size > BATCH_CHARS) await flush();
    batch.push(row);
    chars += size;
  }
  await flush();
  return result;
}

/**
 * The server now has these versions, or a newer one it kept instead. A row changed again while it was
 * being sent has a newer stamp, which stays dirty and goes with the next push.
 */
async function markSent(db: AppDB, rows: PushRow[]) {
  await db.transaction('rw', db.syncStamps, async () => {
    const now = await db.syncStamps.bulkGet(rows.map((r) => [r.tbl, r.id] as [string, string]));
    const done = now.filter((s, i): s is SyncStamp => !!s && s.mtime === rows[i].mtime && s.dirty === 1);
    await db.syncStamps.bulkPut(done.map((s) => ({ ...s, dirty: 0 as const })));
  });
}

export interface PullResult {
  pulled: number;
  changed: number;
  settingsChanged: boolean;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function overlap(at: string): string {
  const t = Date.parse(at);
  return Number.isFinite(t) ? new Date(t - OVERLAP_MS).toISOString() : '-infinity';
}

/** Bring in every change made elsewhere since the last pull (#100). */
export async function pull(db: AppDB, server: SyncServer): Promise<PullResult> {
  const state = await getSyncState(db);
  let after: Cursor = { at: state.cursor ? overlap(state.cursor.at) : '-infinity', tbl: '', id: '' };
  const result: PullResult = { pulled: 0, changed: 0, settingsChanged: false };
  for (;;) {
    const page = await server.pull(after, PAGE);
    if (!page.length) break;
    const applied = await applyPage(db, page);
    result.pulled += page.length;
    result.changed += applied.changed;
    result.settingsChanged ||= applied.settingsChanged;
    const last = page[page.length - 1];
    after = { at: last.updated_at, tbl: last.tbl, id: last.id };
    await setSyncState(db, { cursor: after });
    if (page.length < PAGE) break;
  }
  return result;
}

/** A server row this device can store: a synced table and key, and data whose key matches. */
function usable(db: AppDB, row: PulledRow): boolean {
  if (!isSynced(row.tbl, row.id) || typeof row.mtime !== 'number') return false;
  if (row.deleted) return true;
  return isRec(row.data) && String(row.data[pkOf(db, row.tbl)]) === row.id;
}

async function applyPage(db: AppDB, page: PulledRow[]) {
  const rows = page.filter((r) => usable(db, r));
  let settingsChanged = false;
  const stamps: SyncStamp[] = [];
  await db.transaction('rw', [...tablesOf(db), db.syncStamps], async () => {
    const before = await db.syncStamps.bulkGet(rows.map((r) => [r.tbl, r.id] as [string, string]));
    for (const tbl of SYNC_TABLES) {
      const idx = rows.flatMap((r, i) => (r.tbl === tbl ? [i] : []));
      if (!idx.length) continue;
      const table = db.table(tbl);
      const stored = (await table.bulkGet(idx.map((i) => rows[i].id))) as (Record<string, unknown> | undefined)[];
      const puts: unknown[] = [];
      const deletes: string[] = [];
      idx.forEach((i, k) => {
        const remote = rows[i];
        const stamp = before[i];
        const d = decide({ stamp, row: stored[k] }, remote);
        if (d.kind === 'keep') return;
        const { id } = remote;
        if (d.kind === 'take' && remote.deleted) {
          deletes.push(id);
          stamps.push({ tbl, id, mtime: remote.mtime, dirty: 0, deleted: 1 });
        } else if (d.kind === 'take') {
          puts.push(remote.data);
          stamps.push({ tbl, id, mtime: remote.mtime, dirty: 0, deleted: 0 });
        } else {
          puts.push(d.data);
          stamps.push(
            d.push ? { tbl, id, mtime: nextStamp(Math.max(remote.mtime, stamp?.mtime ?? 0)), dirty: 1, deleted: 0 } : { tbl, id, mtime: remote.mtime, dirty: 0, deleted: 0 },
          );
        }
        if (tbl === 'meta' && id === 'settings') settingsChanged = true;
      });
      if (puts.length) await table.bulkPut(puts);
      if (deletes.length) await table.bulkDelete(deletes);
    }
    // The writes above were stamped as local changes; these stamps, written after them, replace those.
    await db.syncStamps.bulkPut(stamps);
  });
  return { changed: stamps.length, settingsChanged };
}

export async function localCounts(db: AppDB): Promise<Counts> {
  const [sets, questions, attempts] = await Promise.all([db.sets.count(), db.questions.count(), db.attempts.count()]);
  return { sets, questions, attempts };
}

const hasData = (c: Counts) => c.sets + c.questions + c.attempts > 0;

export type AttachPlan =
  /** This device already belongs to the account, or is empty: sync can start. */
  | { kind: 'ready' }
  /** First sign-in on a device with data: show what will be combined before doing it. */
  | { kind: 'confirm-merge'; local: Counts }
  /** The device holds another account's data: ask before putting it into this one. */
  | { kind: 'confirm-switch'; local: Counts };

/**
 * What signing in as `userId` means for the data here (#102). An empty device is adopted at once;
 * a device with data waits for the learner to agree. Nothing here deletes anything.
 */
export async function planAttach(db: AppDB, userId: string): Promise<AttachPlan> {
  const state = await getSyncState(db);
  if (state.owner === userId) return { kind: 'ready' };
  const local = await localCounts(db);
  if (!hasData(local)) {
    await adopt(db, userId, { fresh: true });
    return { kind: 'ready' };
  }
  return state.owner ? { kind: 'confirm-switch', local } : { kind: 'confirm-merge', local };
}

/**
 * Bind this device to `userId`. Every row is queued for upload (rows already sent belonged to another
 * account). `fresh`: the device had no learning data, so its settings and study days count as oldest
 * and whatever the account already holds wins. Deletions recorded for another account are dropped:
 * they must not remove rows of the same id (a question from the same shared set) from this one.
 */
export async function adopt(db: AppDB, userId: string, { fresh = false } = {}): Promise<void> {
  await db.transaction('rw', db.syncStamps, db.meta, async () => {
    const { owner } = await getSyncState(db);
    const all = await db.syncStamps.toArray();
    const gone = owner && owner !== userId ? all.filter((s) => s.deleted) : [];
    await db.syncStamps.bulkDelete(gone.map((s) => [s.tbl, s.id] as [string, string]));
    const queued = all.flatMap((s) => {
      if (gone.includes(s)) return [];
      const next = { ...s, dirty: 1 as const, mtime: fresh && s.tbl === 'meta' ? 1 : s.mtime };
      return next.dirty === s.dirty && next.mtime === s.mtime ? [] : [next];
    });
    await db.syncStamps.bulkPut(queued);
    await db.meta.put({ key: STATE_KEY, value: { owner: userId } satisfies SyncState });
  });
}

export interface SyncResult extends PullResult, PushResult {}

/** One round: bring in what changed elsewhere, then send what changed here. */
export async function syncOnce(db: AppDB, server: SyncServer, deviceId: string, { checkStamps = false } = {}): Promise<SyncResult> {
  if (checkStamps) await stampMissing(db);
  const pulled = await pull(db, server);
  const pushed = await push(db, server, deviceId);
  await setSyncState(db, { lastSyncAt: Date.now() });
  return { ...pulled, ...pushed };
}

export const pendingCount = (db: AppDB) => db.syncStamps.where('dirty').equals(1).count();

/**
 * Remove the synced data from this device (#103), only when everything is on the server. The stamps go
 * last in the same transaction, so the deletes are not queued as deletions for the account.
 */
export async function clearLocalData(db: AppDB): Promise<void> {
  await db.transaction('rw', [...tablesOf(db), db.syncStamps], async () => {
    if ((await db.syncStamps.where('dirty').equals(1).count()) > 0) throw new Error('Masih ada perubahan yang belum terkirim.');
    for (const tbl of SYNC_TABLES) {
      if (tbl === 'meta') await db.meta.bulkDelete([...SYNC_META_KEYS, STATE_KEY]);
      else await db.table(tbl).clear();
    }
    await db.syncStamps.clear();
  });
}
