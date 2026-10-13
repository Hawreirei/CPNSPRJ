import { expect } from 'vitest';
import type { Rand } from '../domain/figural';
import { describePic } from '../domain/describe';
import { picKey } from '../domain/pic';
import type { Pic, Question } from '../domain/types';

/** Small deterministic generator, so a failure names a seed that reproduces it. */
export function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const keyIdx = (q: Question) => q.options.findIndex((o) => o.label === q.answer);
export const pics = (q: Question) => q.options.map((o) => o.figure!) as Pic[];

export function expectWellFormed(q: Question, ctx: string) {
  expect(q.options, ctx).toHaveLength(5);
  expect(
    q.options.filter((o) => o.score === 5),
    ctx,
  ).toHaveLength(1);
  expect(q.options.find((o) => o.score === 5)?.label, ctx).toBe(q.answer);
  expect(new Set(q.options.map((o) => picKey(o.figure!))).size, `${ctx}: two options look the same`).toBe(5);
  // A screen reader hears five different options too.
  expect(new Set(q.options.map((o) => o.text)).size, `${ctx}: two options read the same`).toBe(5);
  for (const o of q.options) expect(o.text).toBe(describePic(o.figure!));
  expect(q.figureMeta?.archetype, ctx).toBeTruthy();
  expect(q.figureMeta!.signature.startsWith(q.figureMeta!.archetype), ctx).toBe(true);
  expect(q.explanation, ctx).toMatch(new RegExp(`\\b${q.answer}\\b`));
}
