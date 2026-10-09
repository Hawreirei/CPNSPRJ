import { db, getSetQuestions } from '../db';
import { units } from '../domain/groups';
import { SHARED_FLAG_KINDS, toShared, type SharedQuestion, type SharedSet } from '../domain/share';
import { inExamOrder, isSkd, packageOf } from '../domain/examPackage';
import { SUBTESTS } from '../domain/types';
import type { QSet, Question, Subtest } from '../domain/types';
import { loadMath, validateQuestion } from '../domain/validators';
import { hashText, uid } from '../lib/id';
import { addCarriedPackages, carriedPackages } from './examPackages';
import { createBankSet } from './sets';

/** The set as shared, and how many of its questions came from the learner's photos or PDFs. */
export async function sharedSetOf(setId: string, opts: Parameters<typeof toShared>[3] = {}): Promise<{ shared: SharedSet; imported: number }> {
  const set = await db.sets.get(setId);
  if (!set) throw new Error('Set tidak ditemukan.');
  const questions = await getSetQuestions(set);
  return { shared: toShared(set.name, set.blueprint, questions, opts), imported: questions.filter((q) => q.source === 'import').length };
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

export interface ImportPreview {
  name: string;
  /** Questions per sub-test, in exam order (SKD sets list all three). */
  perSubtest: Record<Subtest, number>;
  total: number;
  known: number;
  /** Exam packages the set carries that will be added with it. */
  newPackages: { name: string; official: boolean }[];
}

/** What importing would add. Throws when a package the set carries conflicts with the learner's own. */
export async function previewImport(shared: SharedSet): Promise<ImportPreview> {
  const fresh = carriedPackages(shared.packages);
  const { known } = await knownUnits(shared);
  const present = shared.questions.map((q) => q.subtest);
  const skd = present.every((s) => isSkd(packageOf(s)));
  // Sub-tests of a package the receiver does not have yet sort after the rest, in the set's order.
  const order = inExamOrder(skd ? [...SUBTESTS, ...present] : present);
  const perSubtest = Object.fromEntries(order.map((s) => [s, present.filter((x) => x === s).length])) as Record<Subtest, number>;
  return { name: shared.set.name, perSubtest, total: shared.questions.length, known: known.size, newPackages: fresh.map((p) => ({ name: p.name, official: !!p.official })) };
}

/**
 * Add a shared set as a new set. Everything gets new ids, a passage group stays one group, and
 * every question is checked again here, as if it had just been written; questions the bank already
 * has are reused instead of copied.
 */
export async function importShared(shared: SharedSet): Promise<QSet> {
  await loadMath();
  // Packages first: the questions are checked and later scored by their package's rules.
  await addCarriedPackages(shared.packages);
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
  await db.questions
    .where('id')
    .anyOf(fresh.map((q) => q.id))
    .modify({ originSetId: set.id });
  return set;
}
