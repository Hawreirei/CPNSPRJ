import { useSyncExternalStore } from 'react';
import { db, getSettings } from '../db';
import { generateFigural } from '../domain/figural';
import { buildPrompt, buildRewritePrompt, SYSTEM_PROMPT } from '../domain/prompts';
import { parseAiQuestions } from '../domain/schemas';
import { SUBTESTS } from '../domain/types';
import { validateQuestion } from '../domain/validators';
import { complete, isModelUnavailable, ProviderError, suggestedReplacement } from '../providers';
import type { ProviderConfig } from '../providers';
import type { ApiKeyRecord, PlanBatch, QSet, Question } from '../domain/types';
import { uid } from '../lib/id';
import { batchLabel, isProcedural } from './plan';
import { freshProviderConfig, providerConfig, refreshKeyModel, resolveKey } from './keys';
import { isLimited, keyUsage, limitsOf, markDayExhausted, QuotaExhaustedError, releaseRequest, reserveRequest } from './quota';

export interface GenProgress {
  setId: string;
  running: boolean;
  done: number;
  total: number;
  current: string[];
  log: { at: number; level: 'info' | 'error'; message: string }[];
  /** Set while the run waits for a per-minute quota window. */
  waitUntil?: number;
  waitReason?: string;
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
  key: Pick<ApiKeyRecord, 'id' | 'provider' | 'limits'>;
  swapped?: Promise<void>;
  onSwap?: (from: string, to: string) => void;
  onWait?: (ms: number, reason: string) => void;
}

async function openSession(keyId?: string, modelOverride?: string): Promise<ModelSession> {
  const { keyId: id, autoModel, ...cfg } = await freshProviderConfig(keyId, modelOverride);
  const rec = (await resolveKey(id))!;
  return { cfg, keyId: id, autoModel, key: { id: rec.id, provider: rec.provider, limits: rec.limits } };
}

/** Rough input-token count used for the per-minute token limit. */
const estimateTokens = (text: string) => Math.ceil(text.length / 3.5);
const MAX_RATE_WAITS = 6;

