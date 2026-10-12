import { useSyncExternalStore } from 'react';
import { getSupabase } from './client';
import { rememberSignedIn, syncAvailable, wasSignedIn } from './config';

/**
 * Sign-in by email with a 6-digit code (#98). The code is typed into the app rather than a link
 * clicked in the mail: a link often opens another browser, whose storage is not the app's, which is
 * the very problem sync is meant to fix.
 */

export type Account =
  /** This build has no sync (fork, local build). */
  | { status: 'unavailable' }
  /** Not signed in. The library is not loaded until the learner opens the sign-in form. */
  | { status: 'signed-out' }
  | { status: 'loading' }
  | { status: 'signed-in'; userId: string; email: string };

let account: Account = !syncAvailable() ? { status: 'unavailable' } : wasSignedIn() ? { status: 'loading' } : { status: 'signed-out' };
const listeners = new Set<() => void>();

function set(next: Account) {
  account = next;
  listeners.forEach((l) => l());
}

export const getAccount = () => account;

export function useAccount(): Account {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => account,
  );
}

let started: Promise<void> | undefined;

/**
 * Load the library and the saved session, and follow sign-in changes from then on. Called at start-up
 * when this browser was signed in, and when the sign-in form opens.
 */
export function startAccount(): Promise<void> {
  if (!syncAvailable()) return Promise.resolve();
  started ??= (async () => {
    const sb = await getSupabase();
    sb.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      rememberSignedIn(!!user);
      set(user ? { status: 'signed-in', userId: user.id, email: user.email ?? '' } : { status: 'signed-out' });
    });
    // onAuthStateChange reports the stored session too; this covers a missing one without waiting for it.
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      rememberSignedIn(false);
      set({ status: 'signed-out' });
    }
  })().catch((e: unknown) => {
    started = undefined;
    // Could not load the library (offline on first use): a signed-in learner stays signed in locally.
    if (account.status === 'loading' && !wasSignedIn()) set({ status: 'signed-out' });
    throw e;
  });
  return started;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const isEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
/** Supabase codes are 6 digits by default and at most 10; spaces from copying are ignored. */
export const cleanCode = (code: string) => code.replace(/\s+/g, '');
export const isCode = (code: string) => /^\d{6,10}$/.test(cleanCode(code));

export async function sendCode(email: string): Promise<void> {
  await startAccount();
  const sb = await getSupabase();
  const { error } = await sb.auth.signInWithOtp({ email: normalizeEmail(email), options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyCode(email: string, code: string): Promise<void> {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.verifyOtp({ email: normalizeEmail(email), token: cleanCode(code), type: 'email' });
  if (error) throw error;
  const user = data.user;
  if (user) {
    rememberSignedIn(true);
    set({ status: 'signed-in', userId: user.id, email: user.email ?? normalizeEmail(email) });
  }
}

/** Sign out of this browser only; other devices stay signed in. Local data is kept (#103 adds the choice to remove it). */
export async function signOut(): Promise<void> {
  const sb = await getSupabase();
  // A failed call (offline) still clears the session here; the server session then simply expires.
  await sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
  rememberSignedIn(false);
  set({ status: 'signed-out' });
}

/** What went wrong, in words a learner can act on. */
export function authErrorMessage(err: unknown): string {
  const e = (err ?? {}) as { code?: string; status?: number; name?: string; message?: string };
  switch (e.code) {
    case 'otp_expired':
      return 'Kode salah atau sudah kedaluwarsa. Periksa lagi, atau minta kode baru.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Terlalu sering meminta kode. Tunggu beberapa menit, lalu coba lagi.';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'Alamat email tidak valid.';
    case 'signup_disabled':
      return 'Pendaftaran akun baru sedang ditutup. Masuk dengan email yang sudah terdaftar.';
    case 'email_address_not_authorized':
      return 'Server belum bisa mengirim kode ke email ini. Untuk sementara hanya email yang terdaftar sebagai anggota tim project Supabase yang bisa masuk.';
    case 'email_provider_disabled':
    case 'otp_disabled':
      return 'Login dengan email belum diaktifkan di server.';
    case 'user_banned':
      return 'Akun ini diblokir.';
  }
  if (e.status === 429) return 'Terlalu sering meminta kode. Tunggu beberapa menit, lalu coba lagi.';
  if (e.name === 'AuthRetryableFetchError' || e.status === 0 || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return 'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.';
  }
  if (e.status && e.status >= 500) return 'Server sedang bermasalah atau dijeda. Coba lagi beberapa saat lagi.';
  return `Gagal: ${e.message || String(err)}`;
}
