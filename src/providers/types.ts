import type { ProviderId } from '../domain/types';

export interface ProviderConfig {
  provider: ProviderId;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface LlmRequest {
  system: string;
  prompt: string;
  signal?: AbortSignal;
  maxTokens?: number;
}

export interface LlmResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export class ProviderError extends Error {
  status?: number;
  retryable: boolean;
  constructor(message: string, opts: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
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
  needsBaseUrl?: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: {
    name: 'Google Gemini',
    // Google's alias that always points to the current Flash model.
    defaultModel: 'gemini-flash-latest',
    suggestedModels: ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest'],
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyHint: 'AIza…',
  },
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-5.4-mini',
    suggestedModels: ['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.5'],
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-…',
  },
  anthropic: {
    name: 'Anthropic Claude',
    defaultModel: 'claude-sonnet-5-5',
    suggestedModels: ['claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-opus-5-5'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-…',
  },
  compat: {
    name: 'OpenAI-compatible',
    defaultModel: '',
    suggestedModels: [],
    keyUrl: 'https://openrouter.ai/keys',
    keyHint: 'kunci dari penyedia Anda',
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
