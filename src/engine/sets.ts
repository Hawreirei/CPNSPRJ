import { db, getSettings } from '../db';
import { scaledPassing } from '../domain/blueprint';
import { SUBTESTS } from '../domain/types';
import { shuffle, uid } from '../lib/id';
import type { BatchItem, Blueprint, PlanBatch, QSet, Question, Subtest, TopicResult } from '../domain/types';
import { chunkItems, planBatches } from './plan';

function newSet(partial: Pick<QSet, 'name' | 'blueprint' | 'source'> & Partial<QSet>): QSet {
  const now = Date.now();
  return {
    id: uid(),
    questionIds: [],
    status: 'draft',
    batches: [],
    usage: { inputTokens: 0, outputTokens: 0, requests: 0 },
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export async function createAiSet(name: string, blueprint: Blueprint, keyId?: string, model?: string): Promise<QSet> {
  const settings = await getSettings();
  const set = newSet({ name, blueprint, source: 'ai', keyId, model, batches: planBatches(blueprint, settings.questionsPerRequest) });
  await db.sets.add(set);
  return set;
}

/** Pick questions from the bank matching the blueprint. No AI cost. */
export async function pickFromBank(blueprint: Blueprint, opts: { starredOnly?: boolean; excludeFlagged?: boolean } = {}) {
  const picked: Question[] = [];
  const shortfall: { subtest: Subtest; missing: number }[] = [];
  for (const sec of blueprint.sections) {
    const pool = await db.questions
      .where('subtest')
      .equals(sec.subtest)
      .filter(
        (q) =>
          sec.topics.includes(q.topic) &&
          (sec.difficulty === 'campuran' || q.difficulty === sec.difficulty) &&
          (!opts.starredOnly || q.starred) &&
          (!opts.excludeFlagged || !q.flags.some((f) => f.severity === 'warn')),
      )
      .toArray();
    // Spread across topics: round-robin over shuffled per-topic pools.
    const byTopic = new Map<string, Question[]>();
    for (const q of shuffle(pool)) byTopic.set(q.topic, [...(byTopic.get(q.topic) ?? []), q]);
    const lists = shuffle([...byTopic.values()]);
    const chosen: Question[] = [];
    while (chosen.length < sec.count && lists.some((l) => l.length)) {
      for (const l of lists) {
        const q = l.shift();
        if (q && chosen.length < sec.count) chosen.push(q);
      }
    }
    picked.push(...chosen);
    if (chosen.length < sec.count) shortfall.push({ subtest: sec.subtest, missing: sec.count - chosen.length });
  }
  return { picked, shortfall };
}

export async function createBankSet(name: string, blueprint: Blueprint, questions: Question[]): Promise<QSet> {
  const ordered = [...questions].sort((a, b) => SUBTESTS.indexOf(a.subtest) - SUBTESTS.indexOf(b.subtest));
  const set = newSet({ name, blueprint, source: 'bank', status: 'ready', questionIds: ordered.map((q) => q.id) });
  await db.sets.add(set);
  return set;
}

/** A fresh set mirroring an existing one: same topics, difficulty and count, new questions. */
export async function createVariantSet(source: QSet): Promise<QSet> {
  const settings = await getSettings();
  const questions = (await db.questions.bulkGet(source.questionIds)).filter((q): q is Question => !!q);
  const batches: PlanBatch[] = [];
  for (const s of SUBTESTS) {
    const qs = questions.filter((q) => q.subtest === s);
    const figural = qs.filter((q) => q.source === 'procedural');
    const ai = qs.filter((q) => q.source !== 'procedural');
    const items = (list: Question[]) => list.map((q) => ({ topic: q.topic, difficulty: q.difficulty }));
    batches.push(...chunkItems(s, items(figural), settings.questionsPerRequest));
    batches.push(...chunkItems(s, items(ai), settings.questionsPerRequest, ai.map((q) => q.id)));
  }
  const set = newSet({ name: `${source.name} (varian)`, blueprint: source.blueprint, source: 'variant', keyId: source.keyId, batches });
  await db.sets.add(set);
  return set;
}

/** Retry-weak-topics set: bank first, AI only for what the bank can't cover. */
export async function createRemedialSet(weak: TopicResult[], perTopic = 5, attemptedIds: string[] = []): Promise<QSet> {
  const settings = await getSettings();
  const exclude = new Set(attemptedIds);
  const picked: Question[] = [];
  const batches: PlanBatch[] = [];
  const needed: Record<Subtest, BatchItem[]> = { TWK: [], TIU: [], TKP: [] };
  for (const t of weak) {
    const pool = shuffle(await db.questions.where('topic').equals(t.topic).filter((q) => q.subtest === t.subtest && !exclude.has(q.id)).toArray());
    const take = pool.slice(0, perTopic);
    picked.push(...take);
    const missing = perTopic - take.length;
    if (missing > 0) needed[t.subtest].push(...Array.from({ length: missing }, () => ({ topic: t.topic, difficulty: 'sedang' as const })));
  }
  for (const s of SUBTESTS) batches.push(...chunkItems(s, needed[s], settings.questionsPerRequest));
  const counts: Record<Subtest, number> = { TWK: 0, TIU: 0, TKP: 0 };
  for (const t of weak) counts[t.subtest] += perTopic;
  const blueprint: Blueprint = {
    sections: SUBTESTS.filter((s) => counts[s]).map((s) => ({
      subtest: s,
      count: counts[s],
      topics: weak.filter((w) => w.subtest === s).map((w) => w.topic),
      difficulty: 'campuran' as const,
    })),
    durationMinutes: Math.max(10, Math.round((settings.durationMinutes * weak.length * perTopic) / 110)),
    passing: Object.fromEntries(SUBTESTS.map((s) => [s, scaledPassing(s, counts[s], settings)])) as Record<Subtest, number>,
  };
  const ordered = picked.sort((a, b) => SUBTESTS.indexOf(a.subtest) - SUBTESTS.indexOf(b.subtest));
  const set = newSet({
    name: `Latihan topik lemah ${new Date().toLocaleDateString('id-ID')}`,
    blueprint,
    source: 'remedial',
    questionIds: ordered.map((q) => q.id),
    batches,
    status: batches.length ? 'paused' : 'ready',
  });
  await db.sets.add(set);
  return set;
}

export async function deleteSet(id: string, alsoQuestions: boolean) {
  await db.transaction('rw', [db.sets, db.questions, db.attempts, db.reviews], async () => {
    const set = await db.sets.get(id);
    if (!set) return;
    if (alsoQuestions) {
      // Only delete questions not used by another set.
      const others = await db.sets.filter((s) => s.id !== id).toArray();
      const used = new Set(others.flatMap((s) => s.questionIds));
      const unused = set.questionIds.filter((q) => !used.has(q));
      await db.questions.bulkDelete(unused);
      await db.reviews.bulkDelete(unused);
    }
    await db.sets.delete(id);
  });
}

export async function removeFromSet(setId: string, questionId: string) {
  const set = await db.sets.get(setId);
  if (!set) return;
  await db.sets.update(setId, { questionIds: set.questionIds.filter((x) => x !== questionId), updatedAt: Date.now() });
}

export async function moveInSet(setId: string, questionId: string, delta: number) {
  const set = await db.sets.get(setId);
  if (!set) return;
  const ids = [...set.questionIds];
  const i = ids.indexOf(questionId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await db.sets.update(setId, { questionIds: ids, updatedAt: Date.now() });
}

/** Passing threshold for a set: blueprint value, scaled when the set is partial. */
export async function passingForSet(set: QSet, questions: Question[]): Promise<Record<Subtest, number>> {
  const settings = await getSettings();
  const out = { ...set.blueprint.passing };
  for (const s of SUBTESTS) {
    const n = questions.filter((q) => q.subtest === s).length;
    if (n && n !== settings.counts[s]) out[s] = scaledPassing(s, n, { passing: set.blueprint.passing, counts: settings.counts });
  }
  return out;
}
