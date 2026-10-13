import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db, requestPersistence } from '../db';
import { getBackupState, snoozeBackupReminder } from '../db/backup';
import { backupReminder, persistTip } from '../domain/backupReminder';
import { autoBackupNow, chooseBackupFile, downloadBackup, isAutoBackupSupported, lastChangeAt } from '../lib/autoBackup';
import { isInstalled, promptInstall, useCanInstall } from '../lib/pwa';
import { BackupButtons } from './BackupButtons';

/**
 * Dashboard nudge, one at a time. A broken automatic backup with unsaved changes comes first, since
 * the user thinks they are covered; then the regular reminder (a finished exam, three new sets, or a
 * week); then the tip to install the app when the browser may clear its data by itself.
 */
export function BackupReminderCard() {
  const data = useLiveQuery(
    async () => ({
      state: await getBackupState(),
      setCreatedAt: (await db.sets.toArray()).map((s) => s.createdAt),
      finishedAt: (await db.attempts.where('finishedAt').above(0).toArray()).filter((a) => a.result).map((a) => a.finishedAt!),
      changedAt: lastChangeAt(),
      now: Date.now(),
    }),
    [],
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (!data) return null;
  const { state, setCreatedAt, finishedAt, changedAt, now } = data;

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

  const r = backupReminder({ lastBackupAt: state.lastBackupAt, lastChangeAt: changedAt, snoozedUntil: state.snoozedUntil, setCreatedAt, finishedAt, now });
  if (!r) return <PersistTipCard hasData={setCreatedAt.length + finishedAt.length > 0} now={now} />;
  const title =
    r.reason === 'sets'
      ? `${r.newSets} set belum dicadangkan`
      : r.reason === 'attempts'
        ? r.newAttempts === 1
          ? 'Hasil latihan terbaru belum dicadangkan'
          : `${r.newAttempts} hasil latihan belum dicadangkan`
        : state.lastBackupAt
          ? `Cadangan terakhir ${r.days} hari lalu`
          : 'Data Anda belum pernah dicadangkan';
  return (
    <div className="strip">
      <div className="min-w-0 flex-1">
        <b>{title}.</b>{' '}
        <span>
          Set, bank soal, riwayat, dan Buku Kesalahan hanya tersimpan di browser ini dan bisa hilang bila data situs dibersihkan.
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
        <BackupButtons small />
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={act(() => snoozeBackupReminder())}>
          Nanti
        </button>
      </div>
    </div>
  );
}

const PERSIST_DISMISSED_KEY = 'persist-tip-dismissed-at';

/**
 * Shown when the browser says outright that it may clear this app's data by itself (no persistent
 * storage) and the app is not installed: installing it from the home screen is the fix that lasts.
 */
function PersistTipCard({ hasData, now }: { hasData: boolean; now: number }) {
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [dismissedAt, setDismissedAt] = useState(() => {
    try {
      return Number(localStorage.getItem(PERSIST_DISMISSED_KEY)) || undefined;
    } catch {
      return undefined;
    }
  });
  const canInstall = useCanInstall();
  useEffect(() => {
    void navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => setPersisted(null));
  }, []);

  if (!persistTip({ persisted, installed: isInstalled(), hasData, dismissedAt, now })) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(PERSIST_DISMISSED_KEY, String(Date.now()));
    } catch {
      /* storage blocked: hidden until the next visit */
    }
    setDismissedAt(Date.now());
  };
  return (
    <div className="strip">
      <div className="min-w-0 flex-1 basis-64">
        <b>Browser ini bisa menghapus data aplikasi sendiri.</b>{' '}
        <span>
          Agar set, riwayat, dan Buku Kesalahan lebih aman, pasang aplikasi ke layar utama dan tetap cadangkan secara berkala.{' '}
          {!canInstall && (
            <Link className="underline" to="/help?bagian=pasang">
              Cara memasang
            </Link>
          )}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {canInstall && (
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => {
              if (await promptInstall()) void requestPersistence().then(setPersisted);
            }}
          >
            Pasang aplikasi
          </button>
        )}
        <button className="btn btn-sm btn-ghost" onClick={dismiss}>
          Mengerti
        </button>
      </div>
    </div>
  );
}
