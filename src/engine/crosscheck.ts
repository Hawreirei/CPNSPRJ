import { db, getSettings } from '../db';
import { NUMERIC_TOPICS, PROCEDURAL_TOPICS } from '../domain/blueprint';
import { buildCrossCheckPrompt, CHECK_SYSTEM_PROMPT } from '../domain/prompts';
import { parseCrossCheck } from '../domain/schemas';
import { SUBTESTS } from '../domain/types';
import type { CrossCheckSettings, Flag, FlagKind, OptionLabel, PlanBatch, Question, Subtest } from '../domain/types';
import { QuotaExhaustedError } from './quota';
import { callModel, openSession, type ModelSession } from './session';
import { isGraded, isTopOption, topOptions } from '../domain/examPackage';

/**
 * Second opinion: another model answers each question blind (no key, no explanation, no TKP
 * scores). A different answer becomes a warning for the user to decide on; the key is never
 * changed here. Two models can share a mistake, so a match adds confidence, not proof.
 */

/** Questions per request: small enough that a reply is rarely cut off. */
export const CROSS_CHECK_BATCH = 15;
/** Rough tokens per question for the cost estimate. */
const IN_PER_Q = 260;
const OUT_PER_Q = 70;
const IN_PER_REQ = 200;

export const CROSS_CHECK_KINDS = new Set<FlagKind>(['cross-check-mismatch', 'cross-checked', 'cross-check-pending']);

/**
 * Worth a second opinion: AI-written, and not already verified another way. Numeric TIU is
 * recomputed with mathjs and figural TIU is drawn from exact rules, so both are skipped.
 */
export function isCrossCheckable(q: Pick<Question, 'source' | 'subtest' | 'topic' | 'mathExpression'>): boolean {
  if (q.source !== 'ai') return false;
  if (q.subtest === 'TIU' && (NUMERIC_TOPICS.has(q.topic) || PROCEDURAL_TOPICS.has(q.topic) || !!q.mathExpression)) return false;
  return true;
}

const hasKind = (q: Pick<Question, 'flags'>, kind: FlagKind) => q.flags.some((f) => f.kind === kind);
/** Eligible and not yet checked (or left pending last time). */
export const needsCrossCheck = (q: Question) => isCrossCheckable(q) && !hasKind(q, 'cross-checked') && !hasKind(q, 'cross-check-mismatch');

const withoutCrossCheck = (flags: Flag[]) => flags.filter((f) => !CROSS_CHECK_KINDS.has(f.kind));

/** New flags for a question from the checker's answer; earlier cross-check flags are replaced. */
export function applyCrossCheck(q: Question, reply: { answer: OptionLabel; reason: string }, model: string): Flag[] {
  const flags = withoutCrossCheck(q.flags);
  const picked = q.options.find((o) => o.label === reply.answer);
  const agrees = isGraded(q.subtest) ? isTopOption(q, picked) : reply.answer === q.answer;
  if (agrees) return [...flags, { kind: 'cross-checked', severity: 'info', message: `Diperiksa silang oleh ${model}: jawabannya sama.` }];
  const best = topOptions(q)[0];
  const what = isGraded(q.subtest) ? `opsi ${reply.answer}${picked ? ` (skor ${picked.score})` : ''} sebagai yang paling tepat, bukan ${best ?? '—'}` : `jawaban ${reply.answer}, bukan ${best ?? '—'}`;
  return [
    ...flags,
    {
      kind: 'cross-check-mismatch',
      severity: 'warn',
      message: `Pemeriksa silang (${model}) memilih ${what}${reply.reason ? `. Alasannya: ${reply.reason}` : ''}. Periksa soal ini; kunci tidak diubah otomatis.`,
    },
  ];
}

export const pendingFlags = (q: Question): Flag[] => [
  ...withoutCrossCheck(q.flags),
  { kind: 'cross-check-pending', severity: 'info', message: 'Belum diperiksa silang (kuota habis atau dihentikan).' },
];

