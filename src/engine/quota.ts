import { db } from '../db';
import type { ApiKeyRecord, KeyLimits, ProviderId } from '../domain/types';

/**
 * Client-side rate limiter. Free tiers allow very few requests (e.g. Gemini:
 * 5/minute, 20/day), so every AI call reserves a slot here first: we wait for
 * the per-minute window instead of hammering the API, and stop cleanly when the
 * daily quota is used up so the set can be resumed after the reset.
 */

export const LIMIT_PRESETS: { id: string; label: string; limits: KeyLimits }[] = [
  { id: 'gemini-free', label: 'Gemini free tier (5/menit, 250K token/menit, 20/hari)', limits: { rpm: 5, tpm: 250_000, rpd: 20 } },
  { id: 'none', label: 'Tanpa batas (akun berbayar)', limits: { rpm: 0, tpm: 0, rpd: 0 } },
];

export function defaultLimits(provider: ProviderId): KeyLimits {
  return provider === 'gemini' ? { ...LIMIT_PRESETS[0].limits } : { rpm: 0, tpm: 0, rpd: 0 };
}

export const limitsOf = (k: Pick<ApiKeyRecord, 'provider' | 'limits'>): KeyLimits => k.limits ?? defaultLimits(k.provider);

export const isLimited = (l: KeyLimits) => l.rpm > 0 || l.tpm > 0 || l.rpd > 0;

/** Start of the current quota day: Gemini resets at midnight Pacific time; others use a rolling 24 hours. */
export function dayWindowStart(provider: ProviderId, now = Date.now()): number {
  if (provider !== 'gemini') return now - 24 * 3600_000;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date(now))
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  // Some engines format midnight as hour "24".
  const hour = parts.hour % 24;
  const msSinceMidnight = ((hour * 60 + parts.minute) * 60 + parts.second) * 1000 + (now % 1000);
  return now - msSinceMidnight;
}

export class QuotaExhaustedError extends Error {
  resetAt: number;
  constructor(resetAt: number, used?: number, limit?: number) {
    super(
      `Kuota harian API key ini sudah habis${used !== undefined ? ` (${used}/${limit} request)` : ''}. ` +
        `Lanjutkan setelah ${new Date(resetAt).toLocaleString('id-ID', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}, atau pakai key lain.`,
    );
    this.name = 'QuotaExhaustedError';
    this.resetAt = resetAt;
  }
}

export interface KeyUsage {
  today: number;
  lastMinute: number;
  minuteTokens: number;
  limits: KeyLimits;
  /** When at least one more request will be allowed today (Gemini: next Pacific midnight). */
  resetAt: number;
  remainingToday: number | null;
  blockedUntil?: number;
}

async function rows(keyId: string, since: number) {
  return db.requests.where('[keyId+at]').between([keyId, since], [keyId, Infinity]).sortBy('at');
}

export async function keyUsage(k: Pick<ApiKeyRecord, 'id' | 'provider' | 'limits'>, now = Date.now()): Promise<KeyUsage> {
  const limits = limitsOf(k);
  const dayStart = dayWindowStart(k.provider, now);
  const list = await rows(k.id, Math.min(dayStart, now - 60_000));
  const today = list.filter((r) => r.at >= dayStart);
  const minute = list.filter((r) => r.at > now - 60_000);
  const resetAt = k.provider === 'gemini' ? dayStart + 24 * 3600_000 : (today[0]?.at ?? now) + 24 * 3600_000;
  const blocked = (await db.meta.get(`quotaBlocked:${k.id}`))?.value as number | undefined;
  return {
    today: today.length,
    lastMinute: minute.length,
    minuteTokens: minute.reduce((n, r) => n + r.inputTokens, 0),
    limits,
    resetAt,
    remainingToday: limits.rpd ? Math.max(0, limits.rpd - today.length) : null,
    blockedUntil: blocked && blocked > now ? blocked : undefined,
  };
}

// One queue per key so parallel workers can't both take the last slot.
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(keyId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(keyId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(keyId, next.catch(() => undefined));
  return next;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

/**
 * Wait until the key may send another request, then record it.
 * Throws QuotaExhaustedError when today's quota is used up.
 */
export async function reserveRequest(
  k: Pick<ApiKeyRecord, 'id' | 'provider' | 'limits'>,
  estInputTokens: number,
  opts: { signal?: AbortSignal; onWait?: (ms: number, reason: string) => void } = {},
): Promise<number> {
  return withLock(k.id, async () => {
    for (;;) {
      const now = Date.now();
      const u = await keyUsage(k, now);
      if (u.blockedUntil) throw new QuotaExhaustedError(u.blockedUntil);
      if (u.limits.rpd && u.today >= u.limits.rpd) throw new QuotaExhaustedError(u.resetAt, u.today, u.limits.rpd);
      const minute = (await rows(k.id, now - 60_000)).filter((r) => r.at > now - 60_000);
      let wait = 0;
      let reason = '';
      if (u.limits.rpm && minute.length >= u.limits.rpm) {
        wait = minute[minute.length - u.limits.rpm].at + 60_000 - now;
        reason = `batas ${u.limits.rpm} request/menit`;
      } else if (u.limits.tpm && minute.length && u.minuteTokens + estInputTokens > u.limits.tpm) {
        wait = minute[0].at + 60_000 - now;
        reason = `batas ${Math.round(u.limits.tpm / 1000)}K token/menit`;
      }
      if (wait > 0) {
        opts.onWait?.(wait + 500, reason);
        await sleep(wait + 500, opts.signal);
        continue;
      }
      return (await db.requests.add({ keyId: k.id, at: now, inputTokens: estInputTokens })) as number;
    }
  });
}

/** Drop a reservation the provider never counted (rejected by a rate limit, or never reached it). */
export async function releaseRequest(id: number) {
  await db.requests.delete(id);
}

/** The provider says today's quota is gone even if our count disagrees (key used elsewhere). */
export async function markDayExhausted(k: Pick<ApiKeyRecord, 'id' | 'provider' | 'limits'>): Promise<number> {
  const resetAt = (await keyUsage(k)).resetAt;
  await db.meta.put({ key: `quotaBlocked:${k.id}`, value: resetAt });
  return resetAt;
}

export async function clearQuotaBlock(keyId: string) {
  await db.meta.delete(`quotaBlocked:${keyId}`);
}

export async function pruneRequestLog() {
  await db.requests.where('at').below(Date.now() - 3 * 24 * 3600_000).delete();
}
