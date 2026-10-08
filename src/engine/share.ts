import { db, getSetQuestions } from '../db';
import { units } from '../domain/groups';
import { SHARED_FLAG_KINDS, toShared, type SharedQuestion, type SharedSet } from '../domain/share';
import { SUBTESTS } from '../domain/types';
import type { QSet, Question, Subtest } from '../domain/types';
import { loadMath, validateQuestion } from '../domain/validators';
import { hashText, uid } from '../lib/id';
import { createBankSet } from './sets';

export async function sharedSetOf(setId: string, opts: { includeNotes?: boolean } = {}): Promise<SharedSet> {
  const set = await db.sets.get(setId);
  if (!set) throw new Error('Set tidak ditemukan.');
  return toShared(set.name, set.blueprint, await getSetQuestions(set), opts);
}

const identity = (q: Pick<SharedQuestion, 'stem' | 'passage'>) => hashText((q.passage?.text ?? '') + q.stem);

/** Questions of the shared set that the bank already has, by content; a passage group counts only when all of it is there. */
async function knownUnits(shared: SharedSet): Promise<{ known: Map<string, string>; groups: SharedQuestion[][] }> {
  const byHash = new Map<string, string>();
  await db.questions.each((q) => byHash.set(q.hash, q.id));
  const groups = units(shared.questions);
  const known = new Map<string, string>();
  for (const g of groups) {
    const ids = g.map((q) => byHash.get(identity(q)));
    if (ids.every(Boolean)) g.forEach((q, i) => known.set(q.id, ids[i]!));
  }
  return { known, groups };
}

export async function previewImport(shared: SharedSet): Promise<{ name: string; perSubtest: Record<Subtest, number>; total: number; known: number }> {
  const { known } = await knownUnits(shared);
  const perSubtest = Object.fromEntries(SUBTESTS.map((s) => [s, shared.questions.filter((q) => q.subtest === s).length])) as Record<Subtest, number>;
  return { name: shared.set.name, perSubtest, total: shared.questions.length, known: known.size };
}

/**
 * Add a shared set as a new set. Everything gets new ids, a passage group stays one group, and
 * every question is checked again here, as if it had just been written; questions the bank already
 * has are reused instead of copied.
 */
export async function importShared(shared: SharedSet): Promise<QSet> {
  await loadMath();
  const { known, groups } = await knownUnits(shared);
  const now = Date.now();
  const from = { name: shared.set.name, at: now };
  const fresh: Question[] = [];
  const ordered: string[] = [];
  for (const g of groups) {
    if (g.every((q) => known.has(q.id))) {
      ordered.push(...g.map((q) => known.get(q.id)!));
      continue;
    }
    const ids = g.map(() => uid());
    const passage = g[0].passage ? { ...g[0].passage, id: uid(), questionIds: ids } : undefined;
    g.forEach((sq, i) => {
      const { id: _old, flags, hash: _hash, ...rest } = sq;
      const checked = validateQuestion({
        ...rest,
        id: ids[i],
        ...(passage ? { passage } : {}),
        flags: [],
        locked: false,
        starred: false,
        hash: identity(sq),
        importedFrom: from,
        createdAt: now,
        updatedAt: now,
      });
      // The checks run again; only a second model's opinion is taken from the sender.
      fresh.push({ ...checked, flags: [...checked.flags, ...flags.filter((f) => SHARED_FLAG_KINDS.has(f.kind as never) && f.kind !== 'duplicate')] as Question['flags'] });
      ordered.push(ids[i]);
    });
  }
  await db.questions.bulkPut(fresh);
  const all = (await db.questions.bulkGet(ordered)).filter((q): q is Question => !!q);
  const set = await createBankSet(shared.set.name, shared.set.blueprint, all);
  await db.questions.where('id').anyOf(fresh.map((q) => q.id)).modify({ originSetId: set.id });
  return set;
}
