import { describe, expect, it } from 'vitest';
import { familyPrice, groupModels, isModelUnavailable, pickRecommendedModel, rankModel } from '../providers/models';

describe('model selection', () => {
  it('picks the newest stable Gemini Flash and ignores preview / non-text models', () => {
    const ids = [
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.5-pro',
      'gemini-3-flash-preview',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-pro-preview',
      'gemini-flash-latest',
      'gemini-2.5-flash-image',
      'gemini-2.5-flash-preview-tts',
      'gemini-embedding-001',
      'gemma-3-27b-it',
    ];
    expect(pickRecommendedModel(ids)).toBe('gemini-3.5-flash');
  });

  it('prefers an older stable model over a newer preview', () => {
    expect(pickRecommendedModel(['gemini-2.5-flash', 'gemini-3-flash-preview'])).toBe('gemini-2.5-flash');
  });

  it('falls back to the "latest" alias, then to a preview, when nothing stable is listed', () => {
    expect(pickRecommendedModel(['gemini-3-flash-preview', 'gemini-flash-latest'])).toBe('gemini-flash-latest');
    expect(pickRecommendedModel(['gemini-3-flash-preview', 'gemini-embedding-001'])).toBe('gemini-3-flash-preview');
  });

  it('compares versions numerically, not alphabetically', () => {
    expect(pickRecommendedModel(['gemini-9-flash', 'gemini-10-flash'])).toBe('gemini-10-flash');
    expect(pickRecommendedModel(['gpt-5.10-mini', 'gpt-5.9-mini'])).toBe('gpt-5.10-mini');
  });

  it('picks the newest OpenAI mini, preferring the alias over a dated snapshot', () => {
    const ids = [
      'gpt-5-mini',
      'gpt-5.4-mini-2026-03-17',
      'gpt-5.4-mini',
      'gpt-5.4-nano',
      'gpt-5.5',
      'gpt-4o-mini',
      'gpt-realtime-mini',
      'gpt-4.1-mini',
      'o4-mini',
      'text-embedding-3-small',
    ];
    expect(pickRecommendedModel(ids)).toBe('gpt-5.4-mini');
    expect(pickRecommendedModel(['gpt-5.4-mini-2026-03-17', 'gpt-5-mini'])).toBe('gpt-5.4-mini-2026-03-17');
  });

  it('picks the newest Claude Sonnet, handling dated IDs', () => {
    const ids = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929', 'claude-sonnet-5', 'claude-sonnet-5-5', 'claude-opus-5-5'];
    expect(pickRecommendedModel(ids)).toBe('claude-sonnet-5-5');
    expect(rankModel('claude-haiku-4-5-20251001')).toMatchObject({ tier: 'cheap', stable: true, version: [4, 5] });
  });

  it('falls back to the cheap tier when no recommended tier exists', () => {
    expect(pickRecommendedModel(['claude-haiku-4-5', 'claude-opus-5-5'])).toBe('claude-haiku-4-5');
  });

  it('understands OpenRouter-style ids', () => {
    expect(rankModel('google/gemini-3.5-flash')).toMatchObject({ tier: 'recommended', stable: true });
    expect(pickRecommendedModel(['meta/llama-x', 'openai/gpt-5.4-mini:free'])).toBe('openai/gpt-5.4-mini:free');
  });

  it('groups every model for the picker, special-purpose ones last instead of hidden', () => {
    const groups = groupModels(['gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-embedding-001', 'gemini-flash-latest', 'gemini-3.5-flash-lite']);
    const all = groups.flatMap((g) => g.ids);
    expect(groups[groups.length - 1]).toEqual({ label: expect.stringContaining('Khusus'), ids: ['gemini-embedding-001'] });
    expect(groups[0]).toEqual({ label: expect.stringContaining('Direkomendasikan'), ids: ['gemini-3.5-flash'] });
    expect(all).toContain('gemini-3-flash-preview');
    expect(all).toContain('gemini-flash-latest');
  });

  it('detects retired-model errors', () => {
    expect(isModelUnavailable(404, 'anything')).toBe(true);
    expect(isModelUnavailable(400, 'This model is no longer available to new users.')).toBe(true);
    expect(isModelUnavailable(400, 'The model `gpt-5-mini` does not exist')).toBe(true);
    expect(isModelUnavailable(429, 'Rate limit exceeded')).toBe(false);
    expect(isModelUnavailable(401, 'Invalid API key')).toBe(false);
  });

  it('estimates prices for unknown future versions by family', () => {
    expect(familyPrice('gemini-4-flash')).toBeDefined();
    expect(familyPrice('gpt-6-mini')).toBeDefined();
    expect(familyPrice('mystery-model')).toBeUndefined();
  });

  it('offers every model from a real Gemini account list (user screenshot, Oct 2026)', () => {
    const ids = [
      'antigravity-preview-09-2026',
      'antigravity-preview-latest',
      'deep-research-max-preview-04-2026',
      'deep-research-preview-04-2026',
      'deep-research-pro-preview-12-2025',
      'gemini-2.5-computer-use-preview-10-2025',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.5-pro',
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite',
      'gemini-3.1-flash-lite-preview',
      'gemini-3.1-pro-preview',
      'gemini-3.1-pro-preview-customtools',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.5-transcribe',
      'gemini-3.6-flash',
      'gemini-3.7-flash',
      'gemini-3.8-flash',
    ];
    const groups = groupModels(ids);
    // Nothing is dropped: the user can pick any of them.
    expect(groups.flatMap((g) => g.ids).sort()).toEqual([...ids].sort());
    expect(groups[0].ids.slice(0, 3)).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash']);
    expect(pickRecommendedModel(ids)).toBe('gemini-3.8-flash');
    const special = groups.find((g) => g.label.startsWith('Khusus'))!.ids;
    expect(special).toEqual(
      expect.arrayContaining(['antigravity-preview-latest', 'deep-research-preview-04-2026', 'gemini-3.5-transcribe', 'gemini-2.5-computer-use-preview-10-2025']),
    );
  });
});
