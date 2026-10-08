import Dexie, { type EntityTable } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_SETTINGS } from '../domain/blueprint';
import type { ApiKeyRecord, Attempt, QSet, Question, RequestLog, ReviewItem, Settings } from '../domain/types';

interface MetaRow {
  key: string;
  value: unknown;
}

export class AppDB extends Dexie {
  questions!: EntityTable<Question, 'id'>;
  sets!: EntityTable<QSet, 'id'>;
  attempts!: EntityTable<Attempt, 'id'>;
  keys!: EntityTable<ApiKeyRecord, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;
  requests!: EntityTable<RequestLog, 'id'>;
  reviews!: EntityTable<ReviewItem, 'questionId'>;

  constructor() {
    // Dexie's query cache served a page it had already shown a stale list: an exam finished
    // elsewhere still read as unfinished on the dashboard until a reload. Every query reads
    // IndexedDB instead; the data here is small enough that this costs nothing visible.
    super('cpns-skd-builder', { cache: 'disabled' });
    this.version(1).stores({
      questions: 'id, subtest, topic, difficulty, hash, starred, originSetId, createdAt',
      sets: 'id, updatedAt, status',
      attempts: 'id, setId, startedAt, finishedAt',
      keys: 'id, provider',
      meta: 'key',
    });
    // v2: per-key request log for client-side rate limiting.
    this.version(2).stores({ requests: '++id, keyId, at, [keyId+at]' });
    // v3: mistake notebook with spaced-repetition schedule, one row per question.
    this.version(3).stores({ reviews: 'questionId, due, lastReviewedAt' });
  }
}

export const db = new AppDB();

export async function getSettings(): Promise<Settings> {
  const row = await db.meta.get('settings');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  await db.meta.put({ key: 'settings', value: { ...cur, ...patch } });
}

export function useSettings(): Settings {
  return useLiveQuery(getSettings, [], DEFAULT_SETTINGS);
}

/** Questions of a set in the set's order. */
export async function getSetQuestions(set: QSet): Promise<Question[]> {
  const rows = await db.questions.bulkGet(set.questionIds);
  return rows.filter((q): q is Question => !!q);
}

export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
