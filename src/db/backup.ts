import { db } from './index';
import type { Attempt, QSet, Question } from '../domain/types';

interface BackupFile {
  app: 'cpns-skd-builder';
  version: 1;
  exportedAt: string;
  settings: unknown;
  sets: QSet[];
  questions: Question[];
  attempts: Attempt[];
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
  };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

/** Merge a backup into the current data (existing IDs are overwritten). API keys are never included. */
export async function importBackup(file: File): Promise<{ sets: number; questions: number; attempts: number }> {
  const data = JSON.parse(await file.text()) as Partial<BackupFile>;
  if (data.app !== 'cpns-skd-builder') throw new Error('Berkas bukan cadangan CPNS SKD Set Builder.');
  await db.transaction('rw', [db.sets, db.questions, db.attempts, db.meta], async () => {
    if (data.questions?.length) await db.questions.bulkPut(data.questions);
    if (data.sets?.length) await db.sets.bulkPut(data.sets.map((s) => ({ ...s, status: s.status === 'generating' ? 'paused' : s.status })));
    if (data.attempts?.length) await db.attempts.bulkPut(data.attempts);
    if (data.settings) await db.meta.put({ key: 'settings', value: data.settings });
  });
  return { sets: data.sets?.length ?? 0, questions: data.questions?.length ?? 0, attempts: data.attempts?.length ?? 0 };
}
