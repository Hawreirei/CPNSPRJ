import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SUBTEST_NAMES } from '../domain/blueprint';
import {
  clampGraded,
  inExamOrder,
  isGraded,
  isTopOption,
  keyedScore,
  maxPerQuestion,
  packageOf,
  packages,
  registerPackage,
  scoringOf,
  SKD_CPNS,
  specOf,
  topOptions,
} from '../domain/examPackage';
import { computeResult, isCorrect, MAX_PER_QUESTION } from '../domain/scoring';
import { examSeries } from '../engine/analytics';
import { SUBTESTS } from '../domain/types';
import type { OptionLabel, Question } from '../domain/types';

const LABELS: OptionLabel[] = ['A', 'B', 'C', 'D', 'E'];
const q = (subtest: Question['subtest'], scores: number[], answer?: OptionLabel) => ({
  subtest,
  answer,
  options: LABELS.map((label, i) => ({ label, text: label, score: scores[i] })),
});

describe('SKD CPNS as an exam package', () => {
  it('has the three sub-tests in order, with the names the app shows', () => {
    expect(SKD_CPNS.subtests.map((s) => s.id)).toEqual(SUBTESTS);
    expect(SUBTEST_NAMES).toEqual({ TWK: 'Tes Wawasan Kebangsaan', TIU: 'Tes Intelegensia Umum', TKP: 'Tes Karakteristik Pribadi' });
  });

  it('scores TWK and TIU by key (5 or 0) and TKP per option (1–5), as before', () => {
    expect(scoringOf('TWK')).toEqual({ kind: 'keyed', correct: 5 });
    expect(scoringOf('TIU')).toEqual({ kind: 'keyed', correct: 5 });
    expect(scoringOf('TKP')).toEqual({ kind: 'graded', min: 1, max: 5 });
    expect(SUBTESTS.filter(isGraded)).toEqual(['TKP']);
    for (const s of SUBTESTS) expect(maxPerQuestion(s)).toBe(MAX_PER_QUESTION);
  });
});

describe('scoring helpers', () => {
  it('finds the top options: the key, or every best graded option', () => {
    expect(topOptions(q('TWK', [0, 0, 5, 0, 0], 'C'))).toEqual(['C']);
    expect(topOptions(q('TIU', [0, 0, 0, 0, 0]))).toEqual([]);
    expect(topOptions(q('TKP', [3, 5, 1, 5, 2]))).toEqual(['B', 'D']);
    expect(isTopOption({ subtest: 'TKP' }, { score: 5 })).toBe(true);
    expect(isTopOption({ subtest: 'TKP' }, { score: 4 })).toBe(false);
    expect(isTopOption({ subtest: 'TKP' }, undefined)).toBe(false);
  });

  it('gives keyed options the full mark or nothing, and keeps graded scores in range', () => {
    expect(keyedScore('TWK', true)).toBe(5);
    expect(keyedScore('TWK', false)).toBe(0);
    expect(keyedScore('TKP', true)).toBe(0);
    expect(clampGraded('TKP', 7)).toBe(5);
    expect(clampGraded('TKP', 0)).toBe(1);
    expect(clampGraded('TKP', 3.4)).toBe(3);
    expect(clampGraded('TIU', 7)).toBe(7);
  });
});

