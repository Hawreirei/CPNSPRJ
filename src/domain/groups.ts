import { shuffle } from '../lib/id';
import type { Question } from './types';

/*
 * Questions that share a reading passage form a group that must stay together, in its own order:
 * when a set is shuffled, reordered, built from the bank or extended.
 */

type Grouped = Pick<Question, 'id' | 'passage'>;

/** Questions in units: a passage group (members gathered at the first one, in reading order), or a single question. */
export function units<T extends Grouped>(questions: T[]): T[][] {
  const out: T[][] = [];
  const byPassage = new Map<string, T[]>();
  for (const q of questions) {
    const key = q.passage?.id;
    if (!key) {
      out.push([q]);
      continue;
    }
    const unit = byPassage.get(key);
    if (unit) unit.push(q);
    else {
      const fresh = [q];
      byPassage.set(key, fresh);
      out.push(fresh);
    }
  }
  for (const u of byPassage.values()) {
    const order = u[0].passage?.questionIds;
    // Unknown ids (a group older than the order list) keep their place after the known ones.
    if (order) u.sort((a, b) => rank(order, a.id) - rank(order, b.id));
  }
  return out;
}

const rank = (order: string[], id: string) => {
  const i = order.indexOf(id);
  return i < 0 ? order.length : i;
};

/** The same questions with every passage group made contiguous. */
export const keepGroupsTogether = <T extends Grouped>(questions: T[]): T[] => units(questions).flat();

/** Shuffle whole units: groups move as one block and keep their inner order. */
export const shuffleUnits = <T extends Grouped>(questions: T[], r: () => number = Math.random): T[] => shuffle(units(questions), r).flat();

/** Move the unit holding `id` one unit up or down. Returns the new order, or the same one at an edge. */
export function moveUnit<T extends Grouped>(questions: T[], id: string, delta: -1 | 1): T[] {
  const us = units(questions);
  const i = us.findIndex((u) => u.some((q) => q.id === id));
  const j = i + delta;
  if (i < 0 || j < 0 || j >= us.length) return questions;
  [us[i], us[j]] = [us[j], us[i]];
  return us.flat();
}

/** Take whole units, in order, up to `count` questions; a group that would overflow is skipped. */
export function takeUnits<T extends Grouped>(pool: T[], count: number): T[] {
  const out: T[] = [];
  for (const u of units(pool)) if (out.length + u.length <= count) out.push(...u);
  return out;
}

/** Where `id`'s group ends in `ids`, so questions inserted "after" it don't split the group. */
export function endOfGroup<T extends Grouped>(ordered: T[], id: string): string {
  const q = ordered.find((x) => x.id === id);
  if (!q?.passage) return id;
  const members = ordered.filter((x) => x.passage?.id === q.passage!.id);
  return members[members.length - 1].id;
}

/** "soal 3–5": the numbers of a passage's questions in a list, for its heading. */
export function groupRange<T extends Grouped>(ordered: T[], passageId: string): { first: number; last: number } | null {
  const idx = ordered.flatMap((q, i) => (q.passage?.id === passageId ? [i] : []));
  return idx.length ? { first: idx[0], last: idx[idx.length - 1] } : null;
}

/** Heading for a passage in a numbered list: "Bacaan untuk soal 3–5". */
export function passageLabel<T extends Grouped>(ordered: T[], q: T): string {
  const r = q.passage && groupRange(ordered, q.passage.id);
  if (!r) return 'Bacaan';
  return r.first === r.last ? `Bacaan untuk soal ${r.first + 1}` : `Bacaan untuk soal ${r.first + 1}–${r.last + 1}`;
}

/** Whether `q` opens its passage group in `ordered` (and so should show the passage in full). */
export const opensGroup = <T extends Grouped>(ordered: T[], q: T): boolean => !!q.passage && ordered.find((x) => x.passage?.id === q.passage!.id) === q;
