import { completeAnthropic, listAnthropicModels } from './anthropic';
import { getJson, postJson } from './http';
import { ProviderError } from './types';
import type { LlmRequest, LlmResponse, ProviderConfig } from './types';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const OPENAI_BASE = 'https://api.openai.com/v1';

const trimSlash = (s: string) => s.replace(/\/+$/, '');

async function completeGemini(cfg: ProviderConfig, req: LlmRequest): Promise<LlmResponse> {
  const data = await postJson(
    `${GEMINI_BASE}/models/${encodeURIComponent(cfg.model)}:generateContent`,
    {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.9, maxOutputTokens: req.maxTokens ?? 16000 },
    },
    { 'x-goog-api-key': cfg.apiKey },
    req.signal,
  );
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
  if (isOpenAi) body.max_completion_tokens = req.maxTokens ?? 16000;
  else body.max_tokens = req.maxTokens ?? 8000;
  const headers = { authorization: `Bearer ${cfg.apiKey}` };
  let data;
  try {
    data = await postJson(`${base}/chat/completions`, body, headers, req.signal);
  } catch (e) {
    // Some compatible servers reject response_format; retry once without it.
    if (e instanceof ProviderError && e.status === 400 && !isOpenAi) {
      delete body.response_format;
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

export async function listModels(cfg: ProviderConfig): Promise<string[]> {
  switch (cfg.provider) {
    case 'gemini': {
      const d = (await getJson(`${GEMINI_BASE}/models?pageSize=200`, { 'x-goog-api-key': cfg.apiKey })) as {
        models?: { name: string; supportedGenerationMethods?: string[] }[];
      };
      return (d.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''));
    }
    case 'openai':
    case 'compat': {
      const base = cfg.provider === 'openai' ? OPENAI_BASE : trimSlash(cfg.baseUrl ?? '');
      const d = (await getJson(`${base}/models`, { authorization: `Bearer ${cfg.apiKey}` })) as { data?: { id: string }[] };
      return (d.data ?? []).map((m) => m.id);
    }
    case 'anthropic':
      return listAnthropicModels(cfg);
  }
}

export { PROVIDERS, DEFAULT_PRICES, FALLBACK_PRICE, pickEfficientModel, ProviderError } from './types';
export type { ProviderConfig, LlmResponse } from './types';
