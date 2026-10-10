import Dexie, { type EntityTable } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { DEFAULT_SETTINGS } from '../domain/blueprint';
import type { ApiKeyRecord, Attempt, QSet, Question, RequestLog, Settings } from '../domain/types';

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

  constructor() {
    super('cpns-skd-builder');
    this.version(1).stores({
      questions: 'id, subtest, topic, difficulty, hash, starred, originSetId, createdAt',
      sets: 'id, updatedAt, status',
      attempts: 'id, setId, startedAt, finishedAt',
      keys: 'id, provider',
      meta: 'key',
    });
    // v2: per-key request log for client-side rate limiting.
    this.version(2).stores({ requests: '++id, keyId, at, [keyId+at]' });
  }
}

export const db = new AppDB();

export async function getSettings(): Promise<Settings> {
  const row = await db.meta.get('settings');
  const saved = { ...((row?.value as Partial<Settings>) ?? {}) };
  // 20 per request was the old default; more per request saves free-tier quota.
  if (saved.questionsPerRequest === 20 && !saved.perRequestV) delete saved.questionsPerRequest;
  return { ...DEFAULT_SETTINGS, ...saved, perRequestV: 2 };
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
