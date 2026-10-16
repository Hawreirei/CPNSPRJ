import type { Difficulty, Question } from '../types';
import { bagOrder, type Archetype, type Rand } from './build';
import { GLYPH_ARCHETYPES, makeWith } from './legacy';
import { SCENE_ARCHETYPES } from './scene';
import { CUBE_ARCHETYPES } from './cube';
import { MORE_ARCHETYPES } from './more';
import { TABLE_ARCHETYPES } from './numgrid';

export * from './legacy';
export type { Archetype, FiguralTopic } from './build';

/** Every recipe, by topic. */
export const ARCHETYPES: Archetype[] = [...GLYPH_ARCHETYPES, ...SCENE_ARCHETYPES, ...CUBE_ARCHETYPES, ...MORE_ARCHETYPES, ...TABLE_ARCHETYPES];

export interface FiguralOptions {
  /** Signatures of figural questions made recently (the bank), so their patterns come last. */
  recent?: string[];
  /** Only these recipes (the Lab, or practice of one kind of rule). */
  archetypes?: string[];
  /** Only these kinds of rule. */
  families?: string[];
  rand?: Rand;
}

/** Recipes for a topic at a level; empty when the topic is not figural. */
export function archetypesFor(topic: string, difficulty?: Difficulty): Archetype[] {
  return ARCHETYPES.filter((a) => a.topic === topic && (!difficulty || a.levels.includes(difficulty)));
}

/**
 * `count` questions of a figural topic, each from a different recipe and pattern where possible:
 * recipes are drawn from a bag, and a pattern already in the set or recently in the bank is made again.
 */
export function generateFigural(topic: string, difficulty: Difficulty, count: number, opts: FiguralOptions = {}): Question[] {
  const r = opts.rand ?? Math.random;
  let pool = opts.archetypes?.length ? ARCHETYPES.filter((a) => opts.archetypes!.includes(a.id)) : archetypesFor(topic, difficulty);
  if (!pool.length) pool = archetypesFor(topic);
  if (!pool.length) pool = archetypesFor('Deret Figural');
  const recentSigs = new Map<string, number>();
  (opts.recent ?? []).forEach((s, i) => recentSigs.set(s, i + 1));
  const recentArch = (a: Archetype) => (opts.recent ?? []).filter((s) => s.startsWith(`${a.id}|`)).length;
  const order = bagOrder(pool, count, r, recentArch);
  const out: Question[] = [];
  const seen = new Set<string>();
  const sigs = new Set<string>();
  for (const arch of order) {
    let best: Question | null = null;
    // A few tries for a pattern not yet in this set nor recently in the bank.
    for (let t = 0; t < 6; t++) {
      const q = makeWith(arch, arch.levels.includes(difficulty) ? difficulty : arch.levels[arch.levels.length - 1], r, opts.families);
      if (seen.has(q.hash)) continue;
      const sig = q.figureMeta?.signature ?? q.hash;
      if (!best) best = q;
      if (!sigs.has(sig) && !recentSigs.has(sig)) {
        best = q;
        break;
      }
    }
    if (!best) continue;
    seen.add(best.hash);
    sigs.add(best.figureMeta?.signature ?? best.hash);
    out.push(best);
  }
  return out;
}
