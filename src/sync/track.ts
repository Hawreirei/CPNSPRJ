import type { DBCore, DBCoreKeyRange, DBCoreMutateRequest, DBCoreMutateResponse, DBCoreTable, DBCoreTransaction, Middleware, Transaction } from 'dexie';

/**
 * Change tracking for cloud sync (#96).
 *
 * Every write to a synced table also writes a stamp for that row to `syncStamps`, in the same
 * transaction: when the row changed (a client clock in ms that only goes up) and whether the server
 * has it yet. Deletes leave a stamp marked deleted, which is how a removal reaches other devices.
 * Nothing in the pages changes: this sits under Dexie, so every put, update, modify and delete is seen.
 *
 * The stamps live beside the data rather than in it, so the app's objects, backups and shared files
 * stay exactly as they were. Writes from the server (the pull, #100) write their own stamp afterwards
 * in the same transaction, which replaces the one written here.
 */

/** Local tables kept in the cloud, under the same names on the server (`sync_rows.tbl`). */
export const SYNC_TABLES = ['sets', 'questions', 'attempts', 'reviews', 'cards', 'meta'] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];
/** The only `meta` rows that are synced; the rest (device key, backup handle, logs) belong to this device. */
export const SYNC_META_KEYS: readonly string[] = ['settings', 'reviewDays'];
export const STAMPS = 'syncStamps';
export const STAMPS_SCHEMA = '[tbl+id], dirty';

export interface SyncStamp {
  tbl: SyncTable;
  id: string;
  /** Client time of the last change, in ms. Newer wins on the server and in merges. */
  mtime: number;
  /** 1 until the server has this version. IndexedDB cannot index booleans. */
  dirty: 0 | 1;
  /** 1 when the row was deleted here; pushed as a tombstone. */
  deleted: 0 | 1;
}

const isSyncTable = (name: string): name is SyncTable => (SYNC_TABLES as readonly string[]).includes(name);
export const isSynced = (tbl: string, id: unknown) => isSyncTable(tbl) && (tbl !== 'meta' || SYNC_META_KEYS.includes(String(id)));

let last = 0;
/**
 * A stamp later than both the clock and `after`: stamps never go backwards on this device, and a row's
 * new stamp always beats its previous one, so a clock set back cannot make the server ignore an edit.
 */
export function nextStamp(after = 0): number {
  last = Math.max(Date.now(), last + 1, after + 1);
  return last;
}

/** Stamp a key range's rows before they are deleted: a range carries no keys of its own. */
async function keysInRange(table: DBCoreTable, trans: DBCoreTransaction, range: DBCoreKeyRange): Promise<unknown[]> {
  const res = await table.query({ trans, query: { index: table.schema.primaryKey, range }, values: false });
  return res.result;
}

function writtenKeys(req: DBCoreMutateRequest, res: DBCoreMutateResponse, table: DBCoreTable): unknown[] {
  if (req.type === 'delete') return req.keys;
  if (req.type === 'deleteRange') return [];
  const keys = res.results ?? req.keys ?? req.values.map((v) => table.schema.primaryKey.extractKey?.(v));
  return keys.filter((_, i) => !res.failures[i]);
}

async function stamp(stamps: DBCoreTable, trans: DBCoreTransaction, tbl: SyncTable, keys: unknown[], deleted: boolean) {
  const ids = keys.filter((k) => k != null && isSynced(tbl, k)).map(String);
  if (!ids.length) return;
  const prev: (SyncStamp | undefined)[] = await stamps.getMany({ trans, keys: ids.map((id) => [tbl, id]) });
  const values: SyncStamp[] = ids.map((id, i) => ({ tbl, id, mtime: nextStamp(prev[i]?.mtime), dirty: 1, deleted: deleted ? 1 : 0 }));
  await stamps.mutate({ type: 'put', trans, values });
}

export const syncTracking: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'syncTracking',
  create: (down) => ({
    ...down,
    // Every read-write transaction on a synced table also opens the stamps, so a row and its stamp commit together.
    transaction(stores, mode, options) {
      const withStamps = mode === 'readwrite' && stores.some(isSyncTable) && !stores.includes(STAMPS) ? [...stores, STAMPS] : stores;
      return down.transaction(withStamps, mode, options);
    },
    table(name) {
      const table = down.table(name);
      if (!isSyncTable(name)) return table;
      return {
        ...table,
        async mutate(req) {
          const stamps = down.table(STAMPS);
          const ranged = req.type === 'deleteRange' ? await keysInRange(table, req.trans, req.range) : [];
          const res = await table.mutate(req);
          const deleted = req.type === 'delete' || req.type === 'deleteRange';
          await stamp(stamps, req.trans, name, req.type === 'deleteRange' ? ranged : writtenKeys(req, res, table), deleted);
          return res;
        },
      };
    },
  }),
};

/** When an existing row last changed, by its own fields; 1 (older than anything) when it does not say. */
function rowTime(tbl: SyncTable, row: Record<string, unknown>): number {
  const pick = (...f: string[]) => f.map((k) => row[k]).find((v): v is number => typeof v === 'number' && v > 0);
  switch (tbl) {
    case 'sets':
    case 'questions':
      return pick('updatedAt', 'createdAt') ?? 1;
    case 'attempts':
      return pick('finishedAt', 'startedAt') ?? 1;
    case 'reviews':
    case 'cards':
      return pick('lastReviewedAt', 'addedAt') ?? 1;
    default:
      return 1;
  }
}

/**
 * Dexie v5 upgrade: a stamp for every row already stored, so the first sign-in uploads it all. Each takes
 * the row's own last-change time, so when two devices with older data both sign in, the version that was
 * really changed last wins rather than whichever device upgraded last.
 */
export async function stampExisting(tx: Transaction): Promise<void> {
  const values: SyncStamp[] = [];
  for (const tbl of SYNC_TABLES) {
    const pk = tx.table(tbl).schema.primKey.keyPath as string;
    await tx
      .table(tbl)
      .toCollection()
      .each((row: Record<string, unknown>) => {
        const id = row[pk];
        if (isSynced(tbl, id)) values.push({ tbl, id: String(id), mtime: rowTime(tbl, row), dirty: 1, deleted: 0 });
      });
  }
  await tx.table(STAMPS).bulkPut(values);
}
