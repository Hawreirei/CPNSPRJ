import type { SupabaseClient } from '@supabase/supabase-js';
import { SYNC_CONFIG, syncAvailable } from './config';

let client: Promise<SupabaseClient> | undefined;

/**
 * The Supabase client, loaded on first use (#97): the library stays out of the startup bundle, and
 * nothing is downloaded or contacted for learners who never sign in.
 */
export function getSupabase(): Promise<SupabaseClient> {
  if (!syncAvailable()) return Promise.reject(new Error('Sinkronisasi cloud tidak tersedia di versi ini.'));
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SYNC_CONFIG.url, SYNC_CONFIG.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Sign-in is by a typed code, never by a link, and the hash belongs to the router.
        detectSessionInUrl: false,
        storageKey: 'casn-sync-auth',
      },
    }),
  );
  return client;
}