export interface CrossCheckEstimate {
  questions: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

/** Extra requests a set's pending batches will need when cross-check is on. */
export function estimateCrossCheck(batches: Pick<PlanBatch, 'subtest' | 'items' | 'status'>[]): CrossCheckEstimate {
  const per = new Map<Subtest, number>();
  for (const b of batches.filter((x) => x.status !== 'done')) {
    for (const it of b.items) {
      if (isCrossCheckable({ source: 'ai', subtest: b.subtest, topic: it.topic })) per.set(b.subtest, (per.get(b.subtest) ?? 0) + 1);
    }
  }
  const questions = [...per.values()].reduce((n, x) => n + x, 0);
  const requests = [...per.values()].reduce((n, x) => n + Math.ceil(x / CROSS_CHECK_BATCH), 0);
  return { questions, requests, inputTokens: requests * IN_PER_REQ + questions * IN_PER_Q, outputTokens: questions * OUT_PER_Q };
}

export interface CrossCheckResult {
  checked: number;
  mismatched: number;
  /** Left unchecked because the quota ran out. */
  pending: number;
}

/** Update one question's flags against the latest stored copy, so edits made meanwhile are kept. */
async function setFlags(id: string, make: (q: Question) => Flag[]) {
  await db.transaction('rw', db.questions, async () => {
    const cur = await db.questions.get(id);
    if (cur) await db.questions.update(id, { flags: make(cur) });
  });
}

/**
 * Check `questions` with `session`, one request per sub-test chunk. Stops cleanly when the
 * daily quota runs out: the rest are marked pending. Other errors propagate.
 */
export async function runCrossCheck(
  session: ModelSession,
  questions: Question[],
  signal: AbortSignal,
  onUsage: (i: number, o: number) => Promise<void>,
): Promise<CrossCheckResult> {
  const result: CrossCheckResult = { checked: 0, mismatched: 0, pending: 0 };
  const chunks = SUBTESTS.flatMap((s) => {
    const group = questions.filter((q) => q.subtest === s && isCrossCheckable(q));
    return Array.from({ length: Math.ceil(group.length / CROSS_CHECK_BATCH) }, (_, i) => ({ subtest: s, qs: group.slice(i * CROSS_CHECK_BATCH, (i + 1) * CROSS_CHECK_BATCH) }));
  });
  for (const [ci, chunk] of chunks.entries()) {
    let replies: Map<number, { answer: OptionLabel; reason: string }>;
    try {
      replies = await callModel(session, { system: CHECK_SYSTEM_PROMPT, prompt: buildCrossCheckPrompt(chunk.subtest, chunk.qs) }, parseCrossCheck, signal, onUsage);
    } catch (e) {
      if (!(e instanceof QuotaExhaustedError) && (e as Error).name !== 'AbortError') throw e;
      const rest = chunks.slice(ci).flatMap((c) => c.qs);
      for (const q of rest) await setFlags(q.id, pendingFlags);
      result.pending += rest.length;
      if ((e as Error).name === 'AbortError') throw e;
      return result;
    }
    for (const [i, q] of chunk.qs.entries()) {
      const reply = replies.get(i + 1);
      if (!reply) continue;
      let mismatch = false;
      await setFlags(q.id, (cur) => {
        const flags = applyCrossCheck(cur, reply, session.cfg.model);
        mismatch = flags.some((f) => f.kind === 'cross-check-mismatch');
        return flags;
      });
      result.checked++;
      if (mismatch) result.mismatched++;
    }
  }
  return result;
}

/** Session for checking: the configured key and model, else the set's key and its model. */
export function openCheckerSession(cc: CrossCheckSettings, fallbackKeyId?: string): Promise<ModelSession> {
  return openSession(cc.keyId ?? fallbackKeyId, cc.model);
}

/** Check questions on demand (set page). Uses the cross-check settings even when automatic checking is off. */
export async function crossCheckQuestions(questions: Question[], fallbackKeyId?: string): Promise<CrossCheckResult> {
  const cc = (await getSettings()).crossCheck ?? { enabled: false };
  const session = await openCheckerSession(cc, fallbackKeyId);
  const setId = questions[0]?.originSetId;
  return runCrossCheck(session, questions, new AbortController().signal, async (i, o) => {
    if (!setId) return;
    const set = await db.sets.get(setId);
    if (set) await db.sets.update(setId, { usage: { inputTokens: set.usage.inputTokens + i, outputTokens: set.usage.outputTokens + o, requests: set.usage.requests + 1 } });
  });
}
