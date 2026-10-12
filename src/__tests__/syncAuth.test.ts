import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (event: string, session: { user: { id: string; email: string } } | null) => void;

/** A stand-in for supabase.auth: records calls, answers like Supabase. */
function fakeAuth() {
  const listeners: Listener[] = [];
  let session: { user: { id: string; email: string } } | null = null;
  const auth = {
    calls: [] as string[],
    otpError: null as unknown,
    verifyError: null as unknown,
    onAuthStateChange(fn: Listener) {
      listeners.push(fn);
      fn('INITIAL_SESSION', session);
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async getSession() {
      return { data: { session } };
    },
    async signInWithOtp(args: { email: string; options: { shouldCreateUser: boolean } }) {
      auth.calls.push(`otp ${args.email} create=${args.options.shouldCreateUser}`);
      return { error: auth.otpError };
    },
    async verifyOtp(args: { email: string; token: string; type: string }) {
      auth.calls.push(`verify ${args.email} ${args.token} ${args.type}`);
      if (auth.verifyError) return { data: { user: null }, error: auth.verifyError };
      session = { user: { id: 'u1', email: args.email } };
      listeners.forEach((l) => l('SIGNED_IN', session));
      return { data: { user: session.user }, error: null };
    },
    async signOut(args: { scope: string }) {
      auth.calls.push(`signOut ${args.scope}`);
      session = null;
      listeners.forEach((l) => l('SIGNED_OUT', null));
      return { error: null };
    },
  };
  return auth;
}

let auth: ReturnType<typeof fakeAuth>;

async function load({ configured = true } = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', configured ? 'https://sync.test' : '');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', configured ? 'sb_publishable_test' : '');
  auth = fakeAuth();
  vi.doMock('../sync/client', () => ({ getSupabase: async () => ({ auth }) }));
  return import('../sync/auth');
}

/** The app restarting: modules load again, the browser's storage and the Supabase session stay. */
async function restart() {
  vi.resetModules();
  return import('../sync/auth');
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.doUnmock('../sync/client');
});

describe('sign-in with an email code (#98)', () => {
  it('is unavailable in a build without Supabase settings', async () => {
    const m = await load({ configured: false });
    expect(m.getAccount()).toEqual({ status: 'unavailable' });
  });

  it('starts signed out without loading anything when this browser never signed in', async () => {
    const m = await load();
    expect(m.getAccount()).toEqual({ status: 'signed-out' });
  });

  it('sends a code that may create the account, then signs in with it', async () => {
    const m = await load();
    await m.sendCode('  Saya@Contoh.ID ');
    await m.verifyCode('saya@contoh.id', ' 123 456 ');
    expect(auth.calls).toEqual(['otp saya@contoh.id create=true', 'verify saya@contoh.id 123456 email']);
    expect(m.getAccount()).toEqual({ status: 'signed-in', userId: 'u1', email: 'saya@contoh.id' });
    expect(localStorage.getItem('casn-sync-signed-in')).toBe('1');
  });

  it('comes back signed in on the next start, and signs out of this browser only', async () => {
    let m = await load();
    await m.sendCode('a@b.co');
    await m.verifyCode('a@b.co', '111111');
    m = await restart();
    expect(m.getAccount()).toEqual({ status: 'loading' });
    await m.startAccount();
    expect(m.getAccount()).toMatchObject({ status: 'signed-in', email: 'a@b.co' });
    await m.signOut();
    expect(auth.calls.at(-1)).toBe('signOut local');
    expect(m.getAccount()).toEqual({ status: 'signed-out' });
    expect(localStorage.getItem('casn-sync-signed-in')).toBeNull();
  });

  it('forgets a sign-in whose session is gone', async () => {
    localStorage.setItem('casn-sync-signed-in', '1');
    const m = await load();
    expect(m.getAccount()).toEqual({ status: 'loading' });
    await m.startAccount();
    expect(m.getAccount()).toEqual({ status: 'signed-out' });
    expect(localStorage.getItem('casn-sync-signed-in')).toBeNull();
  });

  it('passes Supabase errors on and stays signed out', async () => {
    const m = await load();
    auth.otpError = { code: 'over_email_send_rate_limit', status: 429, message: 'rate' };
    await expect(m.sendCode('a@b.co')).rejects.toMatchObject({ code: 'over_email_send_rate_limit' });
    auth.verifyError = { code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' };
    await expect(m.verifyCode('a@b.co', '000000')).rejects.toMatchObject({ code: 'otp_expired' });
    expect(m.getAccount()).toEqual({ status: 'signed-out' });
  });
});

describe('sign-in input and messages', () => {
  it('checks email and code', async () => {
    const m = await load();
    expect(m.isEmail('saya@contoh.id')).toBe(true);
    expect(m.isEmail('saya@contoh')).toBe(false);
    expect(m.isEmail('saya contoh@x.id')).toBe(false);
    expect(m.isCode('123456')).toBe(true);
    expect(m.isCode('123 456')).toBe(true);
    expect(m.isCode('12345')).toBe(false);
    expect(m.isCode('12345a')).toBe(false);
  });

  it('turns Supabase errors into words a learner can act on', async () => {
    const { authErrorMessage: msg } = await load();
    expect(msg({ code: 'otp_expired' })).toMatch(/kedaluwarsa/);
    expect(msg({ code: 'over_email_send_rate_limit' })).toMatch(/Terlalu sering/);
    expect(msg({ status: 429 })).toMatch(/Terlalu sering/);
    expect(msg({ code: 'signup_disabled' })).toMatch(/Pendaftaran akun baru sedang ditutup/);
    expect(msg({ code: 'email_address_not_authorized' })).toMatch(/anggota tim/);
    expect(msg({ code: 'email_address_invalid' })).toBe('Alamat email tidak valid.');
    expect(msg({ name: 'AuthRetryableFetchError', status: 0 })).toMatch(/koneksi internet/);
    expect(msg({ status: 503, message: 'x' })).toMatch(/dijeda/);
    expect(msg({ message: 'aneh' })).toBe('Gagal: aneh');
  });
});
