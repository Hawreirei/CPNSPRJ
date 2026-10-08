import Anthropic from '@anthropic-ai/sdk';
import { describeStatus } from './http';
import { ProviderError } from './types';
import type { LlmRequest, LlmResponse, ProviderConfig } from './types';

function client(cfg: ProviderConfig) {
  // BYOK app: the user's own key is sent straight from their browser to Anthropic.
  return new Anthropic({ apiKey: cfg.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
}

function wrap(e: unknown): never {
  if (e instanceof Anthropic.APIUserAbortError) throw new DOMException('Aborted', 'AbortError');
  if (e instanceof Anthropic.APIConnectionError) {
    throw new ProviderError('Tidak dapat menghubungi Anthropic API. Periksa koneksi.', { retryable: true });
  }
  if (e instanceof Anthropic.APIError) {
    const status = e.status ?? 0;
    throw new ProviderError(describeStatus(status, e.message), { status, retryable: status === 429 || status >= 500 });
  }
  throw e;
}

export async function completeAnthropic(cfg: ProviderConfig, req: LlmRequest): Promise<LlmResponse> {
  try {
    const response = await client(cfg).messages.create(
      {
        model: cfg.model,
        max_tokens: req.maxTokens ?? 16000,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
      },
      { signal: req.signal },
    );
    if (response.stop_reason === 'refusal') {
      throw new ProviderError('Model menolak permintaan ini. Coba ubah topik atau instruksi.');
    }
    const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    if (response.stop_reason === 'max_tokens' && !text.trim().endsWith('}')) {
      throw new ProviderError('Respons terpotong (max_tokens). Kurangi ukuran batch di Pengaturan.', { retryable: true });
    }
    return { text, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    return wrap(e);
  }
}

export async function listAnthropicModels(cfg: ProviderConfig): Promise<string[]> {
  try {
    const ids: string[] = [];
    for await (const m of client(cfg).models.list()) ids.push(m.id);
    return ids;
  } catch (e) {
    return wrap(e);
  }
}
