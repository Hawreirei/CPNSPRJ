/** When to nudge the user to back up. Pure, so the rule is easy to test and tune. */

export const REMIND_AFTER_DAYS = 7;
export const REMIND_AFTER_NEW_SETS = 3;
export const SNOOZE_DAYS = 3;
const DAY = 86_400_000;

export interface BackupReminderInput {
  lastBackupAt?: number;
  /** Last change to backed-up data, when known. Nothing changed since the backup means no reminder. */
  lastChangeAt?: number;
  snoozedUntil?: number;
  /** Creation times of every set. */
  setCreatedAt: number[];
  now: number;
}

export interface BackupReminder {
  reason: 'days' | 'sets';
  /** Whole days since the last backup (or since the first set). */
  days: number;
  /** Sets made since the last backup. */
  newSets: number;
}

/**
 * Remind when the last backup is more than a week old or three sets have been made since.
 * Without any backup, the clock starts at the first set, so a brand-new user is not nagged.
 */
export function backupReminder({ lastBackupAt, lastChangeAt, snoozedUntil, setCreatedAt, now }: BackupReminderInput): BackupReminder | null {
  if (!setCreatedAt.length) return null;
  if (snoozedUntil && now < snoozedUntil) return null;
  if (lastBackupAt !== undefined && lastChangeAt !== undefined && lastChangeAt <= lastBackupAt) return null;
  const since = lastBackupAt ?? Math.min(...setCreatedAt);
  const newSets = lastBackupAt === undefined ? setCreatedAt.length : setCreatedAt.filter((t) => t > lastBackupAt).length;
  const days = Math.floor((now - since) / DAY);
  if (newSets >= REMIND_AFTER_NEW_SETS) return { reason: 'sets', days, newSets };
  if (days >= REMIND_AFTER_DAYS) return { reason: 'days', days, newSets };
  return null;
}

/** "baru saja", "5 menit lalu", "3 jam lalu", "kemarin", "4 hari lalu". */
export function fmtAgo(t: number, now: number): string {
  const s = Math.max(0, now - t) / 1000;
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < DAY / 1000) return `${Math.floor(s / 3600)} jam lalu`;
  const d = Math.floor(s / (DAY / 1000));
  return d === 1 ? 'kemarin' : `${d} hari lalu`;
}
