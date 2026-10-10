import { db } from '../db';
import { newerVersion } from '../domain/whatsNew';
import type { Settings } from '../domain/types';

/** Any of the learner's own data. Settings alone do not count: they hold defaults until changed. */
export async function hasLearnerData(): Promise<boolean> {
  const counts = await Promise.all([db.sets.count(), db.questions.count(), db.attempts.count(), db.keys.count(), db.reviews.count(), db.cards.count()]);
  return counts.some((n) => n > 0);
}

/**
 * Record `version` as seen, keeping a newer one already there. Only this field is written, so a
 * learner who never changed a setting keeps following the defaults.
 */
export function markVersionSeen(version: string): Promise<void> {
  return db.transaction('rw', db.meta, async () => {
    const cur = ((await db.meta.get('settings'))?.value as Partial<Settings> | undefined) ?? {};
    const next = newerVersion(cur.lastSeenVersion, version);
    if (next !== cur.lastSeenVersion) await db.meta.put({ key: 'settings', value: { ...cur, lastSeenVersion: next } });
  });
}

/**
 * At start-up: a learner without data starts at the running version, since the whole app is new
 * to them rather than a list of changes. Runs before they can add anything.
 */
export async function noteFirstVersion(): Promise<void> {
  try {
    const seen = ((await db.meta.get('settings'))?.value as Partial<Settings> | undefined)?.lastSeenVersion;
    if (seen === undefined && !(await hasLearnerData())) await markVersionSeen(__APP_RELEASE__);
  } catch {
    // Storage unavailable: nothing to record.
  }
}
