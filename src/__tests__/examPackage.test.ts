import { describe, expect, it } from 'vitest';
import { SUBTEST_NAMES } from '../domain/blueprint';
import { clampGraded, isGraded, isTopOption, keyedScore, maxPerQuestion, scoringOf, SKD_CPNS, topOptions } from '../domain/examPackage';
import { MAX_PER_QUESTION } from '../domain/scoring';
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
