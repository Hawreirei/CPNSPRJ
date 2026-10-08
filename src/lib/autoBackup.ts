import { db } from '../db';
import { exportBackup, getBackupState, markBackedUp, updateBackupState, type AutoBackupError } from '../db/backup';
import { downloadBlob } from '../components/ui';

/**
 * Backups that keep themselves current.
 *
 * Manual: one click downloads a JSON file and records the time, which drives the reminder.
 * Automatic (Chromium desktop, File System Access API): the user picks a file once and every
 * meaningful change is written to it a few seconds later. The browser may drop the write
 * permission between visits; we never prompt on our own, we report it and wait for a click.
 */

/** File System Access API members missing from TypeScript's DOM types. */
interface PermissionedHandle extends FileSystemFileHandle {
  queryPermission?(d: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(d: { mode: 'readwrite' }): Promise<PermissionState>;
}
type SaveFilePicker = (options: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

const HANDLE_KEY = 'backupHandle';
const CHANGE_KEY = 'skd-last-change-at';
const DEBOUNCE_MS = 4_000;
const MAX_WAIT_MS = 60_000;

export const backupFileName = (now = new Date()) => `skd-backup-${now.toISOString().slice(0, 10)}.json`;

/** Download a backup now and count it as the latest backup. */
export async function downloadBackup(): Promise<void> {
  downloadBlob(await exportBackup(), backupFileName());
  await markBackedUp('manual');
}

export function isAutoBackupSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';
}

export type WriteResult = { ok: true } | ({ ok: false } & AutoBackupError);

const PERMISSION: AutoBackupError = {
  kind: 'permission',
  message: 'Browser meminta izin lagi untuk menulis ke berkas cadangan. Klik "Izinkan lagi".',
};
const MISSING: AutoBackupError = {
  kind: 'missing',
  message: 'Berkas cadangan tidak ditemukan; mungkin dipindah, diganti nama, atau dihapus. Pilih berkas lagi.',
};

/**
 * Write a full backup to `handle`. Only asks for permission when `request` is set, which
 * must come from a click: browsers reject permission prompts without a user gesture.
 */
export async function writeBackupTo(handle: PermissionedHandle, { request = false } = {}): Promise<WriteResult> {
  try {
    let perm: PermissionState = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (perm !== 'granted' && request) perm = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
    if (perm !== 'granted') return { ok: false, ...PERMISSION };
    const blob = await exportBackup();
    const w = await handle.createWritable();
    await w.write(blob);
    await w.close();
    return { ok: true };
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === 'NotFoundError') return { ok: false, ...MISSING };
    if (name === 'NotAllowedError' || name === 'SecurityError') return { ok: false, ...PERMISSION };
    return { ok: false, kind: 'other', message: `Gagal menulis cadangan: ${(e as Error)?.message ?? String(e)}` };
  }
}

export async function recordAutoResult(result: WriteResult, fileName: string, now = Date.now()): Promise<void> {
  const prev = (await getBackupState()).auto;
  if (result.ok) {
    await markBackedUp('auto', now);
    await updateBackupState({ auto: { fileName, lastWriteAt: now } });
  } else {
    const { kind, message } = result;
    await updateBackupState({ auto: { fileName, lastWriteAt: prev?.lastWriteAt, error: { kind, message } } });
  }
}

const loadHandle = async () => (await db.meta.get(HANDLE_KEY))?.value as PermissionedHandle | undefined;

let queue: Promise<unknown> = Promise.resolve();

/** Write to the chosen file, if any. Writes are queued so two never overlap on the same file. */
export function autoBackupNow({ request = false } = {}): Promise<WriteResult | null> {
  const run = queue.then(async () => {
    const handle = await loadHandle();
    if (!handle) return null;
    const result = await writeBackupTo(handle, { request });
    await recordAutoResult(result, handle.name);
    return result;
  });
  queue = run.catch(() => null);
  return run;
}

/** Let the user pick (or create) the backup file, then write to it right away. `null` if they cancel. */
export async function chooseBackupFile(): Promise<WriteResult | null> {
  const picker = (window as unknown as { showSaveFilePicker: SaveFilePicker }).showSaveFilePicker;
  let handle: FileSystemFileHandle;
  try {
    handle = await picker({
      suggestedName: 'skd-cadangan-otomatis.json',
      types: [{ description: 'Cadangan SKD (JSON)', accept: { 'application/json': ['.json'] } }],
    });
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') return null;
    throw e;
  }
  await db.meta.put({ key: HANDLE_KEY, value: handle });
  return autoBackupNow({ request: true });
}

export async function stopAutoBackup(): Promise<void> {
  await db.meta.delete(HANDLE_KEY);
  await updateBackupState({ auto: undefined });
}

/** Last change to backed-up data in this browser, or undefined if none was seen yet. */
export function lastChangeAt(): number | undefined {
  try {
    const v = Number(localStorage.getItem(CHANGE_KEY));
    return v > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
let pendingSince: number | undefined;

/** Debounced: waits for a quiet moment, but never longer than a minute during a long generation. */
function scheduleWrite() {
  const now = Date.now();
  pendingSince ??= now;
  clearTimeout(timer);
  const wait = Math.max(0, Math.min(DEBOUNCE_MS, pendingSince + MAX_WAIT_MS - now));
  timer = setTimeout(() => {
    pendingSince = undefined;
    void autoBackupNow();
  }, wait);
}

function changed() {
  try {
    localStorage.setItem(CHANGE_KEY, String(Date.now()));
  } catch {
    /* storage blocked: the reminder falls back to elapsed time */
  }
  scheduleWrite();
}

/**
 * Watch the tables that go into a backup. API keys, the request log and our own backup
 * bookkeeping are not backed up, so changes to them are ignored. In-progress exam answers
 * are skipped too; the attempt counts once it gets a result.
 */
export function setupAutoBackup() {
  for (const t of [db.questions, db.sets, db.reviews]) {
    t.hook('creating', changed);
    t.hook('updating', () => void changed());
    t.hook('deleting', changed);
  }
  db.attempts.hook('updating', (mods) => void ('result' in mods && changed()));
  db.attempts.hook('deleting', changed);
  db.meta.hook('creating', (key) => void (key === 'settings' && changed()));
  db.meta.hook('updating', (_mods, key) => void (key === 'settings' && changed()));

  // Changes left unsaved when the last tab closed (inside the debounce window, or without permission).
  void getBackupState().then((s) => {
    const last = lastChangeAt();
    if (s.auto && last && last > (s.lastBackupAt ?? 0)) scheduleWrite();
  });
}
