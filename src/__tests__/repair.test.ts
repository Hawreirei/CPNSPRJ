import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { needsAutoRepair, needsRepair, repairAll, repairRequests } from '../engine/repair';
import type { Flag, Question } from '../domain/types';

let n = 0;
function mkQ(partial: Partial<Question> = {}): Question {
  const id = partial.id ?? `q${++n}`;
  return {
    id,
    subtest: 'TWK',
    topic: 'Pancasila',
    difficulty: 'sedang',
    stem: `Soal ${id}`,
    options: (['A', 'B', 'C', 'D', 'E'] as const).map((label) => ({ label, text: `Opsi ${label}`, score: label === 'A' ? 5 : 0 })),
    answer: 'A',
    explanation: 'Jawaban: A.',
    reference: 'Sila ke-1',
    flags: [],
    locked: false,
    starred: false,
    hash: id,
    source: 'ai',
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}
const warn = (kind: Flag['kind']): Flag => ({ kind, severity: 'warn', message: kind });

beforeEach(async () => {
  await db.questions.clear();
  await db.sets.clear();
});

describe('fixing questions that need checking', () => {
  it("knows which problems the AI can fix and which are the learner's to check", () => {
    expect(needsRepair(mkQ({ flags: [warn('explanation-mismatch')] }))).toBe(true);
    expect(needsRepair(mkQ({ flags: [warn('twk-unverified')] }))).toBe(true);
    expect(needsRepair(mkQ({ flags: [warn('cross-check-mismatch')] }))).toBe(true);
    // Not the AI's to fix: a copy from a photo, a report, a locked or hand-written question.
    expect(needsRepair(mkQ({ flags: [warn('import-unchecked')] }))).toBe(false);
    expect(needsRepair(mkQ({ flags: [warn('user-report')] }))).toBe(false);
    expect(needsRepair(mkQ({ flags: [warn('explanation-mismatch')], locked: true }))).toBe(false);
    expect(needsRepair(mkQ({ flags: [warn('explanation-mismatch')], source: 'manual' }))).toBe(false);
    // Right after generation only contradictions are fixed without asking.
    expect(needsAutoRepair(mkQ({ flags: [warn('twk-unverified')] }))).toBe(false);
    expect(needsAutoRepair(mkQ({ flags: [warn('explanation-mismatch')] }))).toBe(true);
  });

  it('needs one request per 10 questions of a sub-test', () => {
    const qs = [...Array.from({ length: 12 }, () => mkQ()), ...Array.from({ length: 3 }, () => mkQ({ subtest: 'TKP' }))];
    expect(repairRequests(qs)).toBe(3);
  });

  it('syncs without AI what can be synced: PPPK scores written only in the explanation', async () => {
    const options = (['A', 'B', 'C', 'D', 'E'] as const).map((label) => ({ label, text: `Tindakan ${label}`, score: 0 }));
    const q = mkQ({
      subtest: 'PPPK-MANAJERIAL',
      answer: undefined,
      options,
      explanation: 'A (skor 2): lambat. B (skor 4): tepat. C (skor 3): cukup. D (skor 1): pasif. E (skor 1): menghindar.',
      flags: [warn('tkp-spread')],
    });
    await db.questions.put(q);
    await db.sets.put({ id: 's1', name: 'Set', questionIds: [q.id], batches: [], usage: { inputTokens: 0, outputTokens: 0, requests: 0 } } as never);
    // No key is needed: nothing is left for the AI.
    const r = await repairAll('s1');
    expect(r).toMatchObject({ synced: 1, rewritten: 0, remaining: 0 });
    expect((await db.questions.get(q.id))?.options.map((o) => o.score)).toEqual([2, 4, 3, 1, 1]);
  });
});
