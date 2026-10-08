import { useLiveQuery } from 'dexie-react-hooks';
import { SNOOZE_DAYS } from '../domain/backupReminder';
import { db } from './index';
import type { Attempt, QSet, Question, ReviewItem } from '../domain/types';
import { REVIEW_DAYS_KEY } from '../engine/review';
import { logDay } from '../engine/streak';

interface BackupFile {
  app: 'cpns-skd-builder';
  version: 1;
  exportedAt: string;
  settings: unknown;
  sets: QSet[];
  questions: Question[];
  attempts: Attempt[];
  /** Missing in backups made before the mistake notebook existed. */
  reviews?: ReviewItem[];
  /** Days reviews were graded, for the streak. Missing in older backups. */
  reviewDays?: string[];
}

export async function exportBackup(): Promise<Blob> {
  const data: BackupFile = {
    app: 'cpns-skd-builder',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: (await db.meta.get('settings'))?.value ?? null,
    sets: await db.sets.toArray(),
    questions: await db.questions.toArray(),
    attempts: await db.attempts.toArray(),
    reviews: await db.reviews.toArray(),
    reviewDays: ((await db.meta.get(REVIEW_DAYS_KEY))?.value as string[] | undefined) ?? [],
  };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

/** Merge a backup into the current data (existing IDs are overwritten). API keys are never included. */
export async function importBackup(file: File): Promise<{ sets: number; questions: number; attempts: number; reviews: number }> {
  const data = JSON.parse(await file.text()) as Partial<BackupFile>;
  if (data.app !== 'cpns-skd-builder') throw new Error('Berkas bukan cadangan CPNS SKD Set Builder.');
  await db.transaction('rw', [db.sets, db.questions, db.attempts, db.reviews, db.meta], async () => {
    if (data.questions?.length) await db.questions.bulkPut(data.questions);
    if (data.sets?.length) await db.sets.bulkPut(data.sets.map((s) => ({ ...s, status: s.status === 'generating' ? 'paused' : s.status })));
    if (data.attempts?.length) await db.attempts.bulkPut(data.attempts);
    if (data.reviews?.length) await db.reviews.bulkPut(data.reviews);
    if (data.settings) await db.meta.put({ key: 'settings', value: data.settings });
    if (Array.isArray(data.reviewDays) && data.reviewDays.length) {
      const mine = ((await db.meta.get(REVIEW_DAYS_KEY))?.value as string[] | undefined) ?? [];
      const days = data.reviewDays.filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)).reduce(logDay, mine);
      await db.meta.put({ key: REVIEW_DAYS_KEY, value: days });
    }
  });
  return { sets: data.sets?.length ?? 0, questions: data.questions?.length ?? 0, attempts: data.attempts?.length ?? 0, reviews: data.reviews?.length ?? 0 };
}

export type AutoBackupError = { kind: 'permission' | 'missing' | 'other'; message: string };

export interface BackupState {
  lastBackupAt?: number;
  lastBackupKind?: 'manual' | 'auto';
  snoozedUntil?: number;
  /** Present while automatic saving to a file is switched on. */
  auto?: { fileName: string; lastWriteAt?: number; error?: AutoBackupError };
}

const STATE_KEY = 'backup';

export async function getBackupState(): Promise<BackupState> {
  return ((await db.meta.get(STATE_KEY))?.value as BackupState | undefined) ?? {};
}

export async function updateBackupState(patch: Partial<BackupState>): Promise<BackupState> {
  return db.transaction('rw', db.meta, async () => {
    const next = { ...(await getBackupState()), ...patch };
    await db.meta.put({ key: STATE_KEY, value: next });
    return next;
  });
}

export function useBackupState(): BackupState | undefined {
  return useLiveQuery(getBackupState, []);
}

export const markBackedUp = (kind: 'manual' | 'auto', now = Date.now()) => updateBackupState({ lastBackupAt: now, lastBackupKind: kind, snoozedUntil: undefined });

export const snoozeBackupReminder = (now = Date.now()) => updateBackupState({ snoozedUntil: now + SNOOZE_DAYS * 86_400_000 });
