import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { dayWindowStart, keyUsage, markDayExhausted, QuotaExhaustedError, releaseRequest, reserveRequest } from '../engine/quota';
import { balancedSizes, estimatePlan, isProcedural, planBatches } from '../engine/plan';
import { finishBatch } from '../engine/generator';
import { quotaInfo } from '../providers/http';
import { parseAiQuestions, salvageQuestions } from '../domain/schemas';
import { buildPreset, DEFAULT_SETTINGS } from '../domain/blueprint';
import type { PlanBatch } from '../domain/types';

const key = (rpm: number, rpd: number, tpm = 0) => ({ id: 'k1', provider: 'gemini' as const, limits: { rpm, tpm, rpd } });

beforeEach(async () => {
  await db.requests.clear();
  await db.meta.clear();
});

describe('quota limiter', () => {
  it('stops at the daily request limit', async () => {
    const k = key(0, 2);
    await reserveRequest(k, 100);
    await reserveRequest(k, 100);
    await expect(reserveRequest(k, 100)).rejects.toBeInstanceOf(QuotaExhaustedError);
    expect((await keyUsage(k)).remainingToday).toBe(0);
  });

  it('released requests do not count', async () => {
    const k = key(0, 1);
    const id = await reserveRequest(k, 100);
    await releaseRequest(id);
    await expect(reserveRequest(k, 100)).resolves.toBeTypeOf('number');
  });

  it('waits for the per-minute window instead of sending', async () => {
    const k = key(1, 0);
    await reserveRequest(k, 100);
    const ctrl = new AbortController();
    let waited = 0;
    const p = reserveRequest(k, 100, {
      signal: ctrl.signal,
      onWait: (ms) => {
        waited = ms;
        ctrl.abort();
      },
    });
    await expect(p).rejects.toThrow(/Abort/);
    expect(waited).toBeGreaterThan(55_000);
    expect(waited).toBeLessThanOrEqual(61_000);
  });

  it('waits when the per-minute input-token budget would be exceeded', async () => {
    const k = key(0, 0, 1000);
    await reserveRequest(k, 800);
    const ctrl = new AbortController();
    let reason = '';
    await expect(
      reserveRequest(k, 300, {
        signal: ctrl.signal,
        onWait: (_ms, r) => {
          reason = r;
          ctrl.abort();
        },
      }),
    ).rejects.toThrow(/Abort/);
    expect(reason).toMatch(/token/);
  });

  it('honours a provider-reported daily exhaustion', async () => {
    const k = key(0, 20);
    await markDayExhausted(k);
    await expect(reserveRequest(k, 100)).rejects.toBeInstanceOf(QuotaExhaustedError);
  });

  it('starts the Gemini quota day at midnight Pacific time', () => {
    const now = Date.UTC(2026, 9, 8, 15, 30); // 08:30 PDT
    const start = dayWindowStart('gemini', now);
    const la = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit' }).format(new Date(start));
    expect(la).toMatch(/^(00|24):00$/);
    expect(now - start).toBe(8.5 * 3600_000);
  });
});

describe('429 parsing', () => {
  it('reads Gemini RetryInfo and per-day QuotaFailure', () => {
    const data = {
      error: {
        details: [
          { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] },
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' },
        ],
      },
    };
    expect(quotaInfo(data, null, '')).toEqual({ retryAfterMs: 37_000, quotaScope: 'day' });
    const perMinute = { error: { details: [{ '@type': 'x.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }] } };
    expect(quotaInfo(perMinute, '12', '').quotaScope).toBe('minute');
    expect(quotaInfo(perMinute, '12', '').retryAfterMs).toBe(12_000);
  });
});

describe('request-saving batching', () => {
  it('splits evenly into the fewest requests', () => {
    expect(balancedSizes(30, 20)).toEqual([15, 15]);
    expect(balancedSizes(45, 20)).toEqual([15, 15, 15]);
    expect(balancedSizes(10, 20)).toEqual([10]);
    expect(balancedSizes(0, 20)).toEqual([]);
  });

  it('fits a full SKD in a free-tier day', () => {
    const full = planBatches(buildPreset('full', DEFAULT_SETTINGS), DEFAULT_SETTINGS.questionsPerRequest);
    const mini = planBatches(buildPreset('mini', DEFAULT_SETTINGS), DEFAULT_SETTINGS.questionsPerRequest);
    expect(full.filter((b) => !isProcedural(b)).length).toBeLessThanOrEqual(8);
    expect(mini.filter((b) => !isProcedural(b)).length).toBe(3);
    const est = estimatePlan(full, 'gemini-flash-latest', DEFAULT_SETTINGS, { rpm: 5, tpm: 250_000, rpd: 20 });
    expect(est.requests).toBeLessThanOrEqual(8);
  });

  it('re-queues only the missing items when the model returns fewer questions', () => {
    const batch: PlanBatch = {
      id: 'b',
      subtest: 'TWK',
      items: ['A', 'B', 'C', 'D'].map((t) => ({ topic: t, difficulty: 'sedang' as const })),
      count: 4,
      status: 'pending',
    };
    const r = finishBatch(batch, 3);
    expect(r.done).toMatchObject({ count: 3, status: 'done' });
    expect(r.rest).toMatchObject({ count: 1, status: 'pending', items: [{ topic: 'D' }] });
    expect(finishBatch(batch, 4).rest).toBeUndefined();
  });
});

describe('truncated replies', () => {
  const q = (n: number) => ({ stem: `Soal nomor ${n} tentang "kutipan" {kurung}`, options: ['a', 'b', 'c', 'd', 'e'].map((text) => ({ text })), answer: 'A', explanation: 'x' });
  it('salvages complete questions from a cut-off reply', () => {
    const full = JSON.stringify({ questions: [q(1), q(2), q(3)] });
    const cut = full.slice(0, full.length - 40);
    expect(salvageQuestions(cut)).toHaveLength(2);
    const parsed = parseAiQuestions(cut, { subtest: 'TWK', items: [1, 2, 3].map(() => ({ topic: 'Pancasila', difficulty: 'mudah' as const })) });
    expect(parsed.map((x) => x.stem)).toEqual([q(1).stem, q(2).stem]);
  });
  it('keeps valid questions when one entry is malformed', () => {
    const text = JSON.stringify({ questions: [q(1), { stem: 'rusak' }, q(3)] });
    const parsed = parseAiQuestions(text, { subtest: 'TWK', items: ['X', 'Y', 'Z'].map((t) => ({ topic: t, difficulty: 'mudah' as const })) });
    expect(parsed.map((x) => x.topic)).toEqual(['X', 'Z']);
  });
});
