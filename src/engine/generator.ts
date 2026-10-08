import { useSyncExternalStore } from 'react';
import { db, getSettings } from '../db';
import { endOfGroup } from '../domain/groups';
import { easier } from '../domain/blueprint';
import { buildPassagePrompt, buildPrompt, buildRepairPrompt, buildRewritePrompt } from '../domain/prompts';
import { SUBTESTS } from '../domain/types';
import { loadMath, validateQuestion } from '../domain/validators';
import { ProviderError } from '../providers';
import type { FlagKind, PlanBatch, QSet, Question } from '../domain/types';
import { uid } from '../lib/id';
import { batchLabel, isPassageBatch, isProcedural, passageSizes } from './plan';
import { isLimited, keyUsage, limitsOf, QuotaExhaustedError } from './quota';
import { CROSS_CHECK_KINDS, isCrossCheckable, openCheckerSession, runCrossCheck } from './crosscheck';
import { callAndParse, callAndParsePassages, openSession, type ModelSession } from './session';
import { errorText, isQuotaError } from './storage';
import { logError } from '../lib/errorLog';
import { isGraded } from '../domain/examPackage';

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
      // After a passage question means after its whole group, which must not be split.
      const after = endOfGroup((await db.questions.bulkGet(ids)).filter((q): q is Question => !!q), afterId);
      ids.splice(ids.indexOf(after) + 1, 0, ...questions.map((q) => q.id));
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

// The figural and data generators are only needed while questions are being made.
const procedural = () => import('../domain/procedural');

