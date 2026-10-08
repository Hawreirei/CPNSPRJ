import Anthropic from '@anthropic-ai/sdk';
import { describeStatus, quotaInfo } from './http';
import { ProviderError } from './types';
import type { LlmRequest, LlmResponse, ProviderConfig } from './types';
import type { ModelInfo } from '../domain/types';

function client(cfg: ProviderConfig) {
  // BYOK app: the user's own key is sent straight from their browser to Anthropic.
  // No SDK retries: the app's quota limiter decides when to retry so free-tier quota isn't burned.
  return new Anthropic({ apiKey: cfg.apiKey, dangerouslyAllowBrowser: true, maxRetries: 0 });
}

function wrap(e: unknown): never {
  if (e instanceof Anthropic.APIUserAbortError) throw new DOMException('Aborted', 'AbortError');
  if (e instanceof Anthropic.APIConnectionError) {
    throw new ProviderError('Tidak dapat menghubungi Anthropic API. Periksa koneksi.', { retryable: true });
  }
  if (e instanceof Anthropic.APIError) {
    const status = e.status ?? 0;
    const quota = status === 429 ? quotaInfo(null, e.headers?.get?.('retry-after') ?? null, e.message) : {};
    throw new ProviderError(describeStatus(status, e.message), { status, retryable: status === 429 || status >= 500, ...quota });
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
        messages: [
          {
            role: 'user',
            content: req.images?.length
              ? [...req.images.map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.mimeType, data: i.data } })), { type: 'text' as const, text: req.prompt }]
              : req.prompt,
          },
        ],
        // Claude 5-generation Sonnet/Opus/Fable think adaptively; medium effort balances accuracy and cost.
        ...(/^claude-(sonnet|opus|fable)-([5-9]|\d{2})/.test(cfg.model) ? { output_config: { effort: 'medium' as const } } : {}),
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

export async function listAnthropicModels(cfg: ProviderConfig): Promise<ModelInfo[]> {
  try {
    const out: ModelInfo[] = [];
    for await (const m of client(cfg).models.list()) out.push({ id: m.id, label: m.display_name });
    return out;
  } catch (e) {
    return wrap(e);
  }
}
