import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { importBackup } from '../db/backup';
import { buildPreset, DEFAULT_SETTINGS } from '../domain/blueprint';
import { attemptMode, attemptPath, examAttempts, feedback, filterQuestions, isTimed, UNTIMED } from '../domain/practice';
import type { Attempt, OptionLabel, QSet, Question } from '../domain/types';
import { finishAttempt, startAttempt } from '../engine/attempts';

const LABELS: OptionLabel[] = ['A', 'B', 'C', 'D', 'E'];

function mkQ(partial: Partial<Question>): Question {
  return {
    id: Math.random().toString(36).slice(2),
    subtest: 'TIU',
    topic: 'Aritmetika',
    difficulty: 'sedang',
    stem: 'Berapa 2 + 2?',
    options: LABELS.map((label, i) => ({ label, text: String(i + 3), score: label === 'B' ? 5 : 0 })),
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

const tkp = (partial: Partial<Question> = {}) =>
  mkQ({ subtest: 'TKP', topic: 'Pelayanan Publik', answer: undefined, options: LABELS.map((label, i) => ({ label, text: label, score: i + 1 })), ...partial });

describe('practice helpers', () => {
  it('treats attempts saved before practice mode as exams', () => {
    expect(attemptMode({})).toBe('exam');
    expect(attemptMode({ mode: 'practice' })).toBe('practice');
    expect(examAttempts([{ mode: 'practice' }, {}, { mode: 'exam' }])).toHaveLength(2);
  });

  it('routes each attempt to the page for its mode', () => {
    expect(attemptPath({ id: 'x' })).toBe('/cat/x');
    expect(attemptPath({ id: 'x', mode: 'practice' })).toBe('/practice/x');
    expect(attemptPath({ id: 'x', mode: 'practice', result: { perSubtest: [], topics: [], total: 0, maxTotal: 0, passedAll: false } })).toBe('/results/x');
  });

  it('knows untimed attempts and keeps the sentinel JSON-safe', () => {
    expect(isTimed({ endsAt: Date.now() + 60_000 })).toBe(true);
    expect(isTimed({ endsAt: UNTIMED })).toBe(false);
    expect(JSON.parse(JSON.stringify({ endsAt: UNTIMED })).endsAt).toBe(UNTIMED);
  });

  it('filters by sub-test and topic, empty lists meaning no restriction', () => {
    const qs = [mkQ({}), mkQ({ topic: 'Deret Angka' }), tkp(), mkQ({ subtest: 'TWK', topic: 'Pancasila', answer: 'A' })];
    expect(filterQuestions(qs)).toHaveLength(4);
    expect(filterQuestions(qs, { subtests: [], topics: [] })).toHaveLength(4);
    expect(filterQuestions(qs, { subtests: ['TIU'] })).toHaveLength(2);
    expect(filterQuestions(qs, { topics: ['Deret Angka', 'Pancasila'] }).map((q) => q.topic)).toEqual(['Deret Angka', 'Pancasila']);
    expect(filterQuestions(qs, { subtests: ['TKP'], topics: ['Pancasila'] })).toHaveLength(0);
  });

  it('gives TWK/TIU feedback against the key', () => {
    const q = mkQ({});
    expect(feedback(q, 'B')).toEqual({ correct: true, score: 5, best: ['B'] });
    expect(feedback(q, 'D')).toEqual({ correct: false, score: 0, best: ['B'] });
  });

  it('gives TKP feedback as the option score and the top option', () => {
    const q = tkp();
    expect(feedback(q, 'E')).toEqual({ correct: true, score: 5, best: ['E'] });
    expect(feedback(q, 'B')).toEqual({ correct: false, score: 2, best: ['E'] });
  });
});

describe('practice attempts', () => {
  let set: QSet;
  let qs: Question[];

  beforeEach(async () => {
    await Promise.all([db.sets.clear(), db.questions.clear(), db.attempts.clear(), db.meta.clear()]);
    qs = [mkQ({}), mkQ({ topic: 'Deret Angka' }), tkp(), tkp({ topic: 'Jejaring Kerja' })];
    await db.questions.bulkAdd(qs);
    set = {
      id: 's1',
      name: 'Set uji',
      blueprint: buildPreset('mini', DEFAULT_SETTINGS),
      questionIds: qs.map((q) => q.id),
      status: 'ready',
      source: 'bank',
      batches: [],
      usage: { inputTokens: 0, outputTokens: 0, requests: 0 },
      createdAt: 0,
      updatedAt: 0,
    };
    await db.sets.add(set);
  });

  it('keeps only the chosen topics and has no time limit by default', async () => {
    const a = await startAttempt('s1', { shuffleQuestions: false, durationMinutes: 0, mode: 'practice', filter: { topics: ['Aritmetika', 'Jejaring Kerja'] } });
    expect(a.mode).toBe('practice');
    expect(a.endsAt).toBe(UNTIMED);
    expect(a.questionIds).toEqual([qs[0].id, qs[3].id]);
  });

  it('ignores the filter for exams', async () => {
    const a = await startAttempt('s1', { shuffleQuestions: false, durationMinutes: 10, mode: 'exam', filter: { topics: ['Aritmetika'] } });
    expect(a.questionIds).toHaveLength(4);
    expect(isTimed(a)).toBe(true);
  });

  it('refuses a filter that matches nothing', async () => {
    await expect(startAttempt('s1', { shuffleQuestions: false, durationMinutes: 0, mode: 'practice', filter: { topics: ['Pancasila'] } })).rejects.toThrow();
  });

  it('finishes an untimed attempt at the real finish time', async () => {
    const a = await startAttempt('s1', { shuffleQuestions: false, durationMinutes: 0, mode: 'practice' });
    await db.attempts.update(a.id, { answers: { [qs[0].id]: 'B', [qs[2].id]: 'C' } });
    const before = Date.now();
    const done = await finishAttempt(a.id);
    expect(done!.finishedAt).toBeGreaterThanOrEqual(before);
    expect(done!.finishedAt).toBeLessThan(UNTIMED);
    expect(done!.result!.total).toBe(5 + 3);
  });

  it('imports an old backup whose attempts have no mode as exams', async () => {
    const legacy: Omit<Attempt, 'mode'> = {
      id: 'old',
      setId: 's1',
      setName: 'Set uji',
      questionIds: [qs[0].id],
      startedAt: 1,
      endsAt: 2,
      finishedAt: 2,
      answers: {},
      flagged: [],
      timeSpent: {},
      currentIndex: 0,
      passing: { TWK: 0, TIU: 0, TKP: 0 },
    };
    const file = new File([JSON.stringify({ app: 'cpns-skd-builder', version: 1, sets: [], questions: [], attempts: [legacy] })], 'backup.json');
    await importBackup(file);
    const a = await db.attempts.get('old');
    expect(a && attemptMode(a)).toBe('exam');
    expect(attemptPath(a!)).toBe('/cat/old');
  });
});
