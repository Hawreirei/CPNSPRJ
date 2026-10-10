import { db, getSetQuestions } from '../db';
import { subtestsIn } from '../domain/examPackage';
import { buildRepairPrompt } from '../domain/prompts';
import { CROSS_CHECK_KINDS } from '../domain/quality';
import { withRecoveredScores } from '../domain/schemas';
import type { FlagKind, Question } from '../domain/types';
import { loadMath, validateQuestion } from '../domain/validators';
import { keyUsage, QuotaExhaustedError } from './quota';
import { callAndParse, openSession, type ModelSession } from './session';
import { addUsage } from './usage';

/**
 * "Perlu dicek" problems the AI can fix by rewriting the question. The learner's own checks are
 * not among them: a copy from a photo must be compared with the photo, a duplicate is a choice,
 * and a cross-check that has not run yet needs the checker, not a rewrite.
 */
const FIXABLE = new Set<FlagKind>(['math-mismatch', 'explanation-mismatch', 'tkp-spread', 'twk-unverified', 'low-confidence', 'structure', 'cross-check-mismatch']);
/** Fixed right after generation without being asked: a key, explanation or scores that contradict each other. */
const AUTO_FIX = new Set<FlagKind>(['math-mismatch', 'explanation-mismatch', 'tkp-spread']);
/** Questions per repair request: each comes back whole, so replies stay short enough not to be cut off. */
const PER_REQUEST = 10;

const problems = (q: Question, kinds = FIXABLE) => q.flags.filter((f) => f.severity === 'warn' && kinds.has(f.kind));

/**
 * A question the AI may rewrite because it has a fixable problem. A learner's report alone is not
 * one: it stays until they withdraw it, so a "fix all" would rewrite the question on every click.
 */
export const needsRepair = (q: Question) => q.source === 'ai' && !q.locked && problems(q).length > 0;

/** A question whose key, explanation or scores contradict each other, fixed right after generation. */
export const needsAutoRepair = (q: Question) => q.source === 'ai' && !q.locked && problems(q, AUTO_FIX).length > 0;

/** A rewrite is kept when it solves every fixable problem, or at least fewer remain. */
const improved = (before: Question, after: Question) => problems(after).length === 0 || problems(after).length < problems(before).length;

/** Requests needed to rewrite these questions: per sub-test, 10 at a time. */
export function repairRequests(questions: Question[]): number {
  return subtestsIn(questions).reduce((n, s) => n + Math.ceil(questions.filter((q) => q.subtest === s).length / PER_REQUEST), 0);
}

/**
 * Ask the model to rewrite the given questions, 10 per request and one sub-test per request
 * (largest first), and keep each rewrite that is better than the question it replaces.
 * Returns how many were kept.
 */
export async function repairWith(
  session: ModelSession,
  questions: Question[],
  signal: AbortSignal,
  onUsage: (i: number, o: number) => Promise<void>,
  opts: { maxRequests?: number; onProgress?: (done: number) => void } = {},
): Promise<number> {
  const chunks = subtestsIn(questions)
    .flatMap((s) => {
      const all = questions.filter((q) => q.subtest === s);
      return Array.from({ length: Math.ceil(all.length / PER_REQUEST) }, (_, i) => all.slice(i * PER_REQUEST, (i + 1) * PER_REQUEST));
    })
    .sort((a, b) => b.length - a.length)
    .slice(0, opts.maxRequests ?? Infinity);
  let fixed = 0;
  let done = 0;
  for (const group of chunks) {
    const subtest = group[0].subtest;
    const items = group.map((q) => ({ topic: q.topic, difficulty: q.difficulty }));
    const out = await callAndParse(session, buildRepairPrompt(subtest, group), { subtest, items, setId: group[0].originSetId }, signal, onUsage);
    // Answers are matched to questions by position, so a partial reply can't be trusted.
    if (out.length === group.length) {
      await loadMath();
      for (const [i, old] of group.entries()) {
        const v = validateQuestion({
          ...out[i],
          id: old.id,
          topic: old.topic,
          difficulty: old.difficulty,
          originSetId: old.originSetId,
          starred: old.starred,
          report: old.report,
          rating: old.rating,
          passage: old.passage,
          createdAt: old.createdAt,
          updatedAt: Date.now(),
        });
        if (!improved(old, v)) continue;
        await db.questions.put(v);
        fixed++;
      }
    }
    done += group.length;
    opts.onProgress?.(done);
  }
  return fixed;
}

/** Fix one question that needs checking. */
export async function repairQuestion(q: Question, keyId?: string): Promise<void> {
  const session = await openSession(keyId);
  const fixed = await repairWith(session, [q], new AbortController().signal, async (i, o) => {
    if (q.originSetId) await addUsage(q.originSetId, i, o);
  });
  if (!fixed) throw new Error('AI belum berhasil memperbaiki soal ini. Coba lagi, atau edit soal secara manual.');
}

export interface RepairAllResult {
  /** Fixed without AI: re-checked, scores taken from the explanation, a calculated key corrected. */
  synced: number;
  /** Rewritten by the AI. */
  rewritten: number;
  /** Still needing a look from the learner. */
  remaining: number;
  /** Set when the day's quota ran out before every question was tried. */
  quotaMessage?: string;
}

/**
 * Fix every question of a set that needs checking, in one go. First without AI (free): run the
 * checks again and bring key, scores and explanation back in line where they already agree on
 * the answer. Then the AI rewrites what is left, 10 questions per request.
 */
export async function repairAll(setId: string, opts: { keyId?: string; signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {}): Promise<RepairAllResult> {
  const set = await db.sets.get(setId);
  if (!set) throw new Error('Set tidak ditemukan.');
  const broken = (await getSetQuestions(set)).filter(needsRepair);
  const total = broken.length;
  opts.onProgress?.(0, total);

  await loadMath();
  let synced = 0;
  const left: Question[] = [];
  for (const q of broken) {
    const v = validateQuestion(withRecoveredScores(q));
    // Flags from outside the validator (duplicates, a second model's opinion) stay until the question changes.
    const next = { ...v, flags: [...v.flags, ...q.flags.filter((f) => f.kind === 'duplicate' || CROSS_CHECK_KINDS.has(f.kind))] };
    if (!needsRepair(next)) {
      await db.questions.put(next);
      synced++;
    } else left.push(next);
  }
  opts.onProgress?.(synced, total);

  let rewritten = 0;
  let quotaMessage: string | undefined;
  if (left.length) {
    const session = await openSession(opts.keyId ?? set.keyId);
    const u = await keyUsage(session.key);
    if (u.blockedUntil || (u.remainingToday !== null && u.remainingToday <= 0)) {
      quotaMessage = new QuotaExhaustedError(u.blockedUntil ?? u.resetAt, u.today, u.limits.rpd).message;
    } else {
      try {
        rewritten = await repairWith(session, left, opts.signal ?? new AbortController().signal, (i, o) => addUsage(setId, i, o), {
          onProgress: (done) => opts.onProgress?.(synced + done, total),
        });
      } catch (e) {
        if (!(e instanceof QuotaExhaustedError)) throw e;
        quotaMessage = e.message;
      }
    }
  }
  const after = (await getSetQuestions((await db.sets.get(setId))!)).filter(needsRepair).length;
  return { synced, rewritten, remaining: after, quotaMessage };
}
