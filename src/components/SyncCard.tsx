import { useEffect, useState } from 'react';
import { fmtAgo } from '../domain/backupReminder';
import { errorText } from '../engine/storage';
import { startSync } from '../sync';
import { authErrorMessage, isCode, isEmail, normalizeEmail, sendCode, signOut, startAccount, useAccount, verifyCode } from '../sync/auth';
import type { Counts } from '../sync/engine';
import { confirmAttach, downloadSnapshot, kick, removeLocalData, useSyncStatus, type SyncStatus } from '../sync/runner';

const RESEND_SECONDS = 60;

/** Settings: sign in with an email code, see whether the data is in the cloud, sign out (#98, #101–#103). */
export function SyncCard() {
  const account = useAccount();
  const loading = account.status === 'loading';
  // Wiring sync up loads nothing. Only a browser that was signed in loads the library here; everyone else when they ask for a code.
  useEffect(() => {
    startSync();
    if (loading) void startAccount().catch(() => undefined);
  }, [loading]);

  if (account.status === 'unavailable') return null;
  if (account.status === 'loading') return <p className="muted text-sm">Memuat akun…</p>;
  if (account.status === 'signed-in') return <SignedIn email={account.email} />;
  return <SignInForm />;
}

/** The time, refreshed every half minute, so "Tersinkron 2 menit lalu" stays true while the page is open. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const countsText = (c: Counts) => `${c.sets} set, ${c.questions} soal, ${c.attempts} latihan`;

function SignedIn({ email }: { email: string }) {
  const s = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const now = useNow();

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setMsg(`Gagal: ${errorText(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Masuk sebagai <b>{email}</b>.
      </p>

      {s.phase === 'confirm' && s.confirm ? (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          {s.confirm.kind === 'merge' ? (
            <p>
              Perangkat ini sudah berisi <b>{countsText(s.confirm.local)}</b>. Akun Anda di cloud berisi <b>{s.confirm.remote ? countsText(s.confirm.remote) : '…'}</b>. Keduanya
              akan digabung; tidak ada data yang dihapus.
            </p>
          ) : (
            <p>
              Data di perangkat ini (<b>{countsText(s.confirm.local)}</b>) berasal dari akun lain yang pernah masuk di sini. Gabungkan ke akun <b>{email}</b>? Bila tidak, keluar
              saja; data di perangkat ini tetap ada.
            </p>
          )}
          <p className="muted">Sebelum digabung, aplikasi menyimpan cadangan data perangkat ini yang bisa diunduh dari kartu ini.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busy} onClick={() => void act(confirmAttach)}>
              {s.confirm.kind === 'merge' ? 'Gabungkan dan sinkronkan' : 'Gabungkan ke akun ini'}
            </button>
            <button className="btn" disabled={busy} onClick={() => void act(signOut)}>
              Keluar
            </button>
          </div>
        </div>
      ) : (
        <SyncState status={s} now={now} />
      )}

      {s.tooLarge.length > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {s.tooLarge.length} data terlalu besar untuk diunggah (biasanya soal dengan gambar sangat besar) dan hanya tersimpan di perangkat ini. Unduh cadangan agar tidak hilang.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {s.phase !== 'confirm' && (
          <button className="btn" disabled={busy || s.phase === 'syncing' || s.phase === 'starting'} onClick={() => kick()}>
            Sinkronkan sekarang
          </button>
        )}
        {s.snapshotAt && (
          <button className="btn btn-ghost" disabled={busy} onClick={() => void act(downloadSnapshot)}>
            Unduh cadangan sebelum sinkronisasi pertama ({new Date(s.snapshotAt).toLocaleDateString('id-ID')})
          </button>
        )}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Keluar dari akun</summary>
        <div className="mt-2 space-y-2">
          <p className="muted">
            Keluar hanya berlaku di browser ini. Perangkat lain tetap masuk, dan data di cloud tidak terhapus. Setelah keluar, perubahan di sini tidak lagi dikirim ke cloud.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={busy} onClick={() => void act(signOut)}>
              Keluar, data tetap di perangkat ini
            </button>
            <button
              className="btn btn-danger"
              disabled={busy || s.pending > 0 || s.phase === 'confirm' || s.phase === 'syncing'}
              onClick={() =>
                void act(async () => {
                  if (!confirm('Hapus set, bank soal, riwayat, dan pengaturan dari browser ini, lalu keluar? Data di cloud tetap ada. API key tidak dihapus.')) return;
                  await removeLocalData();
                  await signOut();
                })
              }
            >
              Keluar dan hapus data dari perangkat ini
            </button>
          </div>
          {s.pending > 0 && <p className="muted">Masih ada {s.pending} perubahan yang belum terkirim. Hapus data dari perangkat ini baru bisa setelah semuanya tersinkron.</p>}
        </div>
      </details>
      {msg && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {msg}
        </p>
      )}
    </div>
  );
}

function SyncState({ status: s, now }: { status: SyncStatus; now: number }) {
  const waiting = s.pending > 0 ? ` ${s.pending} perubahan menunggu dikirim.` : '';
  if (s.phase === 'starting' || s.phase === 'syncing')
    return (
      <p className="text-sm" role="status">
        Menyinkronkan…
      </p>
    );
  if (s.phase === 'offline' || s.phase === 'error') {
    return (
      <p role="alert" className={`text-sm ${s.phase === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-300'}`}>
        {s.error}
        {waiting}
      </p>
    );
  }
  return (
    <p className="text-sm" role="status">
      {s.lastSyncAt ? `Tersinkron ${fmtAgo(s.lastSyncAt, now)}.` : 'Belum pernah tersinkron.'}
      {waiting}
    </p>
  );
}

function SignInForm() {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const send = (to: string) =>
    run(async () => {
      await sendCode(to);
      setSentTo(normalizeEmail(to));
      setCode('');
      setWait(RESEND_SECONDS);
    });

  return (
    <div className="space-y-3">
      <p className="muted text-sm">
        Data Anda saat ini hanya tersimpan di browser ini dan bisa hilang bila browser membersihkan data situs. Masuk dengan email agar set, bank soal, dan riwayat latihan
        tersimpan juga di cloud. API key tidak pernah diunggah.
      </p>
      {!sentTo ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isEmail(email)) return setError('Alamat email tidak valid.');
            void send(email);
          }}
        >
          <label className="label" htmlFor="sync-email">
            Email
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="sync-email"
              className="input max-w-xs"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
            <button className="btn btn-primary" type="submit" disabled={busy || !email.trim()}>
              Kirim kode
            </button>
          </div>
        </form>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isCode(code)) return setError('Kode terdiri dari 6 angka.');
            void run(() => verifyCode(sentTo, code));
          }}
        >
          <p className="text-sm" role="status">
            Kode sudah dikirim ke <b>{sentTo}</b>. Periksa juga folder spam. Kode berlaku 10 menit.
          </p>
          <label className="label" htmlFor="sync-code">
            Kode dari email
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="sync-code"
              className="input w-40 tracking-widest"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
            />
            <button className="btn btn-primary" type="submit" disabled={busy || !code.trim()}>
              Masuk
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm" type="button" disabled={busy || wait > 0} onClick={() => void send(sentTo)}>
              {wait > 0 ? `Kirim ulang (${wait} dtk)` : 'Kirim ulang kode'}
            </button>
            <button
              className="btn btn-sm btn-ghost"
              type="button"
              disabled={busy}
              onClick={() => {
                setSentTo(null);
                setError('');
              }}
            >
              Ganti email
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
