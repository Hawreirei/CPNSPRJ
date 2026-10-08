import { ProviderError } from './types';

export async function postJson(url: string, body: unknown, headers: Record<string, string>, signal?: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ProviderError(
      'Tidak dapat menghubungi server AI. Periksa koneksi internet, atau endpoint mungkin menolak akses dari browser (CORS).',
      { retryable: true },
    );
  }
  return readResponse(res);
}

export async function getJson(url: string, headers: Record<string, string>, signal?: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(url, { headers, signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ProviderError('Tidak dapat menghubungi server AI (jaringan atau CORS).', { retryable: true });
  }
  return readResponse(res);
}

async function readResponse(res: Response) {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = extractErrorMessage(data) ?? text.slice(0, 300) ?? res.statusText;
    const quota = res.status === 429 ? quotaInfo(data, res.headers.get('retry-after'), msg) : {};
    throw new ProviderError(describeStatus(res.status, msg), {
      status: res.status,
      retryable: res.status === 429 || res.status >= 500,
      ...quota,
    });
  }
  return data as Record<string, unknown>;
}

function extractErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const err = (data as { error?: unknown }).error;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return undefined;
}

export function describeStatus(status: number, msg: string): string {
  if (status === 401 || status === 403) return `API key ditolak (${status}): ${msg}`;
  if (status === 404) return `Model atau endpoint tidak ditemukan (404): ${msg}`;
  if (status === 429) return `Batas kuota/rate limit tercapai (429): ${msg}`;
  return `Error ${status}: ${msg}`;
}

/**
 * Read how long to wait and whether a 429 is a per-minute or per-day limit.
 * Gemini sends google.rpc.RetryInfo / QuotaFailure details; others send Retry-After.
 */
export function quotaInfo(data: unknown, retryAfterHeader: string | null, message: string): { retryAfterMs?: number; quotaScope?: 'minute' | 'day' } {
  let retryAfterMs: number | undefined;
  let quotaScope: 'minute' | 'day' | undefined;
  const details = ((data as { error?: { details?: unknown[] } })?.error?.details ?? []) as Record<string, unknown>[];
  for (const d of details) {
    const type = String(d['@type'] ?? '');
    if (type.endsWith('RetryInfo') && typeof d.retryDelay === 'string') {
      const secs = parseFloat(d.retryDelay);
      if (Number.isFinite(secs)) retryAfterMs = secs * 1000;
    }
    if (type.endsWith('QuotaFailure') && Array.isArray(d.violations)) {
      const ids = (d.violations as Record<string, unknown>[]).map((v) => `${v.quotaId ?? ''} ${v.quotaMetric ?? ''}`).join(' ');
      if (/PerDay/i.test(ids)) quotaScope = 'day';
      else if (/PerMinute/i.test(ids)) quotaScope = 'minute';
    }
  }
  if (retryAfterMs === undefined && retryAfterHeader) {
    const secs = Number(retryAfterHeader);
    retryAfterMs = Number.isFinite(secs) ? secs * 1000 : Math.max(0, Date.parse(retryAfterHeader) - Date.now()) || undefined;
  }
  if (!quotaScope) {
    if (/per.?day|daily|requests per day|RPD/i.test(message)) quotaScope = 'day';
    else if (/per.?minute|RPM|TPM/i.test(message)) quotaScope = 'minute';
  }
  return { retryAfterMs, quotaScope };
}
