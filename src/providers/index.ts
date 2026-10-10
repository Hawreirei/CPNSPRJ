import { completeAnthropic, listAnthropicModels } from './anthropic';
import { getJson, postJson } from './http';
import { ProviderError } from './types';
import type { LlmRequest, LlmResponse, ProviderConfig } from './types';
import type { ModelInfo } from '../domain/types';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const OPENAI_BASE = 'https://api.openai.com/v1';

const trimSlash = (s: string) => s.replace(/\/+$/, '');

/**
 * Keep Gemini's hidden "thinking" short. Gemini 3 thinks at length by default;
 * those tokens are billed and rate-limited like output, slow every request down,
 * and can use up the whole output budget so the reply comes back cut off (and is
 * then requested again). Writing practice questions doesn't need deep thinking:
 * the answers are checked afterwards anyway.
 */
export function geminiThinking(model: string): Record<string, unknown> | undefined {
  if (/^gemini-(flash|flash-lite|pro)-latest$/.test(model)) return { thinkingLevel: 'low' };
  const m = model.match(/^gemini-(\d+(?:\.\d+)?)-(flash-lite|flash|pro)/);
  if (!m) return undefined;
  const v = Number(m[1]);
  if (v >= 3) return { thinkingLevel: 'low' };
  if (v >= 2.5) return { thinkingBudget: m[2] === 'pro' ? 128 : 0 };
  return undefined;
}

/** Models that rejected the thinking setting; they are called without it from then on. */
const noThinking = new Set<string>();

async function completeGemini(cfg: ProviderConfig, req: LlmRequest): Promise<LlmResponse> {
  const thinking = noThinking.has(cfg.model) ? undefined : geminiThinking(cfg.model);
  const call = (thinkingConfig?: Record<string, unknown>) =>
    postJson(
      `${GEMINI_BASE}/models/${encodeURIComponent(cfg.model)}:generateContent`,
      {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: req.maxTokens ?? 32768, ...(thinkingConfig ? { thinkingConfig } : {}) },
      },
      { 'x-goog-api-key': cfg.apiKey },
      req.signal,
    );
  let data;
  try {
    data = await call(thinking);
  } catch (e) {
    // An invalid argument is rejected before any work is done: retry once without the setting.
    if (!(thinking && e instanceof ProviderError && e.status === 400 && /think/i.test(e.message))) throw e;
    noThinking.add(cfg.model);
    data = await call();
  }
  type GeminiResp = {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    promptFeedback?: { blockReason?: string };
  };
  const d = data as GeminiResp;
  if (d.promptFeedback?.blockReason) throw new ProviderError(`Permintaan diblokir Gemini: ${d.promptFeedback.blockReason}`);
  const cand = d.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new ProviderError(`Gemini tidak mengembalikan teks (${cand?.finishReason ?? 'unknown'}).`, { retryable: true });
  return {
    text,
    inputTokens: d.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: (d.usageMetadata?.candidatesTokenCount ?? 0) + (d.usageMetadata?.thoughtsTokenCount ?? 0),
  };
}

async function completeOpenAiLike(base: string, cfg: ProviderConfig, req: LlmRequest, isOpenAi: boolean): Promise<LlmResponse> {
  const body: Record<string, unknown> = {
    model: cfg.model,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.prompt },
    ],
    response_format: { type: 'json_object' },
  };
  if (isOpenAi) {
    body.max_completion_tokens = req.maxTokens ?? 32000;
    // Reasoning models: keep hidden reasoning short so batches stay fast and cheap.
    if (/^(gpt-5|o\d)/.test(cfg.model)) body.reasoning_effort = 'low';
  } else body.max_tokens = req.maxTokens ?? 8000;
  const headers = { authorization: `Bearer ${cfg.apiKey}` };
  let data;
  try {
    data = await postJson(`${base}/chat/completions`, body, headers, req.signal);
  } catch (e) {
    // Some compatible servers reject response_format; retry once without it.
    if (e instanceof ProviderError && e.status === 400 && (!isOpenAi || body.reasoning_effort)) {
      // Retry once without optional parameters some models/servers reject.
      delete body.reasoning_effort;
      if (!isOpenAi) delete body.response_format;
      data = await postJson(`${base}/chat/completions`, body, headers, req.signal);
    } else throw e;
  }
  type ChatResp = {
    choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const d = data as ChatResp;
  const choice = d.choices?.[0];
  if (choice?.message?.refusal) throw new ProviderError(`Model menolak: ${choice.message.refusal}`);
  const text = choice?.message?.content ?? '';
  if (!text) throw new ProviderError(`Model tidak mengembalikan teks (${choice?.finish_reason ?? 'unknown'}).`, { retryable: true });
  return { text, inputTokens: d.usage?.prompt_tokens ?? 0, outputTokens: d.usage?.completion_tokens ?? 0 };
}

export async function complete(cfg: ProviderConfig, req: LlmRequest): Promise<LlmResponse> {
  switch (cfg.provider) {
    case 'gemini':
      return completeGemini(cfg, req);
    case 'openai':
      return completeOpenAiLike(OPENAI_BASE, cfg, req, true);
    case 'anthropic':
      return completeAnthropic(cfg, req);
    case 'compat':
      if (!cfg.baseUrl) throw new ProviderError('Base URL wajib diisi untuk penyedia OpenAI-compatible.');
      return completeOpenAiLike(trimSlash(cfg.baseUrl), cfg, req, false);
  }
}

/** All models the key can call, with display names where the provider gives them. */
export async function listModelInfo(cfg: ProviderConfig): Promise<ModelInfo[]> {
  switch (cfg.provider) {
    case 'gemini': {
      const out: ModelInfo[] = [];
      let pageToken = '';
      // Gemini pages its list; follow every page so no model is missing.
      for (let page = 0; page < 10; page++) {
        const d = (await getJson(`${GEMINI_BASE}/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, {
          'x-goog-api-key': cfg.apiKey,
        })) as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[]; nextPageToken?: string };
        for (const m of d.models ?? []) {
          if (m.supportedGenerationMethods && !m.supportedGenerationMethods.includes('generateContent')) continue;
          out.push({ id: m.name.replace(/^models\//, ''), label: m.displayName });
        }
        if (!d.nextPageToken) break;
        pageToken = d.nextPageToken;
      }
      return out;
    }
    case 'openai':
    case 'compat': {
      const base = cfg.provider === 'openai' ? OPENAI_BASE : trimSlash(cfg.baseUrl ?? '');
      const d = (await getJson(`${base}/models`, { authorization: `Bearer ${cfg.apiKey}` })) as { data?: { id: string; name?: string }[] };
      return (d.data ?? []).map((m) => ({ id: m.id, label: m.name }));
    }
    case 'anthropic':
      return listAnthropicModels(cfg);
  }
}

export async function listModels(cfg: ProviderConfig): Promise<string[]> {
  return (await listModelInfo(cfg)).map((m) => m.id);
}

export { PROVIDERS, DEFAULT_PRICES, FALLBACK_PRICE, ProviderError } from './types';
export { pickRecommendedModel, groupModels, isModelUnavailable, suggestedReplacement } from './models';
export type { ProviderConfig, LlmResponse } from './types';
