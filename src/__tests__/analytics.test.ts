import { describe, expect, it } from 'vitest';
import { computeResult } from '../domain/scoring';
import type { Attempt, OptionLabel, Question, Subtest } from '../domain/types';
import { calibration, examSeries, likelyGuesses, reasonSummary, recommendations, timing, tkpPattern, topicMovers, topicStats, trend } from '../engine/analytics';

const LABELS: OptionLabel[] = ['A', 'B', 'C', 'D', 'E'];
let n = 0;

function mkQ(partial: Partial<Question> = {}): Question {
  return {
    id: `q${++n}`,
    subtest: 'TIU',
    topic: 'Aritmetika',
    difficulty: 'sedang',
    stem: 'Soal',
    options: LABELS.map((label) => ({ label, text: label, score: label === 'A' ? 5 : 0 })),
    answer: 'A',
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
const tkp = (topic = 'Pelayanan Publik') => mkQ({ subtest: 'TKP', topic, answer: undefined, options: LABELS.map((label, i) => ({ label, text: label, score: 5 - i })) });

function mkAttempt(questions: Question[], partial: Partial<Attempt> = {}): Attempt {
  const a: Attempt = {
    id: `a${++n}`,
    setId: 's1',
    setName: 'Set',
    mode: 'exam',
    questionIds: questions.map((q) => q.id),
    startedAt: n * 1000,
    endsAt: n * 1000 + 6_000_000,
    finishedAt: n * 1000 + 600_000,
    answers: {},
    flagged: [],
    timeSpent: {},
    currentIndex: 0,
    passing: { TWK: 0, TIU: 0, TKP: 0 },
    ...partial,
  };
  return { ...a, result: computeResult(questions, a.answers, a.passing) };
}

/** Same answer and time for each question, with overrides by index. */
function answered(questions: Question[], answer: OptionLabel, ms: number, overrides: Record<number, { answer?: OptionLabel | null; ms?: number }> = {}) {
  const answers: Record<string, OptionLabel> = {};
  const timeSpent: Record<string, number> = {};
  questions.forEach((q, i) => {
    const o = overrides[i] ?? {};
    const ans = o.answer === undefined ? answer : o.answer;
    if (ans) answers[q.id] = ans;
    timeSpent[q.id] = o.ms ?? ms;
  });
  return { answers, timeSpent };
}

describe('timing', () => {
  it('is empty without recorded time', () => {
    const qs = [mkQ(), mkQ()];
    expect(timing(mkAttempt(qs), qs)).toEqual([]);
  });

  it('averages per sub-test, finds slow questions and time spent on wrong ones', () => {
    const qs = Array.from({ length: 6 }, () => mkQ());
    // Five at 30 s, one at 3 min and wrong.
    const a = mkAttempt(qs, answered(qs, 'A', 30_000, { 5: { answer: 'B', ms: 180_000 } }));
    const [t] = timing(a, qs);
    expect(t.subtest).toBe('TIU');
    expect(t.timed).toBe(6);
    expect(t.avgMs).toBe(55_000);
    expect(t.slow.map((s) => s.index)).toEqual([5]);
    expect(t.wastedMs).toBe(180_000);
  });

  it('needs enough timed questions before calling one slow', () => {
    const qs = [mkQ(), mkQ()];
    const a = mkAttempt(qs, answered(qs, 'A', 10_000, { 1: { ms: 100_000 } }));
    expect(timing(a, qs)[0].slow).toEqual([]);
  });

  it('never counts TKP time as wasted', () => {
    const qs = Array.from({ length: 5 }, () => tkp());
    expect(timing(mkAttempt(qs, answered(qs, 'C', 40_000)), qs)[0].wastedMs).toBe(0);
  });
});

describe('topic stats', () => {
  it('counts wrong and empty per topic with the average time of timed questions', () => {
    const qs = [mkQ({ topic: 'Silogisme' }), mkQ({ topic: 'Silogisme' }), mkQ({ topic: 'Sinonim' })];
    const a = mkAttempt(qs, answered(qs, 'A', 20_000, { 0: { answer: null, ms: 0 }, 1: { answer: 'B', ms: 60_000 } }));
    const s = topicStats(a, qs).find((t) => t.topic === 'Silogisme')!;
    expect(s).toMatchObject({ total: 2, wrong: 2, avgMs: 60_000 });
  });
});

describe('calibration', () => {
  const qs = Array.from({ length: 8 }, () => mkQ());
  const flagged = qs.slice(0, 4).map((q) => q.id);

  it('needs enough answers on both sides', () => {
    expect(calibration(mkAttempt(qs, { ...answered(qs, 'A', 1000), flagged: flagged.slice(0, 2) }), qs)).toBeNull();
  });

  it('calls the marks accurate when unsure answers are clearly worse', () => {
    // Flagged: 1 of 4 right. Others: 4 of 4 right.
    const a = mkAttempt(qs, { ...answered(qs, 'A', 1000, { 0: { answer: 'B' }, 1: { answer: 'B' }, 2: { answer: 'B' } }), flagged });
    expect(calibration(a, qs)).toMatchObject({ flagged: 4, flaggedCorrect: 1, unflagged: 4, unflaggedCorrect: 4, verdict: 'akurat' });
  });

  it('calls it over-cautious when unsure answers are about as good', () => {
    const a = mkAttempt(qs, { ...answered(qs, 'A', 1000, { 7: { answer: 'B' } }), flagged });
    expect(calibration(a, qs)?.verdict).toBe('terlalu-hati');
  });

  it('ignores unanswered questions', () => {
    const a = mkAttempt(qs, { ...answered(qs, 'A', 1000, { 0: { answer: null }, 1: { answer: null } }), flagged });
    expect(calibration(a, qs)).toBeNull();
  });
});

describe('likely guesses', () => {
  it('flags correct, unmarked, much-faster-than-usual TWK/TIU answers', () => {
    const qs = Array.from({ length: 6 }, () => mkQ());
    // Average is about 52 s; a 4 s correct answer is suspicious, a 4 s wrong one or a marked one is not.
    const a = mkAttempt(qs, {
      ...answered(qs, 'A', 60_000, { 0: { ms: 4_000 }, 1: { ms: 4_000, answer: 'B' }, 2: { ms: 4_000 } }),
      flagged: [qs[2].id],
    });
    expect(likelyGuesses(a, qs).map((g) => g.index)).toEqual([0]);
  });

  it('says nothing about TKP or with too little data', () => {
    const t = Array.from({ length: 6 }, () => tkp());
    expect(likelyGuesses(mkAttempt(t, answered(t, 'A', 60_000, { 0: { ms: 1000 } })), t)).toEqual([]);
    const few = [mkQ(), mkQ()];
    expect(likelyGuesses(mkAttempt(few, answered(few, 'A', 60_000, { 0: { ms: 1000 } })), few)).toEqual([]);
  });
});

describe('TKP pattern', () => {
  it('counts chosen scores and missed top options', () => {
    const qs = [tkp(), tkp(), tkp(), tkp()];
    const a = mkAttempt(qs, answered(qs, 'A', 1000, { 1: { answer: 'B' }, 2: { answer: 'C' }, 3: { answer: null } }));
    expect(tkpPattern(a, qs)).toEqual({ answered: 3, chosen: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 }, missedBest: 2, avgScore: 4 });
    expect(tkpPattern(a, [mkQ()])).toBeNull();
  });
});

describe('reason summary', () => {
  it('counts tags per sub-test, most frequent first, skipping unknown questions', () => {
    const subtestOf = new Map<string, Subtest>([
      ['x', 'TIU'],
      ['y', 'TIU'],
      ['z', 'TWK'],
    ]);
    const s = reasonSummary(
      [
        { questionId: 'x', reasonTags: ['hitung'] },
        { questionId: 'y', reasonTags: ['hitung', 'terburu'] },
        { questionId: 'z', reasonTags: ['konsep'] },
        { questionId: 'gone', reasonTags: ['konsep'] },
      ],
      subtestOf,
    );
    expect(s[0]).toEqual({ subtest: 'TIU', tag: 'hitung', label: 'Salah hitung', count: 2 });
    expect(s).toHaveLength(3);
  });
});

describe('trends', () => {
  it('fits no line to one exam and projects nothing before three', () => {
    expect(trend([], 150)).toBeNull();
    expect(trend([60], 150)).toEqual({ n: 1, slope: 0, last: 60 });
    const two = trend([60, 70], 150)!;
    expect(two.slope).toBe(10);
    expect(two.projection).toBeUndefined();
  });

  it('projects the next exam with a range of at least 5% of the maximum', () => {
    const t = trend([60, 70, 80], 150)!;
    expect(t.slope).toBe(10);
    expect(t.projection).toEqual({ value: 90, low: 83, high: 98 });
  });

  it('widens the range with scatter and keeps it within 0..max', () => {
    const t = trend([140, 100, 150, 120], 150)!;
    expect(t.projection!.high).toBeLessThanOrEqual(150);
    expect(t.projection!.high - t.projection!.low).toBeGreaterThan(15);
    expect(trend([5, 3, 1], 150)!.projection!.low).toBe(0);
  });

  it('rescales partial sets and leaves practice out of the exam series', () => {
    const qs = Array.from({ length: 10 }, () => mkQ({ subtest: 'TWK', topic: 'Pancasila' }));
    const full = mkAttempt(qs, answered(qs, 'A', 1000, { 0: { answer: 'B' } }));
    const practice = mkAttempt(qs, { ...answered(qs, 'A', 1000), mode: 'practice' });
    const s = examSeries([practice, full], { TWK: 30, TIU: 35, TKP: 45 });
    expect(s.TWK).toHaveLength(1);
    // 45 of 50 on a 10-question set is 135 of 150.
    expect(s.TWK[0]).toMatchObject({ value: 135, max: 150 });
  });

  it('compares each topic in the latest exam with earlier exams', () => {
    const qs = [mkQ({ topic: 'Silogisme' }), mkQ({ topic: 'Silogisme' }), mkQ({ topic: 'Sinonim' })];
    const first = mkAttempt(qs, answered(qs, 'B', 1000));
    const second = mkAttempt(qs, answered(qs, 'A', 1000, { 2: { answer: 'B' } }));
    const m = topicMovers([first, second]);
    expect(m.find((x) => x.topic === 'Silogisme')).toMatchObject({ previousPct: 0, latestPct: 1, delta: 1 });
    expect(m.find((x) => x.topic === 'Sinonim')?.delta).toBe(0);
    expect(topicMovers([second])).toEqual([]);
  });
});

describe('recommendations', () => {
  it('tells an exam taker to answer every question, but not in practice', () => {
    const qs = [mkQ(), mkQ(), mkQ()];
    const exam = mkAttempt(qs, answered(qs, 'A', 1000, { 2: { answer: null } }));
    expect(recommendations(exam, qs)[0]).toMatchObject({ kind: 'unanswered' });
    expect(recommendations({ ...exam, mode: 'practice' }, qs).map((r) => r.kind)).not.toContain('unanswered');
  });

  it('names the weakest topic with a practice link', () => {
    const qs = [mkQ({ topic: 'Silogisme' }), mkQ({ topic: 'Silogisme' }), mkQ({ topic: 'Sinonim' }), mkQ({ topic: 'Sinonim' })];
    const a = mkAttempt(qs, answered(qs, 'A', 30_000, { 0: { answer: 'B' }, 1: { answer: 'B' }, 2: { answer: 'B' } }));
    const r = recommendations(a, qs).find((x) => x.kind === 'weak-topic')!;
    expect(r.practiceTopics).toEqual(['Silogisme']);
    expect(r.text).toContain('2 dari 2 jawaban salah');
  });

  it('falls back to the sub-test when every topic has a single question', () => {
    const qs = ['Pancasila', 'UUD 1945', 'NKRI', 'Integritas'].map((topic) => mkQ({ subtest: 'TWK', topic }));
    const a = mkAttempt(qs, answered(qs, 'B', 30_000, { 3: { answer: 'A' } }));
    const r = recommendations(a, qs).find((x) => x.kind === 'weak-topic')!;
    expect(r.text).toContain('Latih TWK: 3 dari 4 jawaban salah');
    expect(r.practiceTopics).toEqual(['Pancasila', 'UUD 1945', 'NKRI']);
  });

  it('does not call a topic weak because its questions were left empty', () => {
    const qs = [mkQ({ topic: 'Silogisme' }), mkQ({ topic: 'Silogisme' }), mkQ({ topic: 'Silogisme' })];
    const a = mkAttempt(qs, answered(qs, 'A', 1000, { 0: { answer: null }, 1: { answer: null }, 2: { answer: null } }));
    expect(recommendations(a, qs).map((r) => r.kind)).toEqual(['unanswered']);
  });

  it('points out time lost on wrong answers and missed TKP top options', () => {
    const qs = [...Array.from({ length: 4 }, () => mkQ()), tkp(), tkp(), tkp()];
    const a = mkAttempt(qs, answered(qs, 'A', 20_000, { 0: { answer: 'B', ms: 200_000 }, 4: { answer: 'C' }, 5: { answer: 'D' }, 6: { answer: 'B' } }));
    const kinds = recommendations(a, qs, 10).map((r) => r.kind);
    expect(kinds).toContain('wasted-time');
    expect(kinds).toContain('tkp');
  });

  it('leaves TKP to its own advice instead of repeating it as a weak topic', () => {
    const qs = ['Pelayanan Publik', 'Jejaring Kerja', 'Sosial Budaya', 'Profesionalisme'].map((t) => tkp(t));
    const kinds = recommendations(mkAttempt(qs, answered(qs, 'C', 1000)), qs).map((r) => r.kind);
    expect(kinds).toEqual(['tkp']);
  });

  it('gives at most three', () => {
    const qs = [...Array.from({ length: 8 }, () => mkQ({ topic: 'Silogisme' })), tkp(), tkp(), tkp()];
    const a = mkAttempt(qs, {
      ...answered(qs, 'B', 60_000, { 0: { answer: null }, 8: { answer: 'E' }, 9: { answer: 'E' }, 10: { answer: 'E' } }),
      flagged: qs.slice(0, 4).map((q) => q.id),
    });
    expect(recommendations(a, qs)).toHaveLength(3);
  });

  it('has nothing to say about a clean exam', () => {
    const qs = [mkQ(), mkQ()];
    expect(recommendations(mkAttempt(qs, answered(qs, 'A', 1000)), qs)).toEqual([]);
  });
});
