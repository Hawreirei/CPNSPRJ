import { useSyncExternalStore } from 'react';
import { db, getSettings } from '../db';
import { generateFigural } from '../domain/figural';
import { buildPrompt, buildRewritePrompt, SYSTEM_PROMPT } from '../domain/prompts';
import { parseAiQuestions } from '../domain/schemas';
import { SUBTESTS } from '../domain/types';
import { validateQuestion } from '../domain/validators';
import { complete, isModelUnavailable, ProviderError } from '../providers';
import type { ProviderConfig } from '../providers';
import type { PlanBatch, QSet, Question } from '../domain/types';
import { batchLabel, isProcedural } from './plan';
import { freshProviderConfig, providerConfig, refreshKeyModel } from './keys';

export interface GenProgress {
  setId: string;
  running: boolean;
  done: number;
  total: number;
  current: string[];
  log: { at: number; level: 'info' | 'error'; message: string }[];
}

// ---- tiny external store so progress survives page navigation ----
const progress = new Map<string, GenProgress>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
let snapshot = new Map(progress);
function emit() {
  snapshot = new Map(progress);
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useGenProgress(setId: string | undefined): GenProgress | undefined {
  const map = useSyncExternalStore(subscribe, () => snapshot);
  return setId ? map.get(setId) : undefined;
}
function update(setId: string, patch: Partial<GenProgress>) {
  const cur = progress.get(setId) ?? { setId, running: false, done: 0, total: 0, current: [], log: [] };
  progress.set(setId, { ...cur, ...patch });
  emit();
}
function log(setId: string, level: 'info' | 'error', message: string) {
  const cur = progress.get(setId);
  update(setId, { log: [...(cur?.log ?? []), { at: Date.now(), level, message }].slice(-50) });
}

const subtestOrder = (q: Question) => SUBTESTS.indexOf(q.subtest);

/** Append questions to a set, keeping TWK → TIU → TKP grouping. */
export async function appendToSet(setId: string, questions: Question[], afterId?: string) {
  await db.transaction('rw', db.sets, db.questions, async () => {
    const set = await db.sets.get(setId);
    if (!set) return;
    await db.questions.bulkPut(questions);
    let ids = [...set.questionIds];
    if (afterId && ids.includes(afterId)) {
      ids.splice(ids.indexOf(afterId) + 1, 0, ...questions.map((q) => q.id));
    } else {
      ids.push(...questions.map((q) => q.id));
      const all = (await db.questions.bulkGet(ids)).filter((q): q is Question => !!q);
      ids = all.map((q, i) => ({ q, i })).sort((a, b) => subtestOrder(a.q) - subtestOrder(b.q) || a.i - b.i).map((x) => x.q.id);
    }
    await db.sets.update(setId, { questionIds: ids, updatedAt: Date.now() });
  });
}

async function knownHashes(): Promise<Set<string>> {
  const hashes = new Set<string>();
  await db.questions.each((q) => hashes.add(q.hash));
  return hashes;
}

async function recentStems(subtest: string, topics: string[]): Promise<string[]> {
  const per = Math.max(2, Math.ceil(15 / topics.length));
  const out: string[] = [];
  for (const t of topics) {
    const rows = await db.questions.where('topic').equals(t).filter((q) => q.subtest === subtest).reverse().limit(per).toArray();
    out.push(...rows.map((q) => q.stem));
  }
  return out;
}

async function addUsage(setId: string, inputTokens: number, outputTokens: number) {
  const set = await db.sets.get(setId);
  if (!set) return;
  await db.sets.update(setId, {
    usage: {
      inputTokens: set.usage.inputTokens + inputTokens,
      outputTokens: set.usage.outputTokens + outputTokens,
      requests: set.usage.requests + 1,
    },
  });
}

/** Provider config shared by one run; swapped in place if the model is retired mid-run. */
interface ModelSession {
  cfg: ProviderConfig;
  keyId: string;
  autoModel: boolean;
  swapped?: Promise<void>;
  onSwap?: (from: string, to: string) => void;
}

async function openSession(keyId?: string): Promise<ModelSession> {
  const { keyId: id, autoModel, ...cfg } = await freshProviderConfig(keyId);
  return { cfg, keyId: id, autoModel };
}

/** Switch to the newest stable model once per session when the provider says the current one is gone. */
async function swapModel(s: ModelSession): Promise<boolean> {
  if (!s.autoModel) return false;
  if (!s.swapped) {
    const from = s.cfg.model;
    s.swapped = (async () => {
      const { model } = await refreshKeyModel(s.keyId);
      s.cfg = await providerConfig(s.keyId);
      if (model !== from) s.onSwap?.(from, model);
    })();
    try {
      await s.swapped;
    } catch {
      return false;
    }
    return s.cfg.model !== from;
  }
  await s.swapped.catch(() => undefined);
  return true;
}

/** Call the model and parse; retries on parse or transient errors and recovers from a retired model. */
async function callAndParse(
  session: ModelSession,
  prompt: string,
  ctx: Parameters<typeof parseAiQuestions>[1],
  signal: AbortSignal,
  onUsage: (i: number, o: number) => Promise<void>,
): Promise<Question[]> {
  let lastErr: unknown;
  let triedSwap = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const model = session.cfg.model;
    try {
      const res = await complete(session.cfg, { system: SYSTEM_PROMPT, prompt, signal });
      await onUsage(res.inputTokens, res.outputTokens);
      return parseAiQuestions(res.text, ctx);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      lastErr = e;
      if (e instanceof ProviderError && !triedSwap && isModelUnavailable(e.status, e.message)) {
        triedSwap = true;
        // Another worker may already have swapped; otherwise refresh from the live list.
        if (session.cfg.model !== model || (await swapModel(session))) {
          attempt--;
          continue;
        }
      }
      const retryable = !(e instanceof ProviderError) || e.retryable;
      if (!retryable) break;
      await sleep(1500 * 2 ** attempt, signal);
    }
  }
  throw lastErr;
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

async function runBatch(set: QSet, batch: PlanBatch, session: ModelSession | null, hashes: Set<string>, signal: AbortSignal) {
  let questions: Question[];
  if (isProcedural(batch)) {
    questions = generateFigural(batch.items[0].topic, batch.items[0].difficulty, batch.count);
  } else {
    if (!session) throw new Error('Belum ada API key.');
    const basedOn = batch.basedOn ? ((await db.questions.bulkGet(batch.basedOn)).filter(Boolean) as Question[]) : undefined;
    const prompt = buildPrompt({
      subtest: batch.subtest,
      items: batch.items,
      avoid: await recentStems(batch.subtest, [...new Set(batch.items.map((i) => i.topic))]),
      basedOn,
    });
    questions = await callAndParse(session, prompt, { subtest: batch.subtest, items: batch.items, setId: set.id }, signal, (i, o) => addUsage(set.id, i, o));
    questions = questions.slice(0, batch.count);
  }
  const validated = questions.map((q) => {
    const v = validateQuestion({ ...q, originSetId: set.id }, hashes);
    hashes.add(v.hash);
    return v;
  });
  await appendToSet(set.id, validated);
  await setBatch(set.id, batch.id, { status: 'done', error: undefined });
  return validated.length;
}

async function setBatch(setId: string, batchId: string, patch: Partial<PlanBatch>) {
  await db.transaction('rw', db.sets, async () => {
    const set = await db.sets.get(setId);
    if (!set) return;
    await db.sets.update(setId, { batches: set.batches.map((b) => (b.id === batchId ? { ...b, ...patch } : b)), updatedAt: Date.now() });
  });
}

const label = batchLabel;

export function isRunning(setId: string) {
  return controllers.has(setId);
}

/** Generate every pending or failed batch. Safe to call again to resume. */
export async function startGeneration(setId: string): Promise<void> {
  if (controllers.has(setId)) return;
  const set = await db.sets.get(setId);
  if (!set) return;
  const settings = await getSettings();
  const todo = set.batches.filter((b) => b.status !== 'done');
  const total = set.batches.reduce((n, b) => n + b.count, 0);
  const doneCount = set.batches.filter((b) => b.status === 'done').reduce((n, b) => n + b.count, 0);

  let session: ModelSession | null = null;
  if (todo.some((b) => !isProcedural(b))) {
    try {
      session = await openSession(set.keyId);
      session.onSwap = (from, to) => log(setId, 'info', `Model ${from} tidak tersedia lagi; otomatis beralih ke ${to}.`);
    } catch (e) {
      update(setId, { running: false, total, done: doneCount });
      log(setId, 'error', (e as Error).message);
      return;
    }
  }

  const ctrl = new AbortController();
  controllers.set(setId, ctrl);
  await db.sets.update(setId, { status: 'generating' });
  update(setId, { running: true, total, done: doneCount, current: [], log: [] });
  log(setId, 'info', `Mulai: ${todo.length} batch${session ? ` · model ${session.cfg.model}` : ''}.`);

  const hashes = await knownHashes();
  const queue = [...todo];
  let failures = 0;
  const worker = async () => {
    while (queue.length && !ctrl.signal.aborted) {
      const batch = queue.shift()!;
      update(setId, { current: [...(progress.get(setId)?.current ?? []), label(batch)] });
      try {
        const n = await runBatch(set, batch, session, hashes, ctrl.signal);
        update(setId, { done: (progress.get(setId)?.done ?? 0) + n });
      } catch (e) {
        if ((e as Error).name === 'AbortError') break;
        failures++;
        const msg = (e as Error).message ?? String(e);
        await setBatch(setId, batch.id, { status: 'failed', error: msg });
        log(setId, 'error', `${label(batch)}: ${msg}`);
        // Stop early on auth errors: every other batch would fail the same way.
        if (e instanceof ProviderError && (e.status === 401 || e.status === 403)) ctrl.abort();
      } finally {
        update(setId, { current: (progress.get(setId)?.current ?? []).filter((c) => c !== label(batch)) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, settings.concurrency) }, worker));

  controllers.delete(setId);
  const final = await db.sets.get(setId);
  const allDone = final?.batches.every((b) => b.status === 'done');
  await db.sets.update(setId, { status: allDone ? 'ready' : 'paused', updatedAt: Date.now() });
  update(setId, { running: false, current: [] });
  log(setId, failures ? 'error' : 'info', allDone ? 'Selesai.' : ctrl.signal.aborted ? 'Dihentikan. Klik Lanjutkan untuk meneruskan.' : `${failures} batch gagal. Klik Lanjutkan untuk mencoba lagi.`);
}

export async function stopGeneration(setId: string) {
  controllers.get(setId)?.abort();
}

/** Rewrite one question in place (keeps id and position). */
export async function rewriteQuestion(q: Question, instruction: string, keyId?: string): Promise<Question> {
  const session = await openSession(keyId);
  const ctrl = new AbortController();
  const [nq] = await callAndParse(session, buildRewritePrompt(q, instruction), { subtest: q.subtest, items: [{ topic: q.topic, difficulty: q.difficulty }], setId: q.originSetId }, ctrl.signal, async () => {});
  if (!nq) throw new Error('AI tidak mengembalikan soal.');
  const updated = validateQuestion({ ...nq, id: q.id, starred: q.starred, locked: q.locked, createdAt: q.createdAt, updatedAt: Date.now() });
  await db.questions.put(updated);
  return updated;
}

/** Generate `count` new questions modelled on `q` and insert them right after it. */
export async function moreLikeThis(setId: string, q: Question, count: number, keyId?: string): Promise<number> {
  let questions: Question[];
  if (q.source === 'procedural') {
    questions = generateFigural(q.topic, q.difficulty, count);
  } else {
    const session = await openSession(keyId);
    const items = Array.from({ length: count }, () => ({ topic: q.topic, difficulty: q.difficulty }));
    const prompt = buildPrompt({
      subtest: q.subtest,
      items,
      avoid: [q.stem],
      instruction: `Semua soal meniru gaya, jenis, dan tingkat kesulitan soal contoh ini, tetapi dengan isi, angka, dan konteks berbeda: "${q.stem.slice(0, 600)}"`,
    });
    const ctrl = new AbortController();
    questions = await callAndParse(session, prompt, { subtest: q.subtest, items, setId }, ctrl.signal, (i, o) => addUsage(setId, i, o));
  }
  const hashes = await knownHashes();
  const validated = questions.slice(0, count).map((x) => validateQuestion(x, hashes));
  await appendToSet(setId, validated, q.id);
  return validated.length;
}

/** Recover sets left in "generating" after a reload. */
export async function recoverInterrupted() {
  await db.sets.where('status').equals('generating').modify({ status: 'paused' });
}
