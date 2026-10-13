import type { SupabaseClient } from '@supabase/supabase-js';
import type { Counts, Cursor, PulledRow, SyncServer } from './engine';
import type { SyncTable } from './track';

/** The Supabase side of sync: sync_push / sync_pull in supabase/migrations, under RLS. */

export class SyncError extends Error {
  readonly status?: number;
  readonly code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'SyncError';
    this.status = status;
    this.code = code;
  }
}

function fail(error: { message: string; code?: string }, status: number): never {
  throw new SyncError(error.message, status, error.code);
}

interface PushedRow {
  applied_tbl: string;
  applied_id: string;
  applied_mtime: number;
}

interface ServerRow {
  tbl: SyncTable;
  id: string;
  data: unknown;
  deleted: boolean;
  mtime: number | string;
  updated_at: string;
}

export function supabaseServer(sb: SupabaseClient): SyncServer {
  return {
    async push(rows) {
      const { data, error, status } = await sb.rpc('sync_push', { rows });
      if (error) fail(error, status);
      return ((data ?? []) as PushedRow[]).map((r) => ({ tbl: r.applied_tbl, id: r.applied_id, mtime: Number(r.applied_mtime) }));
    },
    async pull(after: Cursor, max: number): Promise<PulledRow[]> {
      const { data, error, status } = await sb.rpc('sync_pull', { after_at: after.at, after_tbl: after.tbl, after_id: after.id, max_rows: max });
      if (error) fail(error, status);
      return ((data ?? []) as ServerRow[]).map((r) => ({ ...r, mtime: Number(r.mtime) }));
    },
    async counts(): Promise<Counts> {
      const count = async (tbl: SyncTable) => {
        const { count, error, status } = await sb.from('sync_rows').select('id', { count: 'exact', head: true }).eq('tbl', tbl).eq('deleted', false);
        if (error) fail(error, status);
        return count ?? 0;
      };
      const [sets, questions, attempts] = await Promise.all([count('sets'), count('questions'), count('attempts')]);
      return { sets, questions, attempts };
    },
  };
}

export interface SyncProblem {
  /** offline: waits for the connection and tries again by itself. error: needs attention or a later retry. */
  phase: 'offline' | 'error';
  message: string;
}

/** What went wrong with a sync round, in words a learner can act on. */
export function classifySyncError(err: unknown): SyncProblem {
  const e = (err ?? {}) as { status?: number; code?: string; message?: string; name?: string };
  const msg = e.message ?? String(err);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (offline || e.status === 0 || e.name === 'AuthRetryableFetchError' || /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg)) {
    return { phase: 'offline', message: 'Menunggu koneksi internet. Perubahan tersimpan di perangkat ini dan dikirim otomatis nanti.' };
  }
  if (e.status === 401 || e.code === 'PGRST301' || e.code === 'PGRST303' || /JWT/i.test(msg)) {
    return { phase: 'error', message: 'Sesi login sudah berakhir. Keluar, lalu masuk lagi dengan kode baru.' };
  }
  if (e.status && e.status >= 500) {
    return { phase: 'error', message: 'Server sinkronisasi sedang tidak aktif atau bermasalah. Data tetap aman di perangkat ini dan dikirim saat server pulih.' };
  }
  return { phase: 'error', message: `Gagal menyinkronkan: ${msg}` };
}
