import { useState } from 'react';
import { requestPersistence } from '../db';
import { canShareBackup, downloadBackup, shareBackup } from '../lib/autoBackup';

/**
 * "Unduh cadangan", and on phones "Kirim cadangan ke…" (Drive, WhatsApp, email) through the share
 * sheet: a backup sent to another app survives the phone's browser clearing its data. Each also asks
 * the browser again to keep this app's data, which it may now grant (the learner is clearly using it).
 */
export function BackupButtons({ small = false }: { small?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const size = small ? ' btn-sm' : '';

  const act = (fn: () => Promise<unknown>) => async () => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
      void requestPersistence();
    } catch (e) {
      setMsg(`Gagal: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className={`btn btn-primary${size}`} disabled={busy} onClick={act(downloadBackup)}>
        Unduh cadangan
      </button>
      {canShareBackup() && (
        <button className={`btn${size}`} disabled={busy} onClick={act(shareBackup)}>
          Kirim cadangan ke…
        </button>
      )}
      {msg && (
        <p role="alert" className="w-full text-sm text-red-700 dark:text-red-300">
          {msg}
        </p>
      )}
    </>
  );
}
