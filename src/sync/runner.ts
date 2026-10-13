import { useSyncExternalStore } from 'react';
import { db, getSettings } from '../db';
import { exportBackup } from '../db/backup';
import { downloadBlob } from '../lib/download';
import { getSupabase } from './client';
import { adopt, clearLocalData, getSyncState, pendingCount, planAttach, syncOnce, type Counts, type SyncServer } from './engine';
import { classifySyncError, supabaseServer } from './server';
import { onLocalChange } from './track';

/**
 * When sync runs, and what it is doing (#101). Runs while signed in: at start, a few seconds after each
 * change, when the connection comes back, when the tab is shown again, and every five minutes. One tab
 * at a time (Web Locks); a failed round is tried again after 5 s, 30 s, 2 min, then every 10 min.
 */

export type SyncPhase = 'off' | 'starting' | 'confirm' | 'syncing' | 'idle' | 'offline' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  /** Changes here the server does not have yet. */
  pending: number;
  lastSyncAt?: number;
  error?: string;
  /** First sign-in on a device with data (merge), or with another account's data (switch). */
  confirm?: { kind: 'merge' | 'switch'; local: Counts; remote?: Counts };
  /** Rows too large to upload. */
  tooLarge: string[];
  /** When the backup taken before the first sync was saved, if there is one. */
  snapshotAt?: number;
}

export const DEBOUNCE_MS = 5_000;
export const MAX_WAIT_MS = 60_000;
export const INTERVAL_MS = 5 * 60_000;
export const RETRY_MS = [5_000, 30_000, 120_000, 600_000];
const SNAPSHOT_KEY = 'syncSnapshot';

let status: SyncStatus = { phase: 'off', pending: 0, tooLarge: [] };
const listeners = new Set<() => void>();
function set(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}
export const getSyncStatus = () => status;
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => status,
  );
}

let makeServer: () => Promise<SyncServer> = async () => supabaseServer(await getSupabase());
/** Tests run the scheduler against a fake server. */
export function setServerFactory(f: () => Promise<SyncServer>) {
  makeServer = f;
}

function deviceId(): string {
  const KEY = 'casn-sync-device';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) localStorage.setItem(KEY, (id = crypto.randomUUID()));
    return id;
  } catch {
    return 'browser';
  }
}

let user: string | undefined;
let server: SyncServer | undefined;
let firstRound = true;
let running = false;
let again = false;
let inRound = false;
let retries = 0;
let debounce: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let pendingSince: number | undefined;
let cleanup: (() => void)[] = [];

/** Start syncing as `userId`, or wait for the learner to agree when the device holds data (#102). */
export async function attach(userId: string): Promise<void> {
  if (user === userId && status.phase !== 'off') return;
  detach();
  user = userId;
  set({ phase: 'starting', error: undefined, confirm: undefined, tooLarge: [] });
  try {
    server = await makeServer();
    const snapshot = (await db.meta.get(SNAPSHOT_KEY))?.value as { at: number } | undefined;
    set({ snapshotAt: snapshot?.at, pending: await pendingCount(db), lastSyncAt: (await getSyncState(db)).lastSyncAt });
    const plan = await planAttach(db, userId);
    if (user !== userId) return;
    if (plan.kind !== 'ready') {
      set({ phase: 'confirm', confirm: { kind: plan.kind === 'confirm-merge' ? 'merge' : 'switch', local: plan.local } });
      server
        .counts()
        .then((remote) => status.confirm && user === userId && set({ confirm: { ...status.confirm, remote } }))
        .catch(() => undefined);
      return;
    }
    begin();
  } catch (e) {
    set({ phase: 'error', error: classifySyncError(e).message });
  }
}

/**
 * The learner agreed to combine this device's data with the account. A backup of the device is kept
 * first, while sync is new (#111), and can be downloaded from Settings.
 */
