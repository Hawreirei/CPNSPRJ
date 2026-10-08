import { PROCEDURAL_TOPICS } from '../domain/blueprint';
import { DEFAULT_PRICES, FALLBACK_PRICE } from '../providers/types';
import { familyPrice } from '../providers/models';
import { uid } from '../lib/id';
import type { BatchItem, Blueprint, Difficulty, KeyLimits, PlanBatch, Settings, Subtest } from '../domain/types';

const MIX: Difficulty[] = ['sedang', 'mudah', 'sedang', 'sulit', 'sedang', 'mudah', 'sulit', 'sedang', 'sedang', 'mudah'];

export const isProcedural = (b: Pick<PlanBatch, 'items'>) => b.items.length > 0 && b.items.every((i) => PROCEDURAL_TOPICS.has(i.topic));

/** Split `n` items into the fewest chunks of at most `size`, with sizes as even as possible (30 by 20 → 15+15). */
export function balancedSizes(n: number, size: number): number[] {
  if (n <= 0) return [];
  const chunks = Math.ceil(n / Math.max(1, size));
  const base = Math.floor(n / chunks);
  return Array.from({ length: chunks }, (_, i) => base + (i < n % chunks ? 1 : 0));
}

/** Chunk items into batches: procedural topics alone (no AI), the rest mixed up to `batchSize`. */
export function chunkItems(subtest: Subtest, items: BatchItem[], batchSize: number, basedOn?: string[]): PlanBatch[] {
  const batches: PlanBatch[] = [];
  const procedural = items.filter((i) => PROCEDURAL_TOPICS.has(i.topic));
  const ai = items.filter((i) => !PROCEDURAL_TOPICS.has(i.topic));
  const groups = new Map<string, BatchItem[]>();
  for (const it of procedural) groups.set(`${it.topic}|${it.difficulty}`, [...(groups.get(`${it.topic}|${it.difficulty}`) ?? []), it]);
  for (const g of groups.values()) batches.push({ id: uid(), subtest, items: g, count: g.length, status: 'pending' });
  let i = 0;
  for (const n of balancedSizes(ai.length, batchSize)) {
    const chunk = ai.slice(i, i + n);
    batches.push({ id: uid(), subtest, items: chunk, count: chunk.length, status: 'pending', basedOn: basedOn?.slice(i, i + n) });
    i += n;
  }
  return batches;
}

/**
 * The topic of each of `count` questions. Without weights the topics simply take turns. With
 * weights each topic gets its share (largest remainder), still interleaved so a short set
 * covers as many topics as it can.
 */
export function topicSequence(topics: string[], count: number, weights?: Record<string, number>): string[] {
  const w = topics.map((t) => Math.max(0, weights?.[t] ?? 1));
  const total = w.reduce((a, b) => a + b, 0);
  if (!weights || !total || w.every((x) => x === w[0])) return Array.from({ length: count }, (_, i) => topics[i % topics.length]);
  const exact = w.map((x) => (count * x) / total);
  const left = exact.map(Math.floor);
  const byRemainder = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; k < count - left.reduce((a, b) => a + b, 0); k++) left[byRemainder[k].i]++;
  const out: string[] = [];
  while (out.length < count) {
    topics.forEach((t, i) => {
      if (left[i] > 0) {
        out.push(t);
        left[i]--;
      }
    });
  }
  return out;
}

/** Spread each section's questions over its topics and difficulties, then batch them. */
export function planBatches(blueprint: Blueprint, batchSize: number): PlanBatch[] {
  const batches: PlanBatch[] = [];
  for (const sec of blueprint.sections) {
    if (!sec.count || !sec.topics.length) continue;
    const sequence = topicSequence(sec.topics, sec.count, sec.weights);
    const items: BatchItem[] = Array.from({ length: sec.count }, (_, i) => ({
      topic: sequence[i],
      // Rotate the mix per topic round so a topic doesn't always get the same difficulty.
      difficulty: sec.difficulty === 'campuran' ? MIX[(i + Math.floor(i / sec.topics.length) * 3) % MIX.length] : sec.difficulty,
    }));
    batches.push(...chunkItems(sec.subtest, items, batchSize));
  }
  return batches;
}

export function batchLabel(b: PlanBatch): string {
  const topics = [...new Set(b.items.map((i) => i.topic))];
  return `${b.subtest} · ${topics.length > 2 ? `${topics.slice(0, 2).join(', ')} +${topics.length - 2}` : topics.join(', ')} (${b.count})`;
}

export const OUT_PER_Q = { TWK: 420, TIU: 420, TKP: 650 } as const;
const IN_PER_REQ = 1300;

export interface PlanEstimate {
  requests: number;
  freeQuestions: number;
  aiQuestions: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: [number, number];
  minutes: [number, number];
}

export function estimatePlan(
  batches: PlanBatch[],
  model: string,
  settings: Pick<Settings, 'concurrency' | 'priceOverrides'>,
  limits?: KeyLimits,
): PlanEstimate {
  const pending = batches.filter((b) => b.status !== 'done');
  const ai = pending.filter((b) => !isProcedural(b));
  const aiQuestions = ai.reduce((n, b) => n + b.count, 0);
  const inputTokens = ai.length * IN_PER_REQ;
  const outputTokens = ai.reduce((n, b) => n + b.count * OUT_PER_Q[b.subtest], 0);
  const price = settings.priceOverrides[model] ?? DEFAULT_PRICES[model] ?? familyPrice(model) ?? FALLBACK_PRICE;
  const cost = (inputTokens * price.input + outputTokens * price.output) / 1e6;
  // Rate-limited keys run one request at a time and may wait for the per-minute window.
  const conc = limits?.rpm ? 1 : Math.max(1, settings.concurrency);
  const perRequestSecs = ai.length ? outputTokens / 80 / ai.length : 0;
  const pacedSecs = limits?.rpm ? Math.max(perRequestSecs, 60 / limits.rpm) : perRequestSecs;
  const secs = (ai.length * pacedSecs) / conc;
  // Upper bound: reasoning models may spend 1-3x extra output on hidden thinking.
  return {
    requests: ai.length,
    freeQuestions: pending.filter(isProcedural).reduce((n, b) => n + b.count, 0),
    aiQuestions,
    inputTokens,
    outputTokens,
    costUsd: [cost, cost * 3],
    minutes: [secs / 60, (secs * 3) / 60],
  };
}
