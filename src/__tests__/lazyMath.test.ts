import { describe, expect, it } from 'vitest';
import { evaluateExpression, loadMath, MathNotLoadedError, parseNumeric } from '../domain/numeric';
import { validateQuestion } from '../domain/validators';
import type { OptionLabel, Question } from '../domain/types';

// Its own file: Vitest gives each file fresh module state, so mathjs starts unloaded here.
describe('mathjs dimuat malas', () => {
  const q: Question = {
    id: 'q1',
    subtest: 'TIU',
    topic: 'Aritmetika',
    difficulty: 'sedang',
    stem: '2 + 3 = ?',
    options: (['A', 'B', 'C', 'D', 'E'] as OptionLabel[]).map((label, i) => ({ label, text: String(i + 3), score: label === 'C' ? 5 : 0 })),
    answer: 'C',
    explanation: '2 + 3 = 5. Jawaban: C.',
    mathExpression: '2 + 3',
    flags: [],
    locked: false,
    starred: false,
    hash: 'h',
    source: 'ai',
    createdAt: 0,
    updatedAt: 0,
  };

  it('menolak memeriksa sebelum dimuat, bukan diam-diam melewatkan', () => {
    expect(() => evaluateExpression('2 + 3')).toThrow(MathNotLoadedError);
    expect(() => parseNumeric('3/4')).toThrow(MathNotLoadedError);
    expect(() => validateQuestion(q)).toThrow(MathNotLoadedError);
  });

  it('memeriksa hitungan setelah loadMath()', async () => {
    await Promise.all([loadMath(), loadMath()]);
    expect(evaluateExpression('2 + 3')).toBe(5);
    expect(parseNumeric('3/4')).toBe(0.75);
    expect(validateQuestion(q).flags.filter((f) => f.severity === 'warn')).toEqual([]);
  });
});
