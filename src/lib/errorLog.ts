import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { appendEntry, logText, toEntry, type ErrorEntry, type ErrorSource } from '../domain/errorLog';
import { downloadBlob } from './download';

/** Meta row holding the log. Not in backups: it describes this device. */
const LOG_KEY = 'errorLog';

const readLog = async () => ((await db.meta.get(LOG_KEY))?.value as ErrorEntry[] | undefined) ?? [];

/** Add an error to the local log, cleaned (domain/errorLog.ts). Never throws: logging must not cause errors of its own. */
export async function logError(source: ErrorSource, err: unknown): Promise<void> {
  if ((err as Error | undefined)?.name === 'AbortError') return;
  try {
    const entry = toEntry(source, err, Date.now(), location.hash);
    await db.transaction('rw', db.meta, async () => {
      await db.meta.put({ key: LOG_KEY, value: appendEntry(await readLog(), entry) });
    });
  } catch {
    // Storage full or unavailable: nothing more to do.
  }
}

/** Uncaught errors and rejections anywhere in the page go to the log. */
export function setupErrorLog() {
  window.addEventListener('error', (e) => void logError('error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => void logError('unhandledrejection', e.reason));
}

export const useErrorCount = () => useLiveQuery(async () => (await readLog()).length, [], 0);

export async function downloadErrorLog() {
  const text = logText(await readLog(), { version: __APP_VERSION__, buildTime: __BUILD_TIME__, userAgent: navigator.userAgent, now: Date.now() });
  downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `log-galat-skd-${new Date().toISOString().slice(0, 10)}.txt`);
}

export const clearErrorLog = () => db.meta.delete(LOG_KEY);
