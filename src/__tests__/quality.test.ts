import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { exportBackup, importBackup } from '../db/backup';
import { answerStats, bankPriority, MIN_CALIBRATION_ANSWERS, reportFlag, withReportFlag, wrongRate } from '../domain/quality';
import { loadMath, validateQuestion } from '../domain/validators';
import type { Attempt, AttemptResult, Blueprint, OptionLabel, Question, QuestionReport } from '../domain/types';
import { saveFeedback } from '../engine/feedback';
import { revalidateStored } from '../engine/revalidate';
import { createRemedialSet, pickFromBank } from '../engine/sets';

beforeAll(() => loadMath());

let n = 0;
function mkQ(partial: Partial<Question> = {}): Question {
  const id = partial.id ?? `q${++n}`;
  return {
    id,
    subtest: 'TWK',
    topic: 'Pancasila',
    difficulty: 'sedang',
    stem: `Soal ${id}`,
    options: (['A', 'B', 'C', 'D', 'E'] as OptionLabel[]).map((label) => ({ label, text: `Opsi ${label} ${id}`, score: label === 'A' ? 5 : 0 })),
    answer: 'A',
    explanation: 'Jawaban: A.',
    reference: 'Sila 1',
    flags: [],
    locked: false,
    starred: false,
    hash: `h-${id}`,
    source: 'ai',
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

const report: QuestionReport = { reason: 'kunci-salah', note: 'Seharusnya B', at: 1 };

function mkAttempt(answers: Record<string, OptionLabel>, o: Partial<Attempt> = {}): Attempt {
  return {
    id: `a${++n}`,
    setId: 's',
    setName: 'Set',
    questionIds: Object.keys(answers),
    startedAt: 0,
    endsAt: 1,
    answers,
    flagged: [],
    timeSpent: {},
    currentIndex: 0,
    passing: { TWK: 0, TIU: 0, TKP: 0 },
    result: {} as AttemptResult,
    ...o,
  };
}

describe('report flag', () => {
  it('reads as a warning with the reason and note', () => {
    expect(reportFlag(report)).toEqual({ kind: 'user-report', severity: 'warn', message: 'Dilaporkan: kunci jawaban salah. "Seharusnya B"' });
    expect(reportFlag({ reason: 'usang', at: 1 }).message).toBe('Dilaporkan: usang atau tidak sesuai aturan terbaru.');
  });

  it('replaces or removes only its own flag', () => {
    const other = { kind: 'twk-unverified' as const, severity: 'warn' as const, message: 'x' };
    const flagged = withReportFlag([other], report);
    expect(flagged).toEqual([other, reportFlag(report)]);
    expect(withReportFlag(flagged, { reason: 'typo', at: 2 })).toEqual([other, reportFlag({ reason: 'typo', at: 2 })]);
    expect(withReportFlag(flagged, undefined)).toEqual([other]);
  });

  it('survives re-validation, which rebuilds every other flag', () => {
    const v = validateQuestion(mkQ({ report, flags: [] }));
    expect(v.flags).toContainEqual(reportFlag(report));
    expect(validateQuestion(mkQ()).flags.some((f) => f.kind === 'user-report')).toBe(false);
  });
});

describe('bank priority', () => {
  it('puts low-rated after the rest and reported last', () => {
    expect(bankPriority(mkQ())).toBe(0);
    expect(bankPriority(mkQ({ rating: 5 }))).toBe(0);
    expect(bankPriority(mkQ({ rating: 3 }))).toBe(0);
    expect(bankPriority(mkQ({ rating: 2 }))).toBe(1);
    expect(bankPriority(mkQ({ rating: 1, report }))).toBe(2);
  });
});

describe('calibrated difficulty', () => {
  const q1 = mkQ({ id: 'c1' });
  const tkp = mkQ({ id: 'c2', subtest: 'TKP', answer: undefined });

  it('counts answered TWK/TIU questions in finished exams and in practice', () => {
    const attempts = [
      mkAttempt({ c1: 'A', c2: 'B' }),
      mkAttempt({ c1: 'B' }),
      // Practice answers are final even before the session is finished.
      mkAttempt({ c1: 'C' }, { mode: 'practice', result: undefined }),
      // An unfinished exam can still change its answers.
      mkAttempt({ c1: 'D' }, { result: undefined }),
    ];
    const s = answerStats(attempts, [q1, tkp]);
    expect(s.get('c1')).toEqual({ answered: 3, wrong: 2 });
    expect(s.has('c2')).toBe(false);
  });

  it('gives a rate only once there are enough answers', () => {
    expect(wrongRate(undefined)).toBeNull();
    expect(wrongRate({ answered: MIN_CALIBRATION_ANSWERS - 1, wrong: 4 })).toBeNull();
    expect(wrongRate({ answered: 10, wrong: 7 })).toBe(0.7);
  });
});

describe('feedback in the bank', () => {
  const bp: Blueprint = { sections: [{ subtest: 'TWK', count: 3, topics: ['Pancasila'], difficulty: 'campuran' }], durationMinutes: 10, passing: { TWK: 0, TIU: 0, TKP: 0 } };

  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    // The startup re-check remembers its validator version here; start without one.
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  });

  it('saves, changes and withdraws a report and a rating', async () => {
    await db.questions.put(mkQ({ id: 'f1', flags: [{ kind: 'twk-unverified', severity: 'warn', message: 'x' }] }));
    let q = await saveFeedback('f1', { rating: 4, report: { reason: 'ambigu', note: '  dua jawaban  ', at: 5 } });
    expect(q?.rating).toBe(4);
    expect(q?.report).toEqual({ reason: 'ambigu', note: 'dua jawaban', at: 5 });
    expect(q?.flags.map((f) => f.kind)).toEqual(['twk-unverified', 'user-report']);

    q = await saveFeedback('f1', { rating: 9 });
    expect(q?.rating).toBe(5);
    expect(q?.report).toBeUndefined();
    expect(q?.flags.map((f) => f.kind)).toEqual(['twk-unverified']);

    q = await saveFeedback('f1', {});
    expect(q && 'rating' in q).toBe(false);
  });

  it('leaves reported questions out of new sets unless asked, and uses low-rated ones last', async () => {
    await db.questions.bulkPut([mkQ({ id: 'ok1' }), mkQ({ id: 'ok2' }), mkQ({ id: 'low', rating: 1 }), mkQ({ id: 'bad', report })]);
    for (let i = 0; i < 10; i++) {
      const { picked } = await pickFromBank(bp);
      expect(picked.map((q) => q.id).sort()).toEqual(['low', 'ok1', 'ok2']);
      const two = await pickFromBank({ ...bp, sections: [{ ...bp.sections[0], count: 2 }] });
      expect(two.picked.map((q) => q.id).sort()).toEqual(['ok1', 'ok2']);
    }
    const all = await pickFromBank({ ...bp, sections: [{ ...bp.sections[0], count: 4 }] }, { includeReported: true });
    expect(all.picked.map((q) => q.id).sort()).toEqual(['bad', 'low', 'ok1', 'ok2']);
  });

  it('keeps reported questions out of a weak-topics set', async () => {
    await db.questions.bulkPut([mkQ({ id: 'r1' }), mkQ({ id: 'r2', report })]);
    const set = await createRemedialSet([{ subtest: 'TWK', topic: 'Pancasila', score: 0, max: 10, total: 2 }], 2);
    expect(set.questionIds).toEqual(['r1']);
  });

  it('gives saved PPPK Manajerial questions the scores their explanation states', async () => {
    const options = (['A', 'B', 'C', 'D', 'E'] as const).map((label) => ({ label, text: `Tindakan ${label}`, score: 0 }));
    await db.questions.put(
      mkQ({
        id: 'm1',
        subtest: 'PPPK-MANAJERIAL',
        answer: undefined,
        options,
        explanation: 'A (skor 2): lambat. B (skor 4): tepat. C (skor 3): cukup. D (skor 1): pasif. E (skor 1): menghindar.',
      }),
    );
    // No scores anywhere: left as it is, still flagged for a repair.
    await db.questions.put(mkQ({ id: 'm2', subtest: 'PPPK-MANAJERIAL', answer: undefined, options, explanation: 'Opsi B paling tepat.' }));
    localStorage.setItem('validatorVersion', 'old');
    await revalidateStored();
    expect((await db.questions.get('m1'))?.options.map((o) => o.score)).toEqual([2, 4, 3, 1, 1]);
    expect((await db.questions.get('m2'))?.options.every((o) => o.score === 0)).toBe(true);
  });

  it('keeps the report through the startup re-check and a backup', async () => {
    await db.questions.put(mkQ({ id: 'k1', report, rating: 2, flags: [] }));
    await revalidateStored();
    expect((await db.questions.get('k1'))?.flags).toContainEqual(reportFlag(report));

    const file = new File([await exportBackup()], 'cadangan.json');
    await db.questions.clear();
    await importBackup(file);
    const back = await db.questions.get('k1');
    expect(back).toMatchObject({ report, rating: 2 });
  });
});
