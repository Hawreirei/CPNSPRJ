/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

/** package.json's version, e.g. "1.0.0". */
declare const __APP_RELEASE__: string;
/** Version and commit, e.g. "1.0.0 (7a73b52)": shown in the menu, Pengaturan and the error log. */
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  /** Supabase project URL for cloud sync (#97); unset in forks and local builds, which then hide sync. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase publishable key: public by design, rows are guarded by RLS. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