export async function confirmAttach(): Promise<void> {
  if (!user || status.phase !== 'confirm') return;
  const at = Date.now();
  await db.meta.put({ key: SNAPSHOT_KEY, value: { at, blob: await exportBackup() } });
  await adopt(db, user);
  set({ phase: 'starting', confirm: undefined, snapshotAt: at });
  begin();
}

export async function downloadSnapshot(): Promise<void> {
  const s = (await db.meta.get(SNAPSHOT_KEY))?.value as { at: number; blob: Blob } | undefined;
  if (s) downloadBlob(s.blob, `skd-cadangan-sebelum-sinkronisasi-${new Date(s.at).toISOString().slice(0, 10)}.json`);
}

/** Stop syncing (signed out). Local data stays. */
export function detach() {
  cleanup.forEach((f) => f());
  cleanup = [];
  clearTimeout(debounce);
  clearTimeout(retryTimer);
  pendingSince = undefined;
  user = undefined;
  server = undefined;
  set({ phase: 'off', error: undefined, confirm: undefined });
}

function begin() {
  firstRound = true;
  retries = 0;
  const onVisible = () => {
    if (document.visibilityState === 'visible') kick();
    // Leaving the tab: send what is waiting now rather than after the debounce, which may never fire.
    else if (pendingSince !== undefined) kick();
  };
  const onOnline = () => kick();
  const tick = setInterval(kick, INTERVAL_MS);
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  const offChange = onLocalChange(() => {
    if (!inRound) schedule();
  });
  cleanup.push(
    () => clearInterval(tick),
    () => window.removeEventListener('online', onOnline),
    () => document.removeEventListener('visibilitychange', onVisible),
    offChange,
  );
  kick();
}

/** A change here: sync once things are quiet for a few seconds, but within a minute during a long generation. */
function schedule() {
  const now = Date.now();
  pendingSince ??= now;
  clearTimeout(debounce);
  debounce = setTimeout(kick, Math.max(0, Math.min(DEBOUNCE_MS, pendingSince + MAX_WAIT_MS - now)));
  void pendingCount(db).then((pending) => set({ pending }));
}

/** Sync now; if a round is running, run one more right after it. */
export function kick() {
  if (!server || status.phase === 'confirm' || status.phase === 'off') return;
  clearTimeout(debounce);
  pendingSince = undefined;
  if (running) {
    again = true;
    return;
  }
  void round();
}

async function withLock(fn: () => Promise<void>) {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks?.request) await locks.request('casn-sync', fn);
  else await fn();
}

async function round() {
  const srv = server;
  if (!srv) return;
  running = true;
  clearTimeout(retryTimer);
  set({ phase: 'syncing' });
  try {
    await withLock(async () => {
      inRound = true;
      try {
        const r = await syncOnce(db, srv, deviceId(), { checkStamps: firstRound });
        firstRound = false;
        if (r.settingsChanged) await getSettings(); // registers imported exam packages again
        set({ tooLarge: r.tooLarge });
      } finally {
        inRound = false;
      }
    });
    const pending = await pendingCount(db);
    if (server !== srv) return;
    retries = 0;
    set({ phase: 'idle', lastSyncAt: Date.now(), error: undefined, pending });
    // Changed during the round (their notices were held back while it ran).
    if (!again && pending > status.tooLarge.length) schedule();
  } catch (e) {
    const pending = await pendingCount(db).catch(() => status.pending);
    if (server !== srv) return;
    const p = classifySyncError(e);
    set({ phase: p.phase, error: p.message, pending });
    retryTimer = setTimeout(kick, RETRY_MS[Math.min(retries++, RETRY_MS.length - 1)]);
  } finally {
    running = false;
    if (again) {
      again = false;
      kick();
    }
  }
}

/** Sign-out with removal (#103): only once nothing is waiting to be sent. */
export async function removeLocalData(): Promise<void> {
  await clearLocalData(db);
  await db.meta.delete(SNAPSHOT_KEY);
  set({ pending: 0, lastSyncAt: undefined, snapshotAt: undefined });
}
