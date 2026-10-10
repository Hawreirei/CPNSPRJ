import { SYSTEM_PROMPT } from '../domain/prompts';
import { parseAiPassages, parseAiQuestions } from '../domain/schemas';
import type { ApiKeyRecord, Question } from '../domain/types';
import { complete, isModelUnavailable, ProviderError, suggestedReplacement } from '../providers';
import type { LlmImage, ProviderConfig } from '../providers';
import { freshProviderConfig, providerConfig, refreshKeyModel, resolveKey } from './keys';
import { limitsOf, markDayExhausted, QuotaExhaustedError, releaseRequest, reserveRequest } from './quota';

/**
 * One model session shared by a run (generation, repair, cross-check): the provider config,
 * the key's quota, and recovery when the provider retires the model mid-run.
 */

/** Provider config shared by one run; swapped in place if the model is retired mid-run. */
export interface ModelSession {
  cfg: ProviderConfig;
  keyId: string;
  autoModel: boolean;
  key: Pick<ApiKeyRecord, 'id' | 'provider' | 'limits'>;
  swapped?: Promise<void>;
  onSwap?: (from: string, to: string) => void;
  onWait?: (ms: number, reason: string) => void;
}

export async function openSession(keyId?: string, modelOverride?: string): Promise<ModelSession> {
  const { keyId: id, autoModel, ...cfg } = await freshProviderConfig(keyId, modelOverride);
  const rec = (await resolveKey(id))!;
  return { cfg, keyId: id, autoModel, key: { id: rec.id, provider: rec.provider, limits: rec.limits } };
}

/** Rough input-token count used for the per-minute token limit. */
const estimateTokens = (text: string) => Math.ceil(text.length / 3.5);
const MAX_RATE_WAITS = 6;
/** Upper bound on what one page image costs in input tokens at any provider (see domain/photoImport.ts). */
const IMAGE_TOKENS = 1600;

/** Switch to the newest stable model once per session when the provider says the current one is gone. */
async function swapModel(s: ModelSession, errorMessage = ''): Promise<boolean> {
  if (!s.autoModel) return false;
  if (!s.swapped) {
    const from = s.cfg.model;
    s.swapped = (async () => {
      const { model } = await refreshKeyModel(s.keyId, { exclude: from, hint: suggestedReplacement(errorMessage) });
      s.cfg = await providerConfig(s.keyId);
      if (model !== from) s.onSwap?.(from, model);
    })();
    try {
      await s.swapped;
    } catch {
      return false;
    }
    return s.cfg.model !== from;
  }
  await s.swapped.catch(() => undefined);
  return true;
}

/**
 * Call the model and parse its reply; retries on parse or transient errors, waits out
 * rate limits, stays within the key's quota, and recovers from a retired model.
 * A parse error counts as a failed attempt, so a malformed reply is retried.
 */
export async function callModel<T>(
  session: ModelSession,
  req: { system: string; prompt: string; images?: LlmImage[]; onText?: (textSoFar: string) => void },
  parse: (text: string) => T | Promise<T>,
  signal: AbortSignal,
  onUsage: (i: number, o: number) => Promise<void>,
): Promise<T> {
  let lastErr: unknown;
  let triedSwap = false;
  let rateWaits = 0;
  // A limited daily quota makes every retry expensive: allow one retry instead of two.
  const maxAttempts = limitsOf(session.key).rpd ? 2 : 3;
  const est = estimateTokens(req.system + req.prompt) + (req.images?.length ?? 0) * IMAGE_TOKENS;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const model = session.cfg.model;
    // Throws QuotaExhaustedError when today's quota is used up; waits for the minute window otherwise.
    const slot = await reserveRequest(session.key, est, { signal, onWait: session.onWait });
    try {
      const res = await complete(session.cfg, { system: req.system, prompt: req.prompt, images: req.images, signal, onText: req.onText });
      await onUsage(res.inputTokens, res.outputTokens);
      return await parse(res.text);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      lastErr = e;
      if (e instanceof ProviderError && e.status === 429) {
        // Rejected by a rate limit: the provider didn't count it, so neither do we.
        await releaseRequest(slot);
        if (e.quotaScope === 'day') {
          throw new QuotaExhaustedError(await markDayExhausted(session.key));
        }
        if (rateWaits++ < MAX_RATE_WAITS) {
          const wait = Math.min(Math.max(e.retryAfterMs ?? 60_000, 5_000), 5 * 60_000);
          session.onWait?.(wait, 'server meminta menunggu (429)');
          await sleep(wait, signal);
          attempt--;
          continue;
        }
        throw e;
      }
      if (e instanceof ProviderError && e.status === undefined) await releaseRequest(slot);
      if (e instanceof ProviderError && !triedSwap && isModelUnavailable(e.status, e.message)) {
        triedSwap = true;
        // Another worker may already have swapped; otherwise refresh from the live list.
        if (session.cfg.model !== model || (await swapModel(session, e.message))) {
          attempt--;
          continue;
        }
        if (!session.autoModel) {
          // The user picked this model: don't switch it silently, explain instead.
          const hint = suggestedReplacement(e.message);
          throw new ProviderError(
            `Model ${model} yang Anda pilih sudah tidak tersedia untuk key ini.${hint ? ` Penyedia menyarankan ${hint}.` : ''} Pilih model lain di halaman API Keys (atau "Otomatis"), lalu klik Lanjutkan.`,
            { status: e.status },
          );
        }
      }
      const retryable = !(e instanceof ProviderError) || e.retryable;
      if (!retryable) break;
      await sleep(1500 * 2 ** attempt, signal);
    }
  }
  throw lastErr;
}

/** Generate reading passages with their questions: all of them, or a retry. */
export function callAndParsePassages(
  session: ModelSession,
  prompt: string,
  ctx: Parameters<typeof parseAiPassages>[1],
  signal: AbortSignal,
  onUsage: (i: number, o: number) => Promise<void>,
): Promise<Question[]> {
  return callModel(session, { system: SYSTEM_PROMPT, prompt }, (text) => parseAiPassages(text, ctx), signal, onUsage);
}

/** Generate questions: callModel with the authoring prompt and the question parser. */
export function callAndParse(
  session: ModelSession,
  prompt: string,
  ctx: Parameters<typeof parseAiQuestions>[1],
  signal: AbortSignal,
  onUsage: (i: number, o: number) => Promise<void>,
): Promise<Question[]> {
  return callModel(session, { system: SYSTEM_PROMPT, prompt }, (text) => parseAiQuestions(text, ctx), signal, onUsage);
}

export function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}
