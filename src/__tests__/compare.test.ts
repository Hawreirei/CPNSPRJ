import { describe, expect, it } from 'vitest';
import { compareAttempts, earlierExams, signed, toPractise } from '../domain/compare';
import { filterQuestions } from '../domain/practice';
import { computeResult } from '../domain/scoring';
import type { Attempt, OptionLabel, Question } from '../domain/types';

const LABELS: OptionLabel[] = ['A', 'B', 'C', 'D', 'E'];
function q(id: string, subtest: string, scores: number[], answer?: OptionLabel): Question {
  return {
    id,
    subtest,
    topic: 't',
    difficulty: 'sedang',
    stem: `Soal ${id}`,
    options: LABELS.map((label, i) => ({ label, text: label, score: scores[i] })),
    answer,
    explanation: '',
    flags: [],
    locked: false,
    starred: false,
    hash: id,
    source: 'ai',
    createdAt: 0,
    updatedAt: 0,
  };
}
const keyed = (id: string, subtest = 'TIU') => q(id, subtest, [5, 0, 0, 0, 0], 'A');
const tkp = (id: string) => q(id, 'TKP', [5, 4, 3, 2, 1]);

function attempt(id: string, questions: Question[], answers: Record<string, OptionLabel>, startedAt: number, extra: Partial<Attempt> = {}): Attempt {
  return {
    id,
    setId: 's',
    setName: 'S',
    mode: 'exam',
    questionIds: questions.map((x) => x.id),
    startedAt,
    endsAt: startedAt + 600_000,
    finishedAt: startedAt + 300_000,
    answers,
    flagged: [],
    timeSpent: {},
    currentIndex: 0,
    passing: {},
    result: computeResult(questions, answers, {}),
    ...extra,
  };
}

describe('comparing two exams on the same set', () => {
  const qs = [keyed('k1'), keyed('k2'), keyed('k3'), keyed('k4'), keyed('k5'), tkp('t1'), tkp('t2'), tkp('t3'), tkp('t4')];
  const before = attempt('a1', qs, { k1: 'B', k2: 'A', k3: 'C', k4: 'A', t1: 'C', t2: 'A', t3: 'B', t4: 'A' }, 1000);
  // k1 wrong → right, k2 right → wrong, k3 wrong → wrong, k4 right → right, k5 empty → empty;
  // TKP t1 3 → 5, t2 5 → 2, t3 4 → 4, t4 5 → 5.
  const after = attempt('a2', qs, { k1: 'A', k2: 'D', k3: 'B', k4: 'A', t1: 'A', t2: 'D', t3: 'B', t4: 'A' }, 2000, { finishedAt: 2000 + 200_000 });

  it('sorts every question into improved, worsened, still wrong or still right', () => {
    const c = compareAttempts(before, after, qs);
    const by = (ch: string) => c.changes.filter((x) => x.change === ch).map((x) => x.id);
    expect(by('improved')).toEqual(['k1', 't1']);
    expect(by('worsened')).toEqual(['k2', 't2']);
    expect(by('still-wrong')).toEqual(['k3', 'k5', 't3']);
    expect(by('still-right')).toEqual(['k4', 't4']);
    expect(c.changes.find((x) => x.id === 'k5')).toMatchObject({ no: 5, before: { answer: undefined, score: 0 }, after: { answer: undefined, score: 0 } });
    expect(c.changes.find((x) => x.id === 't2')).toMatchObject({ before: { answer: 'A', score: 5 }, after: { answer: 'D', score: 2 } });
    expect(c.notInBoth).toBe(0);
  });

  it('gives totals, scores per sub-test and time', () => {
    const c = compareAttempts(before, after, qs);
    expect(c.total).toEqual({ before: before.result!.total, after: after.result!.total });
    expect(c.perSubtest).toEqual([
      { subtest: 'TIU', before: 10, after: 10, max: 25 },
      { subtest: 'TKP', before: 17, after: 16, max: 20 },
    ]);
    expect(c.durationMs).toEqual({ before: 300_000, after: 200_000 });
  });

  it('suggests practising what got worse first, then what is still wrong', () => {
    const ids = toPractise(compareAttempts(before, after, qs));
    expect(ids).toEqual(['k2', 't2', 'k3', 'k5', 't3']);
    expect(filterQuestions(qs, { questionIds: ids }).map((x) => x.id)).toEqual(['k2', 'k3', 'k5', 't2', 't3']);
  });

  it('skips questions that are only in one of the two, after the set was edited', () => {
    const edited = [...qs.filter((x) => x.id !== 'k1'), keyed('k9')];
    const later = attempt('a3', edited, { k9: 'A' }, 3000);
    const c = compareAttempts(before, later, edited);
    expect(c.changes.map((x) => x.id)).not.toContain('k9');
    expect(c.changes.map((x) => x.id)).not.toContain('k1');
    expect(c.notInBoth).toBe(2);
  });

  it('works for PPPK: keyed technical questions and graded 1–4 ones', () => {
    const p = [keyed('p1', 'PPPK-TEKNIS'), q('p2', 'PPPK-SOSKUL', [1, 4, 2, 3, 1]), q('p3', 'PPPK-MANAJERIAL', [4, 1, 2, 3, 1])];
    const a = attempt('b1', p, { p1: 'A', p2: 'B', p3: 'D' }, 1);
    const b = attempt('b2', p, { p1: 'C', p2: 'D', p3: 'A' }, 2);
    const c = compareAttempts(a, b, p);
    expect(c.changes.map((x) => [x.id, x.change])).toEqual([
      ['p1', 'worsened'],
      ['p2', 'worsened'],
      ['p3', 'improved'],
    ]);
    expect(c.perSubtest.map((x) => x.subtest)).toEqual(['PPPK-TEKNIS', 'PPPK-MANAJERIAL', 'PPPK-SOSKUL']);
  });
});

describe('which exams to compare with', () => {
  const qs = [keyed('k1')];
  const now = attempt('now', qs, {}, 5000);
  it('takes finished exams on the same set before this one, newest first; never practice', () => {
    const all = [
      now,
      attempt('old', qs, {}, 1000),
      attempt('newer-old', qs, {}, 3000),
      attempt('practice', qs, {}, 4000, { mode: 'practice' }),
      attempt('unfinished', qs, {}, 4500, { result: undefined, finishedAt: undefined }),
      attempt('later', qs, {}, 6000),
      attempt('other-set', qs, {}, 2000, { setId: 'x' }),
      attempt('legacy', qs, {}, 2500, { mode: undefined }),
    ];
    expect(earlierExams(now, all).map((x) => x.id)).toEqual(['newer-old', 'legacy', 'old']);
  });

  it('formats differences with a real minus sign', () => {
    expect([signed(5), signed(-3), signed(0)]).toEqual(['+5', '−3', '±0']);
  });
});
