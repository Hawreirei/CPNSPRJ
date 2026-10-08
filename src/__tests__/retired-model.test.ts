import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { addKey, refreshKeyModel, refreshStaleKeyModels } from '../engine/keys';
import { isModelUnavailable, suggestedReplacement } from '../providers/models';

// Exact text Google returns for a retired model (from a user report, Oct 2026).
const GOOGLE_404 =
  'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements. We recommend you to use the Interactions API (https://ai.google.dev/gemini-api/docs/get-started).';

describe('retired model message', () => {
  it('is recognised and its suggested replacement extracted', () => {
    expect(isModelUnavailable(404, GOOGLE_404)).toBe(true);
    expect(suggestedReplacement(GOOGLE_404)).toBe('gemini-3.8-flash');
  });
  it('ignores messages without a usable model name', () => {
    expect(suggestedReplacement('Please use the Interactions API')).toBeUndefined();
    expect(suggestedReplacement('Rate limit exceeded')).toBeUndefined();
    expect(suggestedReplacement('The model `gpt-5-mini` was retired; switch to gpt-5.4-mini.')).toBe('gpt-5.4-mini');
  });
});

function mockModelList(names: string[] | 'fail') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      names === 'fail'
        ? new Response('{"error":{"message":"boom"}}', { status: 500 })
        : new Response(JSON.stringify({ models: names.map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
    ),
  );
}

describe('refreshKeyModel', () => {
  let keyId: string;
  beforeEach(async () => {
    await db.keys.clear();
    keyId = (await addKey({ provider: 'gemini', label: 'g', apiKey: 'AIza', model: 'gemini-2.5-flash' })).id;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('moves an old key off a retired model even if the list still shows it', async () => {
    mockModelList(['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-4-flash-preview']);
    const r = await refreshKeyModel(keyId, { exclude: 'gemini-2.5-flash' });
    expect(r).toEqual({ model: 'gemini-3.8-flash', changed: true });
  });

  it("uses the provider's suggestion when the model list can't be read", async () => {
    mockModelList('fail');
    const r = await refreshKeyModel(keyId, { exclude: 'gemini-2.5-flash', hint: 'gemini-3.8-flash' });
    expect(r.model).toBe('gemini-3.8-flash');
  });

  it('refreshes never-checked auto keys when the keys page opens', async () => {
    mockModelList(['gemini-2.5-flash', 'gemini-3.8-flash']);
    await refreshStaleKeyModels();
    expect((await db.keys.get(keyId))?.model).toBe('gemini-3.8-flash');
  });
});
