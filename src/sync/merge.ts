import type { SyncStamp, SyncTable } from './track';

/**
 * How a row from the server meets the row here (#100). Pure, so every rule is unit-tested.
 *
 * The general rule is "the newer change wins", by the client stamps (`mtime`). A few kinds of data must
 * never lose information whichever side is newer, and are merged instead:
 * - a finished exam or practice is never replaced by an unfinished copy of it;
 * - the days a learner studied (`meta: reviewDays`) are the union of both sides;
 * - notes kept on a question are the union of both sides;
 * - `settings.lastSeenVersion` (which "Apa yang baru" this device has seen) stays this device's own.
 */

export interface RemoteRow {
  tbl: SyncTable;
  id: string;
  data: unknown;
  deleted: boolean;
  mtime: number;
}

export interface LocalRow {
  stamp?: SyncStamp;
  /** The row as stored here; undefined when absent or deleted. */
  row?: Record<string, unknown>;
}

export type Decision =
  /** This device's version stays as it is. */
  | { kind: 'keep' }
  /** The server's version replaces this one (or deletes it, for a tombstone). */
  | { kind: 'take' }
  /** Write `data`. `push`: the result differs from the server's, so it is sent back with a newer stamp. */
  | { kind: 'merge'; data: Record<string, unknown>; push: boolean };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
/** JSON with object keys sorted, so equal content compares equal whatever order it was built in. */
const canonical = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(',')}]`
    : isRec(v)
      ? `{${Object.keys(v)
          .filter((k) => v[k] !== undefined)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
          .join(',')}}`
      : (JSON.stringify(v) ?? 'null');
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

function unionDays(a: unknown, b: unknown): string[] {
  const days = [a, b].flatMap((v) => (Array.isArray(v) ? v : [])).filter((d): d is string => typeof d === 'string');
  return [...new Set(days)].sort();
}

interface Note {
  text: string;
  at: number;
}
function unionNotes(a: unknown, b: unknown): Note[] {
  const all = [a, b].flatMap((v) => (Array.isArray(v) ? v : [])).filter((n): n is Note => isRec(n) && typeof n.text === 'string' && typeof n.at === 'number');
  const seen = new Map(all.map((n) => [`${n.at}|${n.text}`, n]));
  return [...seen.values()].sort((x, y) => x.at - y.at);
}

/**
 * The fields that are merged rather than replaced, applied on top of `base` (the winner) with what the
 * other side has. Returns `base` itself when nothing needs merging.
 */
function mergeFields(tbl: SyncTable, id: string, base: Rec, other: Rec | undefined, local: Rec | undefined): Rec {
  if (tbl === 'meta' && id === 'reviewDays') {
    const value = unionDays(base.value, other?.value);
    return same(value, base.value) ? base : { ...base, value };
  }
  if (tbl === 'meta' && id === 'settings' && isRec(base.value)) {
    // Only this device's own copy says which release notes it has closed.
    const mine = isRec(local?.value) ? local.value.lastSeenVersion : undefined;
    const { lastSeenVersion: _theirs, ...rest } = base.value;
    const value = mine === undefined ? rest : { ...rest, lastSeenVersion: mine };
    return same(value, base.value) ? base : { ...base, value };
  }
  if (tbl === 'questions' && (base.notes !== undefined || other?.notes !== undefined)) {
    const notes = unionNotes(base.notes, other?.notes);
    if (same(notes, base.notes ?? [])) return base;
    return { ...base, notes };
  }
  return base;
}

/** Fields that only exist on this device and are left out when comparing what the server has. */
const forServer = (tbl: SyncTable, id: string, row: Rec): Rec => {
  if (tbl !== 'meta' || id !== 'settings' || !isRec(row.value)) return row;
  const { lastSeenVersion: _own, ...value } = row.value;
  return { ...row, value };
};

export function decide(local: LocalRow, remote: RemoteRow): Decision {
  const { tbl, id } = remote;
  const mine = local.stamp && !local.stamp.deleted ? local.row : undefined;
  const theirs = !remote.deleted && isRec(remote.data) ? remote.data : undefined;
  const newer = !local.stamp || remote.mtime > local.stamp.mtime;

  // A finished attempt stays finished, whichever copy is newer: an exam left open on another device keeps
  // ticking (time spent, current question) after the result was saved here or there.
  if (tbl === 'attempts' && mine && theirs && !!mine.finishedAt !== !!theirs.finishedAt) {
    if (theirs.finishedAt) return { kind: 'take' };
    return newer ? { kind: 'merge', data: mine, push: true } : { kind: 'keep' };
  }

  if (!newer) {
    // Ours is the same version or newer; it is (or was) sent up. Fields that must not lose anything
    // still take in what only the server has.
    if (!mine || !theirs) return { kind: 'keep' };
    const merged = mergeFields(tbl, id, mine, theirs, mine);
    return merged === mine ? { kind: 'keep' } : { kind: 'merge', data: merged, push: true };
  }

  if (!theirs) return { kind: 'take' };

  const merged = mergeFields(tbl, id, theirs, mine, mine);
  if (merged === theirs) return { kind: 'take' };
  // Settings differ only in this device's lastSeenVersion: nothing to send back.
  return { kind: 'merge', data: merged, push: !same(forServer(tbl, id, merged), forServer(tbl, id, theirs)) };
}

/** The row as sent to the server: without this device's own fields. */
export function toServer(tbl: SyncTable, id: string, row: Record<string, unknown>): Record<string, unknown> {
  return forServer(tbl, id, row);
}
