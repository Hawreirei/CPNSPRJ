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
  /** When each finished exam or practice ended. */
  finishedAt?: number[];
  now: number;
}

export interface BackupReminder {
  /** sets: three new sets; attempts: an exam or practice finished since; days: a week went by. */
  reason: 'days' | 'sets' | 'attempts';
  /** Whole days since the last backup (or since the first set). */
  days: number;
  /** Sets made since the last backup. */
  newSets: number;
  /** Exams and practices finished since the last backup. */
  newAttempts: number;
}

/**
 * Remind when three sets were made or an exam or practice was finished since the last backup, or when
 * the backup is more than a week old. A finished exam is the learner's progress, which is what a lost
 * browser takes with it, so it counts at once. Without any backup, the week starts at the first set,
 * so a brand-new user is not nagged. "Nanti" quiets the reminder for a few days, unless another exam
 * is finished meanwhile.
 */
export function backupReminder({ lastBackupAt, lastChangeAt, snoozedUntil, setCreatedAt, finishedAt = [], now }: BackupReminderInput): BackupReminder | null {
  if (!setCreatedAt.length && !finishedAt.length) return null;
  if (lastBackupAt !== undefined && lastChangeAt !== undefined && lastChangeAt <= lastBackupAt) return null;
  const after = (t: number) => lastBackupAt === undefined || t > lastBackupAt;
  const newSets = setCreatedAt.filter(after).length;
  const newAttempts = finishedAt.filter(after).length;
  if (snoozedUntil && now < snoozedUntil) {
    const snoozedAt = snoozedUntil - SNOOZE_DAYS * DAY;
    if (!finishedAt.some((t) => after(t) && t > snoozedAt)) return null;
  }
  const since = lastBackupAt ?? Math.min(...setCreatedAt, ...finishedAt);
  const days = Math.floor((now - since) / DAY);
  if (newSets >= REMIND_AFTER_NEW_SETS) return { reason: 'sets', days, newSets, newAttempts };
  if (newAttempts > 0) return { reason: 'attempts', days, newSets, newAttempts };
  if (days >= REMIND_AFTER_DAYS) return { reason: 'days', days, newSets, newAttempts };
  return null;
}

/** "Mengerti" on the storage tip hides it this long; the risk does not go away, so it comes back. */
export const PERSIST_TIP_HIDE_DAYS = 30;

export interface PersistTipInput {
  /** navigator.storage.persisted(); null when the browser does not say. */
  persisted: boolean | null;
  /** Opened as an installed app (home screen), which browsers keep longer. */
  installed: boolean;
  /** Sets or finished attempts exist: something to lose. */
  hasData: boolean;
  dismissedAt?: number;
  now: number;
}

/**
 * Whether to tell the learner that this browser may clear the app's data by itself. Only when the
 * browser says so outright (persisted is false), there is data to lose, and the app is not installed.
 */
export function persistTip({ persisted, installed, hasData, dismissedAt, now }: PersistTipInput): boolean {
  if (persisted !== false || installed || !hasData) return false;
  return dismissedAt === undefined || now - dismissedAt >= PERSIST_TIP_HIDE_DAYS * DAY;
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
