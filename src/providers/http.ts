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
    throw new ProviderError(describeStatus(res.status, msg), {
      status: res.status,
      retryable: res.status === 429 || res.status >= 500,
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
