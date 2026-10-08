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
  defaultModel: string;
  suggestedModels: string[];
  /** Regexes tried in order to auto-pick an efficient model from the provider's model list. */
  preferred: RegExp[];
  keyUrl: string;
  keyHint: string;
  needsBaseUrl?: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: {
    name: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    suggestedModels: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'],
    preferred: [/^gemini-[\d.]+-flash$/, /flash(?!.*(lite|image|tts|live|audio))/, /flash/],
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyHint: 'AIza…',
  },
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-5-mini',
    suggestedModels: ['gpt-5-mini', 'gpt-5-nano', 'gpt-4.1-mini'],
    preferred: [/^gpt-[\d.]+-mini$/, /^gpt-.*mini$/, /^gpt-4o-mini$/],
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-…',
  },
  anthropic: {
    name: 'Anthropic Claude',
    defaultModel: 'claude-haiku-4-5',
    suggestedModels: ['claude-haiku-4-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
    preferred: [/^claude-haiku/, /^claude-sonnet/],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-…',
  },
  compat: {
    name: 'OpenAI-compatible',
    defaultModel: '',
    suggestedModels: [],
    preferred: [/flash/, /mini/, /haiku/, /small/],
    keyUrl: 'https://openrouter.ai/keys',
    keyHint: 'kunci dari penyedia Anda',
    needsBaseUrl: true,
  },
};

/** Estimated USD per 1M tokens. Editable in Settings because prices change. */
export const DEFAULT_PRICES: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gpt-5-mini': { input: 0.25, output: 2 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
};
export const FALLBACK_PRICE = { input: 1, output: 4 };

export function pickEfficientModel(provider: ProviderInfo, models: string[]): string | undefined {
  for (const re of provider.preferred) {
    const hit = models.filter((m) => re.test(m)).sort().reverse()[0];
    if (hit) return hit;
  }
  return undefined;
}
