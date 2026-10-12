import { useEffect, useState } from 'react';
import { authErrorMessage, isCode, isEmail, normalizeEmail, sendCode, signOut, startAccount, useAccount, verifyCode } from '../sync/auth';

const RESEND_SECONDS = 60;

/** Settings: sign in with an email code, see who is signed in, sign out (#98). */
export function SyncCard() {
  const account = useAccount();
  const loading = account.status === 'loading';
  // Only a browser that was signed in loads the library here; everyone else when they ask for a code.
  useEffect(() => {
    if (loading) void startAccount().catch(() => undefined);
  }, [loading]);

  if (account.status === 'unavailable') return null;
  if (account.status === 'loading') return <p className="muted text-sm">Memuat akun…</p>;
  if (account.status === 'signed-in') return <SignedIn email={account.email} />;
  return <SignInForm />;
}

function SignedIn({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-sm">
        Masuk sebagai <b>{email}</b>.
      </p>
      <p className="muted text-sm">
        Sinkronisasi otomatis sedang disiapkan dan akan aktif di pembaruan berikutnya. Sampai saat itu data Anda masih tersimpan di browser ini saja, jadi tetap unduh cadangan
        secara berkala.
      </p>
      <button
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await signOut();
        }}
      >
        Keluar
      </button>
    </div>
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