async function runBatch(set: QSet, batch: PlanBatch, session: ModelSession | null, hashes: Set<string>, signal: AbortSignal) {
  let questions: Question[];
  if (isProcedural(batch)) {
    questions = (await procedural()).generateProcedural(batch.items[0].topic, batch.items[0].difficulty, batch.count);
  } else if (isPassageBatch(batch)) {
    if (!session) throw new Error('Belum ada API key.');
    const sizes = passageSizes(batch.count);
    const prompt = buildPassagePrompt({ items: batch.items, sizes, avoid: await recentStems(batch.subtest, [batch.items[0].topic]) });
    questions = await callAndParsePassages(session, prompt, { items: batch.items, sizes, setId: set.id }, signal, (i, o) => addUsage(set.id, i, o));
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
  await loadMath();
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
  return { added: validated.length, ids: validated.map((q) => q.id), rest: leftover.rest };
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
  const producedIds: string[] = [];
  const worker = async () => {
    while (queue.length && !ctrl.signal.aborted) {
      const batch = queue.shift()!;
      update(setId, { current: [...(progress.get(setId)?.current ?? []), label(batch)] });
      try {
        const r = await runBatch(set, batch, session, hashes, ctrl.signal);
        producedIds.push(...r.ids);
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
        void logError('generation', e);
        const msg = errorText(e);
        await setBatch(setId, batch.id, { status: 'failed', error: msg }).catch(() => {});
        log(setId, 'error', `${label(batch)}: ${msg}`);
        // Stop early on auth errors and a full disk: every other batch would fail the same way.
        if ((e instanceof ProviderError && (e.status === 401 || e.status === 403)) || isQuotaError(e)) ctrl.abort();
      } finally {
        update(setId, { current: (progress.get(setId)?.current ?? []).filter((c) => c !== label(batch)) });
      }
    }
  };
  // Keys with a per-minute limit run one request at a time.
  const concurrency = limited && session && limitsOf(session.key).rpm ? 1 : Math.max(1, settings.concurrency);
  await Promise.all(Array.from({ length: concurrency }, worker));

  // One extra request to fix questions whose key, explanation and calculation disagree.
  if (session && !quotaStop && !ctrl.signal.aborted) {
    const broken = ((await db.questions.bulkGet(producedIds)).filter(Boolean) as Question[]).filter(needsRepair);
    const u = broken.length ? await keyUsage(session.key) : null;
    if (u && (u.remainingToday === null || u.remainingToday > 0)) {
      update(setId, { current: ['Memeriksa ulang soal'] });
      log(setId, 'info', `Memeriksa ulang ${broken.length} soal yang kunci jawaban dan pembahasannya tidak cocok…`);
      try {
        const fixed = await repairWith(session, broken, ctrl.signal, (i, o) => addUsage(setId, i, o));
        log(setId, 'info', `${fixed} dari ${broken.length} soal berhasil diperbaiki.${fixed < broken.length ? ' Sisanya ditandai "perlu dicek".' : ''}`);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') log(setId, 'info', `Perbaikan otomatis dilewati: ${(e as Error).message}`);
      }
    }
  }

  // Optional second opinion on the new questions, after any repair, from another model.
  const cc = settings.crossCheck;
  if (cc?.enabled && session && !quotaStop && !ctrl.signal.aborted) {
    const candidates = ((await db.questions.bulkGet(producedIds)).filter(Boolean) as Question[]).filter(isCrossCheckable);
    if (candidates.length) {
      update(setId, { current: ['Memeriksa silang'] });
      try {
        const checker = await openCheckerSession(cc, set.keyId);
        checker.onWait = session.onWait;
        log(setId, 'info', `Memeriksa silang ${candidates.length} soal dengan ${checker.cfg.model}…`);
        const r = await runCrossCheck(checker, candidates, ctrl.signal, (i, o) => addUsage(setId, i, o));
        log(
          setId,
          'info',
          `Pemeriksa silang: ${r.checked} soal diperiksa, ${r.mismatched} berbeda jawaban (ditandai "perlu dicek").` +
            (r.pending ? ` ${r.pending} soal belum diperiksa karena kuota habis; periksa nanti dari halaman set.` : ''),
        );
      } catch (e) {
        if ((e as Error).name !== 'AbortError') log(setId, 'info', `Pemeriksa silang dilewati: ${(e as Error).message}`);
      }
    }
  }

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
  await loadMath();
  // A report stays until the learner withdraws it, also through a rewrite; the old rating no longer applies.
  const updated = validateQuestion({ ...nq, id: q.id, starred: q.starred, locked: q.locked, report: q.report, passage: q.passage, createdAt: q.createdAt, updatedAt: Date.now() });
  await db.questions.put(updated);
  return updated;
}

const REPAIRABLE = new Set<FlagKind>(['math-mismatch', 'explanation-mismatch']);

/** A question whose key, explanation and calculation disagree, and that the AI may rewrite. */
export const needsRepair = (q: Question) =>
  q.source === 'ai' && !q.locked && !isGraded(q.subtest) && q.flags.some((f) => f.severity === 'warn' && REPAIRABLE.has(f.kind));

/** Ask the model to fix the given questions (one request per sub-test); returns how many were fixed. */
async function repairWith(session: ModelSession, questions: Question[], signal: AbortSignal, onUsage: (i: number, o: number) => Promise<void>): Promise<number> {
  let fixed = 0;
  for (const subtest of SUBTESTS) {
    const group = questions.filter((q) => q.subtest === subtest).slice(0, 10);
    if (!group.length) continue;
    const items = group.map((q) => ({ topic: q.topic, difficulty: q.difficulty }));
    const out = await callAndParse(session, buildRepairPrompt(subtest, group), { subtest, items, setId: group[0].originSetId }, signal, onUsage);
    // Answers are matched to questions by position, so a partial reply can't be trusted.
    if (out.length !== group.length) continue;
    await loadMath();
    for (const [i, old] of group.entries()) {
      const v = validateQuestion({ ...out[i], id: old.id, originSetId: old.originSetId, starred: old.starred, report: old.report, rating: old.rating, passage: old.passage, createdAt: old.createdAt, updatedAt: Date.now() });
      if (needsRepair(v)) continue;
      await db.questions.put(v);
      fixed++;
    }
  }
  return fixed;
}

/** Fix one question whose key and explanation disagree. */
export async function repairQuestion(q: Question, keyId?: string): Promise<void> {
  const session = await openSession(keyId);
  const fixed = await repairWith(session, [q], new AbortController().signal, async (i, o) => {
    if (q.originSetId) await addUsage(q.originSetId, i, o);
  });
  if (!fixed) throw new Error('AI belum berhasil memperbaiki soal ini. Coba lagi, atau edit soal secara manual.');
}

/** Generate `count` new questions modelled on `q` and insert them right after it. */
/** New questions like `q`, added after it in the set; `easier` asks for one difficulty step down. */
export async function moreLikeThis(setId: string, q: Question, count: number, keyId?: string, opts: { easier?: boolean } = {}): Promise<number> {
  let questions: Question[];
  const difficulty = opts.easier ? easier(q.difficulty) : q.difficulty;
  if (q.source === 'procedural') {
    questions = (await procedural()).generateProcedural(q.topic, difficulty, count);
  } else {
    const session = await openSession(keyId);
    const items = Array.from({ length: count }, () => ({ topic: q.topic, difficulty }));
    const prompt = buildPrompt({
      subtest: q.subtest,
      items,
      avoid: [q.stem],
      instruction: `Semua soal meniru gaya dan jenis soal contoh ini${opts.easier ? ', tetapi lebih mudah' : ', dengan tingkat kesulitan yang sama'}, dengan isi, angka, dan konteks berbeda: "${q.stem.slice(0, 600)}"`,
    });
    const ctrl = new AbortController();
    questions = await callAndParse(session, prompt, { subtest: q.subtest, items, setId }, ctrl.signal, (i, o) => addUsage(setId, i, o));
  }
  const hashes = await knownHashes();
  await loadMath();
  const validated = questions.slice(0, count).map((x) => validateQuestion(x, hashes));
  await appendToSet(setId, validated, q.id);
  return validated.length;
}

/** Recover sets left in "generating" after a reload. */
export async function recoverInterrupted() {
  await db.sets.where('status').equals('generating').modify({ status: 'paused' });
}

const VALIDATOR_VERSION = '2';

/** Re-run the answer checks on saved questions once, after the checks themselves improve. */
export async function revalidateStored() {
  try {
    if (localStorage.getItem('validatorVersion') === VALIDATOR_VERSION) return;
  } catch {
    return;
  }
  const qs = await db.questions.filter((q) => !isGraded(q.subtest) && q.source !== 'procedural' && !q.locked).toArray();
  if (qs.length) await loadMath();
  const changed = qs.flatMap((q) => {
    const v = validateQuestion(q);
    // Flags from outside the validator (duplicates, a second model's opinion) survive re-checking.
    const next = { ...v, flags: [...v.flags, ...q.flags.filter((f) => f.kind === 'duplicate' || CROSS_CHECK_KINDS.has(f.kind))] };
    return JSON.stringify(next.flags) !== JSON.stringify(q.flags) || next.answer !== q.answer ? [next] : [];
  });
  if (changed.length) await db.questions.bulkPut(changed);
  try {
    localStorage.setItem('validatorVersion', VALIDATOR_VERSION);
  } catch {
    // Private mode: the check simply runs again next time.
  }
}
