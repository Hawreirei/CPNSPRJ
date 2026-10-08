import { beforeAll, describe, expect, it } from 'vitest';
import { computeResult, scoreQuestion, weakTopics } from '../domain/scoring';
import { loadMath, parseNumeric, evaluateExpression } from '../domain/numeric';
import { checkTkp, explainedOption, validateQuestion } from '../domain/validators';
import { generateFigural, generateFiguralAnalogy, generateFiguralSeries } from '../domain/figural';
import { extractJson, parseAiQuestions } from '../domain/schemas';
import { buildPrompt } from '../domain/prompts';
import { planBatches, estimatePlan, isProcedural } from '../engine/plan';
import { buildPreset, DEFAULT_SETTINGS, scaledPassing } from '../domain/blueprint';
import type { OptionLabel, Question } from '../domain/types';

// mathjs loads on demand in the app; validation needs it loaded first.
beforeAll(() => loadMath());

function mkQ(partial: Partial<Question>): Question {
  return {
    id: Math.random().toString(36).slice(2),
    subtest: 'TIU',
    topic: 'Aritmetika',
    difficulty: 'sedang',
    stem: 'Berapa 2 + 2?',
    options: (['A', 'B', 'C', 'D', 'E'] as OptionLabel[]).map((label, i) => ({ label, text: String(i + 3), score: label === 'B' ? 5 : 0 })),
    answer: 'B',
    explanation: '',
    flags: [],
    locked: false,
    starred: false,
    hash: 'x',
    source: 'ai',
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe('numeric parsing', () => {
  it('handles Indonesian formats', () => {
    expect(parseNumeric('Rp 1.500.000')).toBe(1500000);
    expect(parseNumeric('12,5')).toBe(12.5);
    expect(parseNumeric('3/4')).toBe(0.75);
    expect(parseNumeric('25%')).toBe(0.25);
    expect(parseNumeric('2 1/2')).toBe(2.5);
    expect(parseNumeric('45 km')).toBe(45);
    expect(parseNumeric('1.5')).toBe(1.5);
    expect(parseNumeric('$\\frac{3}{4}$')).toBe(0.75);
    expect(parseNumeric('tidak dapat ditentukan')).toBeNull();
  });
  it('evaluates expressions', () => {
    expect(evaluateExpression('(1200000 * 0.15) + 50000')).toBe(230000);
    expect(evaluateExpression('48 * 2')).toBe(96);
    expect(evaluateExpression('nonsense(')).toBeNull();
  });
});

describe('scoring', () => {
  it('scores TWK/TIU 5/0 and TKP by option', () => {
    const tiu = mkQ({});
    const tkp = mkQ({
      subtest: 'TKP',
      topic: 'Pelayanan Publik',
      answer: undefined,
      options: (['A', 'B', 'C', 'D', 'E'] as OptionLabel[]).map((label, i) => ({ label, text: label, score: i + 1 })),
    });
    expect(scoreQuestion(tiu, 'B')).toBe(5);
    expect(scoreQuestion(tiu, 'A')).toBe(0);
    expect(scoreQuestion(tiu, undefined)).toBe(0);
    expect(scoreQuestion(tkp, 'C')).toBe(3);

    const r = computeResult([tiu, tkp], { [tiu.id]: 'B', [tkp.id]: 'E' }, { TWK: 65, TIU: 5, TKP: 4 });
    expect(r.total).toBe(10);
    expect(r.maxTotal).toBe(10);
    expect(r.passedAll).toBe(true);
    expect(r.perSubtest.map((s) => s.subtest)).toEqual(['TIU', 'TKP']);
  });
  it('requires every sub-test to pass', () => {
    const a = mkQ({ subtest: 'TWK', topic: 'Pancasila' });
    const b = mkQ({});
    const r = computeResult([a, b], { [a.id]: 'B' }, { TWK: 5, TIU: 5, TKP: 0 });
    expect(r.passedAll).toBe(false);
    expect(weakTopics(r.topics).map((t) => t.topic)).toEqual(['Aritmetika']);
  });
  it('scales passing threshold for partial sets', () => {
    expect(scaledPassing('TWK', 30, DEFAULT_SETTINGS)).toBe(65);
    expect(scaledPassing('TWK', 15, DEFAULT_SETTINGS)).toBe(33);
  });
});

describe('validators', () => {
  it('corrects a wrong numerical key when exactly one option matches', () => {
    const q = mkQ({ mathExpression: '2 + 2', answer: 'A', options: mkQ({}).options.map((o) => ({ ...o, text: String(Number(o.text)) })) });
    // options are 3,4,5,6,7 -> 4 is B
    const v = validateQuestion(q);
    expect(v.answer).toBe('B');
    expect(v.options.find((o) => o.label === 'B')?.score).toBe(5);
    expect(v.flags.some((f) => f.kind === 'math-corrected')).toBe(true);
  });
  it('flags numerical mismatch', () => {
    const v = validateQuestion(mkQ({ mathExpression: '100 * 3' }));
    expect(v.flags.some((f) => f.kind === 'math-mismatch' && f.severity === 'warn')).toBe(true);
  });
  it('accepts a correct numerical key without flags', () => {
    const v = validateQuestion(mkQ({ mathExpression: '8 / 2' }));
    expect(v.flags).toEqual([]);
  });
  it('checks TKP score spread', () => {
    const base = mkQ({ subtest: 'TKP', answer: undefined });
    const ok = { ...base, options: base.options.map((o, i) => ({ ...o, score: [3, 5, 1, 4, 2][i] })) };
    expect(checkTkp(ok)).toEqual([]);
    const tie = { ...base, options: base.options.map((o, i) => ({ ...o, score: [5, 5, 1, 4, 2][i] })) };
    expect(checkTkp(tie).some((f) => f.severity === 'warn')).toBe(true);
    const range = { ...base, options: base.options.map((o, i) => ({ ...o, score: [0, 5, 1, 4, 2][i] })) };
    expect(checkTkp(range).some((f) => f.severity === 'warn')).toBe(true);
  });
  it('flags TWK without reference and low confidence', () => {
    const v = validateQuestion(mkQ({ subtest: 'TWK', topic: 'UUD 1945', confidence: 'low' }));
    expect(v.flags.map((f) => f.kind).sort()).toEqual(['low-confidence', 'twk-unverified']);
  });
  it('reads decimals in the math formula as decimals', () => {
    expect(evaluateExpression('0.300 + 0.4')).toBeCloseTo(0.7);
    expect(evaluateExpression('1.200.000 * 0.85')).toBe(1020000);
    expect(evaluateExpression('0,15 * 100')).toBeCloseTo(15);
    expect(parseNumeric('0.300')).toBeCloseTo(0.3);
  });
  it('reads the answer the explanation concludes with', () => {
    expect(explainedOption(mkQ({ explanation: 'Langkah... Jawaban: C.' }))).toBe('C');
    expect(explainedOption(mkQ({ explanation: 'Jadi jawaban yang benar adalah opsi D (6).' }))).toBe('D');
    expect(explainedOption(mkQ({ explanation: 'Dengan demikian, jawaban yang benar adalah 4.' }))).toBe('B');
    expect(explainedOption(mkQ({ explanation: 'Dengan demikian, jawaban yang benar adalah 40.' }))).toBeUndefined();
    expect(explainedOption(mkQ({ explanation: 'Pilihan A salah karena terlalu kecil.' }))).toBeUndefined();
  });
  it('flags a key that disagrees with the explanation', () => {
    const v = validateQuestion(mkQ({ subtest: 'TWK', topic: 'Pancasila', reference: 'Sila 3', explanation: 'Jawaban: D.' }));
    expect(v.flags.map((f) => f.kind)).toEqual(['explanation-mismatch']);
    expect(validateQuestion(mkQ({ subtest: 'TWK', topic: 'Pancasila', reference: 'Sila 3', explanation: 'Jawaban: B.' })).flags).toEqual([]);
  });
  it('keeps the key when the explanation backs it against the formula', () => {
    // The formula says 5 (option C), but key and explanation both say B.
    const v = validateQuestion(mkQ({ mathExpression: '2 + 3', explanation: 'Hasilnya 4. Jawaban: B.' }));
    expect(v.answer).toBe('B');
    expect(v.flags.some((f) => f.kind === 'math-mismatch' && f.severity === 'warn')).toBe(true);
    // A formula that matches no option is only a note when key and explanation agree.
    const w = validateQuestion(mkQ({ mathExpression: '300.4', explanation: 'Jawaban yang benar adalah 4.' }));
    expect(w.flags.every((f) => f.severity === 'info')).toBe(true);
  });
  it('corrects the key when formula and explanation agree against it', () => {
    const v = validateQuestion(mkQ({ mathExpression: '2 + 3', explanation: 'Hasilnya 5. Jawaban: C.' }));
    expect(v.answer).toBe('C');
    expect(v.flags.some((f) => f.severity === 'warn')).toBe(false);
  });
  it('flags duplicates', () => {
    const v = validateQuestion(mkQ({ subtest: 'TWK', topic: 'UUD 1945', reference: 'Pasal 1', hash: 'abc' }), new Set(['abc']));
    expect(v.flags.map((f) => f.kind)).toEqual(['duplicate']);
  });
});

describe('figural generator', () => {
  it('produces 5 distinct options with exactly one key', () => {
    for (let i = 0; i < 200; i++) {
      for (const q of [generateFiguralSeries(['mudah', 'sedang', 'sulit'][i % 3] as 'mudah'), generateFiguralAnalogy(['mudah', 'sedang', 'sulit'][i % 3] as 'mudah')]) {
        expect(q.options).toHaveLength(5);
        const keys = new Set(q.options.map((o) => JSON.stringify({ ...o.figure, rotation: ((o.figure!.rotation % 360) + 360) % 360 })));
        expect(keys.size).toBe(5);
        expect(q.options.filter((o) => o.score === 5)).toHaveLength(1);
        expect(q.options.find((o) => o.score === 5)?.label).toBe(q.answer);
        expect(q.figure?.cells.filter((c) => c === null)).toHaveLength(1);
      }
    }
  });
  it('generates the requested count without duplicates', () => {
    const qs = generateFigural('Deret Figural', 'sedang', 8);
    expect(qs).toHaveLength(8);
    expect(new Set(qs.map((q) => JSON.stringify(q.figure))).size).toBe(8);
  });
});

describe('AI output parsing', () => {
  it('extracts JSON from fenced, chatty replies', () => {
    expect(extractJson('Berikut:\n```json\n{"questions":[]}\n```')).toEqual({ questions: [] });
    expect(extractJson('[{"a":1}]')).toEqual({ questions: [{ a: 1 }] });
  });
  it('assigns topic and difficulty from the requested slot', () => {
    const mk = (stem: string) => ({ stem, options: ['1', '2', '3', '4', '5'].map((t) => ({ text: t })), answer: 'A', explanation: '' });
    const qs = parseAiQuestions(JSON.stringify({ questions: [mk('Soal pertama sinonim'), mk('Soal kedua antonim')] }), {
      subtest: 'TIU',
      items: [
        { topic: 'Sinonim', difficulty: 'mudah' },
        { topic: 'Antonim', difficulty: 'sulit' },
      ],
    });
    expect(qs.map((q) => [q.topic, q.difficulty])).toEqual([
      ['Sinonim', 'mudah'],
      ['Antonim', 'sulit'],
    ]);
  });
  it('maps answers and TKP scores', () => {
    const text = JSON.stringify({
      questions: [
        {
          stem: 'Sila yang mencerminkan persatuan adalah…',
          options: ['Sila 1', 'Sila 2', 'Sila 3', 'Sila 4', 'Sila 5'].map((t, i) => ({ label: 'ABCDE'[i], text: t })),
          answer: 'c',
          explanation: 'Sila ke-3',
          reference: 'Sila ke-3 Pancasila',
        },
      ],
    });
    const [q] = parseAiQuestions(text, { subtest: 'TWK', items: [{ topic: 'Pancasila', difficulty: 'mudah' }] });
    expect(q.answer).toBe('C');
    expect(q.options.map((o) => o.score)).toEqual([0, 0, 5, 0, 0]);
    expect(q.reference).toBe('Sila ke-3 Pancasila');

    const tkp = JSON.stringify({
      questions: [{ stem: 'Anda melihat rekan kerja menerima uang dari warga…', options: [1, 2, 3, 4, 5].map((s) => ({ text: `opsi ${s}`, score: String(6 - s) })), explanation: '' }],
    });
    const [t] = parseAiQuestions(tkp, { subtest: 'TKP', items: [{ topic: 'Integritas Diri', difficulty: 'sedang' }] });
    expect(t.options.map((o) => o.score)).toEqual([5, 4, 3, 2, 1]);
    expect(t.answer).toBeUndefined();
  });
  it('rejects malformed payloads', () => {
    expect(() => parseAiQuestions('no json here', { subtest: 'TIU', items: [{ topic: 'Sinonim', difficulty: 'mudah' }] })).toThrow();
    expect(() => parseAiQuestions('{"questions":[{"stem":"x"}]}', { subtest: 'TIU', items: [{ topic: 'Sinonim', difficulty: 'mudah' }] })).toThrow();
  });
  it('asks for a math expression on numeric topics only', () => {
    expect(buildPrompt({ subtest: 'TIU', items: [{ topic: 'Aritmetika', difficulty: 'sedang' }] })).toContain('mathExpression');
    expect(buildPrompt({ subtest: 'TIU', items: [{ topic: 'Sinonim', difficulty: 'sedang' }] })).not.toContain('WAJIB isi "mathExpression"');
  });
});

describe('planning', () => {
  it('splits a full SKD into batches that add up to the blueprint', () => {
    const bp = buildPreset('full', DEFAULT_SETTINGS);
    const batches = planBatches(bp, 5);
    expect(batches.reduce((n, b) => n + b.count, 0)).toBe(110);
    expect(batches.every((b) => b.count <= 5)).toBe(true);
    for (const s of ['TWK', 'TIU', 'TKP'] as const) {
      expect(batches.filter((b) => b.subtest === s).reduce((n, b) => n + b.count, 0)).toBe(DEFAULT_SETTINGS.counts[s]);
    }
    // Mixed-topic batches keep the request count low: ceil(n/5) per sub-test plus figural (no AI).
    expect(batches.filter((b) => !isProcedural(b)).length).toBeLessThanOrEqual(6 + 6 + 9);
    expect(batches.filter(isProcedural).every((b) => new Set(b.items.map((i) => i.topic + i.difficulty)).size === 1)).toBe(true);
    const est = estimatePlan(batches, 'gemini-2.5-flash', DEFAULT_SETTINGS);
    expect(est.freeQuestions).toBeGreaterThan(0);
    expect(est.aiQuestions + est.freeQuestions).toBe(110);
    expect(est.costUsd[0]).toBeGreaterThan(0);
  });
});
