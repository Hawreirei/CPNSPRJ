import { db, getSettings } from '../db';
import { fullExam, fullExamOf, scaledPassing } from '../domain/blueprint';
import { inExamOrder, inSubtestOrder, packageOf, subtestsIn } from '../domain/examPackage';
import { bankPriority, isReported } from '../domain/quality';
import { keepGroupsTogether, moveUnit, takeUnits, units } from '../domain/groups';
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

/**
 * Pick questions from the bank matching the blueprint. No AI cost. Reported questions are left
 * out unless asked for, and low-rated ones are only used once the rest of a topic runs out.
 */
export async function pickFromBank(blueprint: Blueprint, opts: { starredOnly?: boolean; excludeFlagged?: boolean; includeReported?: boolean } = {}) {
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
          (!opts.excludeFlagged || !q.flags.some((f) => f.severity === 'warn')) &&
          (opts.includeReported || !isReported(q)),
      )
      .toArray();
    // Spread across topics: round-robin over shuffled per-topic pools, best-rated first within each.
    // A reading passage's questions come as one unit, or not at all if they don't fit.
    const byTopic = new Map<string, Question[][]>();
    const ranked = units(shuffle(pool)).sort((a, b) => Math.max(...a.map(bankPriority)) - Math.max(...b.map(bankPriority)));
    for (const u of ranked) byTopic.set(u[0].topic, [...(byTopic.get(u[0].topic) ?? []), u]);
    const lists = shuffle([...byTopic.values()]);
    const chosen: Question[] = [];
    while (chosen.length < sec.count && lists.some((l) => l.length)) {
      for (const l of lists) {
        const at = l.findIndex((u) => chosen.length + u.length <= sec.count);
        if (at < 0) l.length = 0;
        else chosen.push(...l.splice(at, 1)[0]);
      }
    }
    picked.push(...chosen);
    if (chosen.length < sec.count) shortfall.push({ subtest: sec.subtest, missing: sec.count - chosen.length });
  }
  return { picked, shortfall };
}

export async function createBankSet(name: string, blueprint: Blueprint, questions: Question[]): Promise<QSet> {
  const ordered = keepGroupsTogether(inSubtestOrder(questions));
  const set = newSet({ name, blueprint, source: 'bank', status: 'ready', questionIds: ordered.map((q) => q.id) });
  await db.sets.add(set);
  return set;
}

/** A fresh set mirroring an existing one: same topics, difficulty and count, new questions. */
export async function createVariantSet(source: QSet): Promise<QSet> {
  const settings = await getSettings();
  const questions = (await db.questions.bulkGet(source.questionIds)).filter((q): q is Question => !!q);
  const batches: PlanBatch[] = [];
  for (const s of subtestsIn(questions)) {
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
  const needed: Record<Subtest, BatchItem[]> = {};
  for (const t of weak) {
    const pool = shuffle(await db.questions.where('topic').equals(t.topic).filter((q) => q.subtest === t.subtest && !exclude.has(q.id) && !isReported(q)).toArray()).sort(
      (a, b) => bankPriority(a) - bankPriority(b),
    );
    const take = takeUnits(pool, perTopic);
    picked.push(...take);
    const missing = perTopic - take.length;
    if (missing > 0) (needed[t.subtest] ??= []).push(...Array.from({ length: missing }, () => ({ topic: t.topic, difficulty: 'sedang' as const })));
  }
  for (const s of inExamOrder(Object.keys(needed))) batches.push(...chunkItems(s, needed[s], settings.questionsPerRequest));
  const counts: Record<Subtest, number> = {};
  for (const t of weak) counts[t.subtest] = (counts[t.subtest] ?? 0) + perTopic;
  const subtests = inExamOrder(Object.keys(counts));
  const full = fullExamOf(packageOf(subtests[0] ?? 'TWK'), settings);
  const blueprint: Blueprint = {
    sections: subtests.map((s) => ({
      subtest: s,
      count: counts[s],
      topics: weak.filter((w) => w.subtest === s).map((w) => w.topic),
      difficulty: 'campuran' as const,
    })),
    durationMinutes: Math.max(10, Math.round((full.durationMinutes * weak.length * perTopic) / (full.total || 110))),
    passing: Object.fromEntries(subtests.map((s) => [s, scaledPassing(fullExam(s, settings).passing, counts[s], fullExam(s, settings).count)])),
  };
  const ordered = keepGroupsTogether(inSubtestOrder(picked));
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

/** Move a question one place, or its whole reading-passage group past the neighbouring question or group. */
export async function moveInSet(setId: string, questionId: string, delta: -1 | 1) {
  const set = await db.sets.get(setId);
  if (!set) return;
  const questions = (await db.questions.bulkGet(set.questionIds)).filter((q): q is Question => !!q);
  const ids = moveUnit(questions, questionId, delta).map((q) => q.id);
  await db.sets.update(setId, { questionIds: ids, updatedAt: Date.now() });
}

/** Passing threshold for a set: blueprint value, scaled when the set is partial. */
export async function passingForSet(set: QSet, questions: Question[]): Promise<Partial<Record<Subtest, number>>> {
  const settings = await getSettings();
  const out: Partial<Record<Subtest, number>> = {};
  for (const s of subtestsIn(questions)) {
    const mark = scaledPassing(set.blueprint.passing[s], questions.filter((q) => q.subtest === s).length, fullExam(s, settings).count);
    if (mark !== undefined) out[s] = mark;
  }
  return out;
}
