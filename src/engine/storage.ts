import { db } from '../db';

/**
 * Browser storage: how full it is, what can be safely cleared, and a readable message when a
 * write fails because it is full. Sets, questions and the mistake notebook are never cleared here.
 */

/** Warn on the dashboard from this share of the quota. */
export const STORAGE_WARN_RATIO = 0.8;
/** Request-log rows older than this no longer count towards any rate limit. */
export const OLD_REQUEST_MS = 2 * 24 * 3600_000;
/** Unfinished attempts started longer ago than this are offered for clearing. */
export const STALE_ATTEMPT_DAYS = 30;

export const QUOTA_MESSAGE =
  'Penyimpanan browser penuh, jadi data terakhir tidak tersimpan. Buka Pengaturan → Penyimpanan untuk membersihkan data lama, atau unduh cadangan lalu hapus set yang tidak dipakai.';

export interface StorageStatus {
  usage: number;
  quota: number;
  ratio: number;
  warn: boolean;
}

/** From `navigator.storage.estimate()`; null when the browser does not say. */
export function storageStatus(est: { usage?: number; quota?: number } | undefined): StorageStatus | null {
  if (!est?.quota || est.usage === undefined) return null;
  const ratio = est.usage / est.quota;
  return { usage: est.usage, quota: est.quota, ratio, warn: ratio >= STORAGE_WARN_RATIO };
}

export async function getStorageInfo(): Promise<{ status: StorageStatus | null; persisted: boolean | null }> {
  const s = typeof navigator === 'undefined' ? undefined : navigator.storage;
  try {
    const [est, persisted] = await Promise.all([s?.estimate?.(), s?.persisted?.()]);
    return { status: storageStatus(est), persisted: persisted ?? null };
  } catch {
    return { status: null, persisted: null };
  }
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
  return `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
}

/** Rough size of rows as stored: their JSON length. Good enough to say what clearing frees. */
const sizeOf = (rows: unknown[]) => rows.reduce<number>((n, r) => n + JSON.stringify(r).length, 0);

async function staleRows(now: number) {
  const [requests, attempts] = await Promise.all([
    db.requests.where('at').below(now - OLD_REQUEST_MS).toArray(),
    db.attempts.where('startedAt').below(now - STALE_ATTEMPT_DAYS * 86_400_000).filter((a) => !a.finishedAt).toArray(),
  ]);
  return { requests, attempts };
}

export interface Cleanup {
  requests: number;
  attempts: number;
  /** Estimated bytes freed. */
  bytes: number;
}

/** What clearing would remove, before anything is removed. */
export async function cleanupPreview(now = Date.now()): Promise<Cleanup> {
  const { requests, attempts } = await staleRows(now);
  return { requests: requests.length, attempts: attempts.length, bytes: sizeOf(requests) + sizeOf(attempts) };
}

/** Remove old request-log rows and long-abandoned unfinished attempts. Nothing else. */
export async function cleanupStorage(now = Date.now()): Promise<Cleanup> {
  return db.transaction('rw', db.requests, db.attempts, async () => {
    const { requests, attempts } = await staleRows(now);
    await db.requests.bulkDelete(requests.map((r) => r.id!));
    await db.attempts.bulkDelete(attempts.map((a) => a.id));
    return { requests: requests.length, attempts: attempts.length, bytes: sizeOf(requests) + sizeOf(attempts) };
  });
}

/** A failed write because storage is full, however the browser or Dexie wraps it. */
export function isQuotaError(e: unknown): boolean {
  for (let x = e as { name?: string; inner?: unknown } | undefined, i = 0; x && i < 4; x = x.inner as typeof x, i++) {
    if (x.name === 'QuotaExceededError' || x.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  }
  return false;
}

/** The message to show for an error: a full disk explained, anything else as it is. */
export const errorText = (e: unknown): string => (isQuotaError(e) ? QUOTA_MESSAGE : e instanceof Error ? e.message : String(e));
