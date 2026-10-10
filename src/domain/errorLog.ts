/**
 * Local error log: what is kept, and how it is cleaned before it is kept. Pure; storage and the
 * global handlers live in lib/errorLog.ts. Nothing here is ever sent anywhere: the learner
 * downloads the log and decides whether to share it.
 *
 * Kept: when, where in the app (page path only), error name, a short cleaned message and stack
 * frames. Never kept: API keys or tokens, question or passage text, prompts, link data.
 */

export const MAX_ENTRIES = 200;
export const MAX_MESSAGE = 300;
const MAX_FRAMES = 8;
/** Quoted text longer than this is treated as content (a stem, a prompt) and dropped. */
const MAX_QUOTED = 30;

export type ErrorSource = 'error' | 'unhandledrejection' | 'generation' | 'import' | 'tutor';

export interface ErrorEntry {
  at: number;
  source: ErrorSource;
  name: string;
  message: string;
  stack?: string;
  /** Hash route without its query, e.g. "#/sets/abc". */
  page: string;
}

const SECRET_PATTERNS: [RegExp, string][] = [
  // Google (Gemini) keys, OpenAI / Anthropic / OpenRouter style keys.
  [/AIza[0-9A-Za-z_-]{20,}/g, '[key]'],
  [/\bsk-[A-Za-z0-9_-]{12,}/g, '[key]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [key]'],
  // Keys and tokens passed in a URL or a header-like "name: value".
  [/([?&#](?:key|api[_-]?key|token|access_token|d)=)[^&\s"']+/gi, '$1[disembunyikan]'],
  [/((?:x-goog-api-key|x-api-key|authorization)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[key]'],
  // Any other long unbroken token: unknown providers' keys, encoded share links.
  [/[A-Za-z0-9_+/=-]{32,}/g, '[token]'],
];

/** Remove secrets and content from free text, then shorten it. */
export function scrub(text: string, max = MAX_MESSAGE): string {
  let s = text;
  for (const [re, to] of SECRET_PATTERNS) s = s.replace(re, to);
  // Quoted text is where questions, passages and prompts turn up in messages.
  s = s.replace(/"([^"\n]*)"|'([^'\n]*)'|“([^”\n]*)”/g, (m, a, b, c) => ((a ?? b ?? c ?? '').length > MAX_QUOTED ? '"[teks]"' : m));
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Stack frames only (function and file position), without query strings, at most a few. */
export function scrubStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const frames = stack
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^at\s/.test(l) || /@.*:\d+:\d+$/.test(l))
    .slice(0, MAX_FRAMES)
    .map((l) => scrub(l.replace(/\?[^:)\s]*/g, ''), 200));
  return frames.length ? frames.join('\n') : undefined;
}

/** "#/import?d=…" → "#/import". */
export const pageOf = (hash: string) => hash.split('?')[0] || '#/';

export function toEntry(source: ErrorSource, err: unknown, at: number, hash: string): ErrorEntry {
  const e = err instanceof Error ? err : undefined;
  const raw = e
    ? e.message
    : typeof err === 'string'
      ? err
      : (() => {
          try {
            return JSON.stringify(err) ?? String(err);
          } catch {
            return String(err);
          }
        })();
  return {
    at,
    source,
    name: e?.name ?? typeof err,
    message: scrub(raw),
    ...(e?.stack && { stack: scrubStack(e.stack) }),
    page: pageOf(hash),
  };
}

/** The log with `entry` added, keeping the latest MAX_ENTRIES. */
export const appendEntry = (log: readonly ErrorEntry[], entry: ErrorEntry) => [...log, entry].slice(-MAX_ENTRIES);

const SOURCE_LABEL: Record<ErrorSource, string> = {
  error: 'galat halaman',
  unhandledrejection: 'galat tak tertangani',
  generation: 'pembuatan soal',
  import: 'impor',
  tutor: 'Tanya AI',
};

/** The downloadable text: app version, browser, then each entry. */
export function logText(entries: readonly ErrorEntry[], env: { version: string; buildTime: string; userAgent: string; now: number }): string {
  const head = [
    'Log galat CASN Set Builder',
    `Dibuat: ${new Date(env.now).toISOString()}`,
    `Versi aplikasi: ${env.version}, dibuat ${env.buildTime}`,
    `Browser: ${env.userAgent}`,
    `Jumlah entri: ${entries.length}`,
    'Berkas ini hanya ada di perangkat Anda. Isinya sudah disaring: tanpa API key, isi soal, atau prompt.',
    '',
  ];
  const body = entries.map((e) =>
    [`[${new Date(e.at).toISOString()}] ${SOURCE_LABEL[e.source]} · ${e.page}`, `${e.name}: ${e.message}`, ...(e.stack ? [e.stack.replace(/^/gm, '    ')] : []), ''].join('\n'),
  );
  return [...head, ...body].join('\n');
}