/** Switch to the newest stable model once per session when the provider says the current one is gone. */
async function swapModel(s: ModelSession, errorMessage = ''): Promise<boolean> {
  if (!s.autoModel) return false;
  if (!s.swapped) {
    const from = s.cfg.model;
    s.swapped = (async () => {
      const { model } = await refreshKeyModel(s.keyId, { exclude: from, hint: suggestedReplacement(errorMessage) });
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
  let rateWaits = 0;
  // A limited daily quota makes every retry expensive: allow one retry instead of two.
  const maxAttempts = limitsOf(session.key).rpd ? 2 : 3;
  const est = estimateTokens(SYSTEM_PROMPT + prompt);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const model = session.cfg.model;
    // Throws QuotaExhaustedError when today's quota is used up; waits for the minute window otherwise.
    const slot = await reserveRequest(session.key, est, { signal, onWait: session.onWait });
    try {
      const res = await complete(session.cfg, { system: SYSTEM_PROMPT, prompt, signal });
      await onUsage(res.inputTokens, res.outputTokens);
      return parseAiQuestions(res.text, ctx);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      lastErr = e;
      if (e instanceof ProviderError && e.status === 429) {
        // Rejected by a rate limit: the provider didn't count it, so neither do we.
        await releaseRequest(slot);
        if (e.quotaScope === 'day') {
          throw new QuotaExhaustedError(await markDayExhausted(session.key));
        }
        if (rateWaits++ < MAX_RATE_WAITS) {
          const wait = Math.min(Math.max(e.retryAfterMs ?? 60_000, 5_000), 5 * 60_000);
          session.onWait?.(wait, 'server meminta menunggu (429)');
          await sleep(wait, signal);
          attempt--;
          continue;
        }
        throw e;
      }
      if (e instanceof ProviderError && e.status === undefined) await releaseRequest(slot);
      if (e instanceof ProviderError && !triedSwap && isModelUnavailable(e.status, e.message)) {
        triedSwap = true;
        // Another worker may already have swapped; otherwise refresh from the live list.
        if (session.cfg.model !== model || (await swapModel(session, e.message))) {
          attempt--;
          continue;
        }
        if (!session.autoModel) {
          // The user picked this model: don't switch it silently, explain instead.
          const hint = suggestedReplacement(e.message);
          throw new ProviderError(
            `Model ${model} yang Anda pilih sudah tidak tersedia untuk key ini.${hint ? ` Penyedia menyarankan ${hint}.` : ''} Pilih model lain di halaman API Keys (atau "Otomatis"), lalu klik Lanjutkan.`,
            { status: e.status },
          );
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
  // Keep what we got; queue only the missing items instead of redoing the whole batch.
  const leftover = finishBatch(batch, validated.length);
  await db.transaction('rw', db.sets, async () => {
    const cur = await db.sets.get(set.id);
    if (!cur) return;
    const batches = cur.batches.flatMap((b) => (b.id === batch.id ? [leftover.done, ...(leftover.rest ? [leftover.rest] : [])] : [b]));
    await db.sets.update(set.id, { batches, updatedAt: Date.now() });
  });
  return { added: validated.length, rest: leftover.rest };
}

/** Split a batch into the part that was produced and the items still missing. */
export function finishBatch(batch: PlanBatch, produced: number): { done: PlanBatch; rest?: PlanBatch } {
  const n = Math.min(produced, batch.count);
  const done: PlanBatch = { ...batch, items: batch.items.slice(0, n), count: n, status: 'done', error: undefined };
  if (n >= batch.count) return { done: { ...done, items: batch.items, count: batch.count } };
  const items = batch.items.slice(n);
  return {
    done,
    rest: { id: uid(), subtest: batch.subtest, items, count: items.length, status: 'pending', basedOn: batch.basedOn?.slice(n) },
  };
}

async function setBatch(setId: string, batchId: string, patch: Partial<PlanBatch>) {
  await db.transaction('rw', db.sets, async () => {
    const set = await db.sets.get(setId);
    if (!set) return;
    await db.sets.update(setId, { batches: set.batches.map((b) => (b.id === batchId ? { ...b, ...patch } : b)), updatedAt: Date.now() });
  });
}

const label = batchLabel;

const fmtWait = (ms: number) => (ms >= 60_000 ? `${Math.ceil(ms / 60_000)} menit` : `${Math.ceil(ms / 1000)} detik`);

export function isRunning(setId: string) {
  return controllers.has(setId);
}

export const isAnyGenerationRunning = () => controllers.size > 0;

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
      session = await openSession(set.keyId, set.model);
      session.onSwap = (from, to) => log(setId, 'info', `Model ${from} tidak tersedia lagi; otomatis beralih ke ${to}.`);
      session.onWait = (ms, reason) => {
        update(setId, { waitUntil: Date.now() + ms, waitReason: reason });
        log(setId, 'info', `Menunggu ${fmtWait(ms)} (${reason}) agar tidak melewati batas kuota.`);
      };
      const u = await keyUsage(session.key);
      if (u.blockedUntil || (u.remainingToday !== null && u.remainingToday <= 0)) {
        throw new QuotaExhaustedError(u.blockedUntil ?? u.resetAt, u.today, u.limits.rpd);
      }
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
  const aiBatches = todo.filter((b) => !isProcedural(b)).length;
  const limited = session ? isLimited(limitsOf(session.key)) : false;
  if (session && limited) {
    const u = await keyUsage(session.key);
    log(
      setId,
      'info',
      `Mulai: ${aiBatches} request AI · model ${session.cfg.model} · kuota hari ini ${u.remainingToday === null ? 'tanpa batas' : `sisa ${u.remainingToday}/${u.limits.rpd}`}` +
        (u.limits.rpm ? ` · maks ${u.limits.rpm}/menit` : '') +
        '.',
    );
  } else {
    log(setId, 'info', `Mulai: ${todo.length} batch${session ? ` · model ${session.cfg.model}` : ''}.`);
  }

  const hashes = await knownHashes();
  // Procedural (free) batches first, so they're done even if the AI quota runs out.
  const queue = [...todo.filter(isProcedural), ...todo.filter((b) => !isProcedural(b))];
  let failures = 0;
  let quotaStop: QuotaExhaustedError | null = null;
  const worker = async () => {
    while (queue.length && !ctrl.signal.aborted) {
      const batch = queue.shift()!;
      update(setId, { current: [...(progress.get(setId)?.current ?? []), label(batch)] });
      try {
        const r = await runBatch(set, batch, session, hashes, ctrl.signal);
        update(setId, { done: (progress.get(setId)?.done ?? 0) + r.added, waitUntil: undefined, waitReason: undefined });
        if (r.rest) {
          log(setId, 'info', `${label(batch)}: ${r.added}/${batch.count} soal diterima; ${r.rest.count} sisanya diminta ulang.`);
          queue.push(r.rest);
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') break;
        if (e instanceof QuotaExhaustedError) {
          // Not a failure of this batch: leave it pending and stop the run for today.
          quotaStop = e;
          ctrl.abort();
          break;
        }
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
  // Keys with a per-minute limit run one request at a time.
  const concurrency = limited && session && limitsOf(session.key).rpm ? 1 : Math.max(1, settings.concurrency);
  await Promise.all(Array.from({ length: concurrency }, worker));

  controllers.delete(setId);
  const final = await db.sets.get(setId);
  const allDone = final?.batches.every((b) => b.status === 'done');
  await db.sets.update(setId, { status: allDone ? 'ready' : 'paused', updatedAt: Date.now() });
  update(setId, { running: false, current: [], waitUntil: undefined, waitReason: undefined });
  if (quotaStop) log(setId, 'error', `${(quotaStop as QuotaExhaustedError).message} Soal yang sudah jadi tetap tersimpan.`);
  else log(setId, failures ? 'error' : 'info', allDone ? 'Selesai.' : ctrl.signal.aborted ? 'Dihentikan. Klik Lanjutkan untuk meneruskan.' : `${failures} batch gagal. Klik Lanjutkan untuk mencoba lagi.`);
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
