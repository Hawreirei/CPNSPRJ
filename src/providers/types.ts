import type { ProviderId } from '../domain/types';

export interface ProviderConfig {
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

/** A picture sent with the prompt (a photographed or rendered page), base64 without the data: prefix. */
export interface LlmImage {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  data: string;
}

export interface LlmRequest {
  system: string;
  prompt: string;
  /** Sent before the prompt. Only for models that read images; a model that cannot gets a clear error (#38). */
  images?: LlmImage[];
  signal?: AbortSignal;
  maxTokens?: number;
  /**
   * Called with the reply received so far while it is being written (Gemini streams it), so
   * finished questions can be shown before the whole reply is in. Other providers call it once
   * with the complete reply.
   */
  onText?: (textSoFar: string) => void;
}

export interface LlmResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** Which rate-limit window a 429 refers to: wait it out (minute) or stop for the day. */
export type QuotaScope = 'minute' | 'day';

export class ProviderError extends Error {
  status?: number;
  retryable: boolean;
  /** Server-suggested wait before retrying (Retry-After header or Gemini RetryInfo). */
  retryAfterMs?: number;
  quotaScope?: QuotaScope;
  constructor(message: string, opts: { status?: number; retryable?: boolean; retryAfterMs?: number; quotaScope?: QuotaScope } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
    this.retryAfterMs = opts.retryAfterMs;
    this.quotaScope = opts.quotaScope;
  }
}

export interface ProviderInfo {
  name: string;
  /**
   * Used only until the account's model list is read. Prefer moving aliases or
   * current-generation IDs; the app re-picks from the live list on save.
   */
  defaultModel: string;
  suggestedModels: string[];
  keyUrl: string;
  keyHint: string;
  /** How to limit what a leaked key can do (#48): the provider's own documentation, and what to set there. */
  limitHelp: { text: string; url: string };
  needsBaseUrl?: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: {
    name: 'Google Gemini',
    // Named by Google's own retirement notice for gemini-2.5-flash (Oct 2026); the live list still decides.
    defaultModel: 'gemini-3.8-flash',
    suggestedModels: ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'],
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyHint: 'AIza…',
    limitHelp: { text: 'batasi key hanya untuk Gemini API, dan pantau pemakaiannya', url: 'https://ai.google.dev/gemini-api/docs/api-key' },
  },
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-5.4-mini',
    suggestedModels: ['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.5'],
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-…',
    limitHelp: { text: 'pasang batas pengeluaran (spend limit) pada project key ini', url: 'https://developers.openai.com/api/docs/guides/spend-limits' },
  },
  anthropic: {
    name: 'Anthropic Claude',
    defaultModel: 'claude-sonnet-5-5',
    suggestedModels: ['claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-opus-5-5'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-…',
    limitHelp: { text: 'pasang batas pengeluaran bulanan (spend limit) organisasi atau workspace', url: 'https://platform.claude.com/docs/en/manage-claude/spend-limits-api' },
  },
  compat: {
    name: 'OpenAI-compatible',
    defaultModel: '',
    suggestedModels: [],
    keyUrl: 'https://openrouter.ai/keys',
    keyHint: 'kunci dari penyedia Anda',
    limitHelp: { text: 'bila penyedia Anda mendukung, pasang batas kredit per key (misalnya di OpenRouter)', url: 'https://openrouter.ai/docs/api-reference/limits' },
    needsBaseUrl: true,
  },
};

/** Estimated USD per 1M tokens. Editable in Settings because prices change. */
export const DEFAULT_PRICES: Record<string, { input: number; output: number }> = {
  'gpt-5.4-mini': { input: 0.75, output: 4.5 },
  'gpt-5.4-nano': { input: 0.2, output: 1.25 },
  'gpt-5.5': { input: 5, output: 30 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};
export const FALLBACK_PRICE = { input: 1, output: 4 };
