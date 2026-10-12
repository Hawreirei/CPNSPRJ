/**
 * Where cloud sync connects (#97). Set at build time by the Pages workflow; a build without them
 * (a fork, `npm run dev`, the e2e build) has no sync at all and never contacts Supabase.
 */
export const SYNC_CONFIG = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() ?? '',
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '',
};

export const syncAvailable = () => !!(SYNC_CONFIG.url && SYNC_CONFIG.key);

/**
 * Set once this browser signed in, cleared on sign-out. Lets start-up skip loading the Supabase
 * library for everyone who never used sync, while a signed-in learner gets their session back.
 */
const SIGNED_IN_KEY = 'casn-sync-signed-in';

export function wasSignedIn(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberSignedIn(on: boolean) {
  try {
    if (on) localStorage.setItem(SIGNED_IN_KEY, '1');
    else localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    /* storage blocked: start-up just loads the library when sync is opened */
  }
}