describe('a second package (made up for this test, not real exam numbers)', () => {
  registerPackage({
    id: 'uji',
    name: 'Paket uji',
    source: 'unit test',
    subtests: [
      { id: 'UJI-A', name: 'Uji A', scoring: { kind: 'keyed', correct: 5 } },
      { id: 'UJI-B', name: 'Uji B', scoring: { kind: 'graded', min: 1, max: 4 } },
    ],
  });
  const mk = (id: string, subtest: string, scores: number[], answer?: OptionLabel): Question => ({
    id,
    subtest,
    topic: 't',
    difficulty: 'sedang',
    stem: id,
    options: LABELS.map((label, i) => ({ label, text: label, score: scores[i] ?? 0 })),
    answer,
    explanation: '',
    flags: [],
    locked: false,
    starred: false,
    hash: id,
    source: 'ai',
    createdAt: 0,
    updatedAt: 0,
  });

  it('refuses a sub-test id another package already uses', () => {
    expect(() => registerPackage({ id: 'x', name: 'x', source: 'x', subtests: [{ id: 'TKP', name: 'x', scoring: { kind: 'keyed', correct: 1 } }] })).toThrow('sudah dipakai');
  });

  it('knows each sub-test’s package, name and rule; unknown ids are scored as keyed', () => {
    expect(packageOf('UJI-B').id).toBe('uji');
    expect(packageOf('TWK')).toBe(SKD_CPNS);
    expect(specOf('UJI-B')).toMatchObject({ name: 'Uji B', scoring: { kind: 'graded', max: 4 } });
    expect(maxPerQuestion('UJI-B')).toBe(4);
    expect(specOf('BARU')).toEqual({ id: 'BARU', name: 'BARU', scoring: { kind: 'keyed', correct: 5 } });
    expect(packages().map((p) => p.id)).toEqual(['skd-cpns', 'pppk-2024', 'uji']);
  });

  it('orders sub-tests by package, then unknown ones', () => {
    expect(inExamOrder(['UJI-B', 'BARU', 'TKP', 'UJI-A', 'TWK', 'TKP'])).toEqual(['TWK', 'TKP', 'UJI-A', 'UJI-B', 'BARU']);
  });

  it('scores its sub-tests by their own rules, with no pass/fail when there is no pass mark', () => {
    const qs = [mk('b1', 'UJI-B', [1, 4, 2, 3, 1]), mk('a1', 'UJI-A', [0, 5, 0, 0, 0], 'B'), mk('a2', 'UJI-A', [5, 0, 0, 0, 0], 'A')];
    const r = computeResult(qs, { b1: 'D', a1: 'B', a2: 'C' }, {});
    expect(r.perSubtest.map((s) => s.subtest)).toEqual(['UJI-A', 'UJI-B']);
    expect(r.perSubtest[0]).toMatchObject({ score: 5, max: 10, correct: 1, answered: 2, total: 2 });
    expect(r.perSubtest[1]).toMatchObject({ score: 3, max: 4, correct: 0 });
    expect(r.perSubtest[0].passed).toBeUndefined();
    expect(r.passedAll).toBeUndefined();
    expect(r.total).toBe(8);
    // A graded option at the top of its range counts as "best".
    expect(isCorrect(qs[0], 'B')).toBe(true);
  });

  it('gives pass/fail only when every sub-test has a pass mark', () => {
    const qs = [mk('a1', 'UJI-A', [0, 5, 0, 0, 0], 'B'), mk('b1', 'UJI-B', [1, 4, 2, 3, 1])];
    expect(computeResult(qs, { a1: 'B', b1: 'B' }, { 'UJI-A': 5, 'UJI-B': 4 }).passedAll).toBe(true);
    expect(computeResult(qs, { a1: 'B', b1: 'A' }, { 'UJI-A': 5, 'UJI-B': 4 }).passedAll).toBe(false);
    expect(computeResult(qs, { a1: 'B', b1: 'B' }, { 'UJI-A': 5 }).passedAll).toBeUndefined();
  });

  it('stays out of the SKD score series', () => {
    const qs = [mk('a1', 'UJI-A', [0, 5, 0, 0, 0], 'B')];
    const result = computeResult(qs, { a1: 'B' }, {});
    const attempt = { id: 'x', setName: 'S', startedAt: 1, mode: 'exam' as const, result } as Parameters<typeof examSeries>[0][number];
    expect(examSeries([attempt], DEFAULT_SETTINGS.counts)).toEqual({ TWK: [], TIU: [], TKP: [] });
  });
});

describe('what the learner sees of the built-in packages', () => {
  it('is a plain name, CPNS and PPPK, with no decree, diktum or year; the sources stay in the code', () => {
    const builtIn = packages().filter((p) => p.id === 'skd-cpns' || p.id === 'pppk-2024');
    expect(builtIn.map((p) => p.name)).toEqual(['CPNS', 'PPPK']);
    for (const p of builtIn) {
      for (const text of [p.name, ...(p.notes ?? []), ...p.subtests.map((s) => s.name)]) expect(text).not.toMatch(/\b(19|20)\d{2}\b|Keputusan|Diktum|MenPAN/i);
    }
  });
});
