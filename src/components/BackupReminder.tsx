import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../db';
import { getBackupState, snoozeBackupReminder } from '../db/backup';
import { backupReminder } from '../domain/backupReminder';
import { autoBackupNow, chooseBackupFile, downloadBackup, isAutoBackupSupported, lastChangeAt } from '../lib/autoBackup';

/**
 * Dashboard nudge. A broken automatic backup with unsaved changes comes first, since the user
 * thinks they are covered; otherwise the regular reminder (a week, or three new sets).
 */
export function BackupReminderCard() {
  const data = useLiveQuery(
    async () => ({
      state: await getBackupState(),
      setCreatedAt: (await db.sets.toArray()).map((s) => s.createdAt),
      changedAt: lastChangeAt(),
      now: Date.now(),
    }),
    [],
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (!data) return null;
  const { state, setCreatedAt, changedAt, now } = data;

  const act = (fn: () => Promise<unknown>) => async () => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const err = state.auto?.error;
  const pending = changedAt !== undefined && changedAt > (state.lastBackupAt ?? 0);
  if (state.auto && err && pending) {
    const fix =
      err.kind === 'missing'
        ? { label: 'Pilih berkas lagi', run: chooseBackupFile }
        : { label: err.kind === 'permission' ? 'Izinkan lagi' : 'Coba lagi', run: () => autoBackupNow({ request: true }) };
    return (
      <div className="strip">
        <div className="min-w-0 flex-1">
          <b>Cadangan otomatis tertunda.</b> <span>{err.message}</span>
          {msg && <div className="mt-1 text-red-700 dark:text-red-300">{msg}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={act(fix.run)}>
            {fix.label}
          </button>
          <button className="btn btn-sm" disabled={busy} onClick={act(downloadBackup)}>
            Unduh manual
          </button>
        </div>
      </div>
    );
  }

  const r = backupReminder({ lastBackupAt: state.lastBackupAt, lastChangeAt: changedAt, snoozedUntil: state.snoozedUntil, setCreatedAt, now });
  if (!r) return null;
  const title = r.reason === 'sets' ? `${r.newSets} set belum dicadangkan` : state.lastBackupAt ? `Cadangan terakhir ${r.days} hari lalu` : 'Data Anda belum pernah dicadangkan';
  return (
    <div className="strip">
      <div className="min-w-0 flex-1">
        <b>{title}.</b>{' '}
        <span>
          Set, bank soal, dan riwayat hanya tersimpan di browser ini dan bisa hilang bila data situs dibersihkan.
          {isAutoBackupSupported() && !state.auto && (
            <>
              {' '}
              Bisa juga{' '}
              <Link className="underline" to="/settings">
                disimpan otomatis ke berkas
              </Link>
              .
            </>
          )}
        </span>
        {msg && <div className="mt-1 text-red-700 dark:text-red-300">{msg}</div>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={act(downloadBackup)}>
          Unduh cadangan
        </button>
        <button className="btn btn-sm" disabled={busy} onClick={act(() => snoozeBackupReminder())}>
          Nanti
        </button>
      </div>
    </div>
  );
}
