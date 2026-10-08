import { afterEach, describe, expect, it, vi } from 'vitest';
import { complete, listModelInfo } from '../providers';
import { ProviderError } from '../providers/types';

const cfg = { provider: 'anthropic' as const, apiKey: 'sk-ant-test', model: 'claude-sonnet-5-5' };

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      return handler(url, init);
    }),
  );
  return calls;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

// The SDK is loaded on first use (dynamic import); these go through that path.
describe('penyedia Anthropic (SDK dimuat saat dipakai)', () => {
  it('mengirim pesan dan membaca jawabannya', async () => {
    const calls = stubFetch(() =>
      json({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: cfg.model,
        content: [{ type: 'text', text: '{"questions":[]}' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 12, output_tokens: 34 },
      }),
    );
    const r = await complete(cfg, { system: 'sys', prompt: 'halo' });
    expect(r).toEqual({ text: '{"questions":[]}', inputTokens: 12, outputTokens: 34 });
    expect(calls[0].url).toMatch(/api\.anthropic\.com\/v1\/messages$/);
    expect(calls[0].body).toMatchObject({ model: cfg.model, system: 'sys', messages: [{ role: 'user', content: 'halo' }] });
  });

  it('menerjemahkan 429 menjadi galat yang bisa dicoba ulang', async () => {
    stubFetch(() => json({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, 429));
    const err = await complete(cfg, { system: 's', prompt: 'p' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).retryable).toBe(true);
  });

  it('mendaftar model', async () => {
    stubFetch(() => json({ data: [{ type: 'model', id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', created_at: '2026-01-01T00:00:00Z' }], has_more: false, first_id: 'a', last_id: 'a' }));
    expect(await listModelInfo(cfg)).toEqual([{ id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' }]);
  });
});
