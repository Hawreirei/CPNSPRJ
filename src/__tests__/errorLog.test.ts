import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { appendEntry, logText, MAX_ENTRIES, MAX_MESSAGE, pageOf, scrub, scrubStack, toEntry, type ErrorEntry } from '../domain/errorLog';
import { logError } from '../lib/errorLog';

const GEMINI = 'AIzaSyD3f4KeyKeyKeyKeyKeyKeyKeyKeyKey12';
const OPENAI = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';
const ANTHROPIC = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz';
const STEM = 'Pancasila sebagai dasar negara dirumuskan dalam sidang BPUPKI yang pertama pada tanggal';

describe('scrub', () => {
  it('removes API keys of every provider, bearer tokens and keys in URLs or headers', () => {
    const out = scrub(
      `fetch failed: https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key=${GEMINI}&alt=sse ` +
        `Authorization: Bearer ${OPENAI} x-api-key: ${ANTHROPIC} plain ${GEMINI} ${OPENAI}`,
      2000,
    );
    for (const secret of [GEMINI, OPENAI, ANTHROPIC, 'AIzaSy', 'sk-proj', 'sk-ant']) expect(out).not.toContain(secret);
    expect(out).toContain('?key=[disembunyikan]');
    expect(out).toContain('Authorization: [key]');
    expect(scrub(`token Bearer ${'abc.def-ghi'}`)).toBe('token Bearer [key]');
  });

  it('drops long unbroken tokens, such as an unknown provider’s key or a share link’s data', () => {
    const out = scrub('Gagal membaca #/import?d=H4sIAAAAAAAAA6tWKkktLlGyUlAqzi8tSk1RMsrMS8lMAABCbtb1GgAAAA tautan', 2000);
    expect(out).not.toContain('H4sIAAAA');
    expect(scrub('key 0123456789abcdef0123456789abcdef0123')).toBe('key [token]');
  });

  it('drops quoted question text and prompts, and keeps short quoted words', () => {
    const out = scrub(`Tidak valid: stem "${STEM}" dan prompt 'Buat 10 soal TWK tentang Pancasila dengan pembahasan lengkap' ditolak "TWK"`);
    expect(out).not.toContain('Pancasila');
    expect(out).not.toContain('Buat 10 soal');
    expect(out).toContain('"[teks]"');
    expect(out).toContain('"TWK"');
  });

  it('shortens long messages', () => {
    const out = scrub('kata '.repeat(200));
    expect(out.length).toBe(MAX_MESSAGE);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('entries', () => {
  it('keeps the error name, a clean message, stack frames without queries, and the page without its query', () => {
    const e = new TypeError(`Cannot read "${STEM}" with ${GEMINI}`);
    e.stack = [
      `TypeError: Cannot read "${STEM}"`,
      '    at parse (http://localhost/assets/index-abc.js?key=secret123:1:200)',
      '    at http://localhost/assets/shared-xyz.js:2:30',
      'some junk line',
    ].join('\n');
    const entry = toEntry('generation', e, 1000, `#/import?d=${'x'.repeat(50)}`);
    expect(entry).toMatchObject({ at: 1000, source: 'generation', name: 'TypeError', page: '#/import' });
    expect(JSON.stringify(entry)).not.toMatch(/Pancasila|AIza|secret123|xxxxxxxx/);
    expect(entry.stack?.split('\n')).toHaveLength(2);
    expect(entry.stack).toContain('at parse (http://localhost/assets/index-abc.js:1:200)');
  });

  it('handles rejections with non-Error reasons', () => {
    expect(toEntry('unhandledrejection', 'gagal', 1, '#/').message).toBe('gagal');
    expect(toEntry('unhandledrejection', { code: 5 }, 1, '#/')).toMatchObject({ name: 'object', message: '{"code":5}' });
    expect(pageOf('')).toBe('#/');
    expect(scrubStack(undefined)).toBeUndefined();
    expect(scrubStack('no frames here')).toBeUndefined();
  });

  it('keeps only the latest 200', () => {
    let log: ErrorEntry[] = [];
    for (let i = 0; i < MAX_ENTRIES + 5; i++) log = appendEntry(log, toEntry('error', new Error(`e${i}`), i, '#/'));
    expect(log).toHaveLength(MAX_ENTRIES);
    expect(log[0].message).toBe('e5');
  });

  it('writes a text file with the app version and the browser', () => {
    const text = logText([toEntry('import', new Error('Berkas rusak'), 0, '#/import')], {
      version: '1.0.0 (abc1234)',
      buildTime: '2026-10-08',
      userAgent: 'TestBrowser/1',
      now: 0,
    });
    expect(text).toContain('Versi aplikasi: 1.0.0 (abc1234), dibuat 2026-10-08');
    expect(text).toContain('Browser: TestBrowser/1');
    expect(text).toContain('impor · #/import');
    expect(text).toContain('Error: Berkas rusak');
  });
});

describe('local log', () => {
  beforeEach(async () => {
    await db.meta.clear();
    vi.stubGlobal('location', { hash: '#/sets/s1' });
  });

  it('stores cleaned entries and ignores aborted requests', async () => {
    await logError('generation', new Error(`400 dari server: key ${GEMINI} tidak valid`));
    const abort = new Error('dibatalkan');
    abort.name = 'AbortError';
    await logError('generation', abort);
    const log = (await db.meta.get('errorLog'))?.value as ErrorEntry[];
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ source: 'generation', page: '#/sets/s1' });
    expect(JSON.stringify(log)).not.toContain('AIza');
  });
});
