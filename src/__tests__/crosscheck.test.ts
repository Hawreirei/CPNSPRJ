import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../providers', async (importOriginal) => ({ ...(await importOriginal<typeof import('../providers')>()), complete: vi.fn() }));

import { db } from '../db';
import { buildPreset, DEFAULT_SETTINGS } from '../domain/blueprint';
import { buildCrossCheckPrompt } from '../domain/prompts';
import { parseCrossCheck } from '../domain/schemas';
import type { Flag, OptionLabel, Question } from '../domain/types';
import { applyCrossCheck, estimateCrossCheck, isCrossCheckable, needsCrossCheck, runCrossCheck } from '../engine/crosscheck';
import { planBatches } from '../engine/plan';
import type { ModelSession } from '../engine/session';
import { complete } from '../providers';

const LABELS: OptionLabel[] = ['A', 'B', 'C', 'D', 'E'];
let n = 0;
function mkQ(partial: Partial<Question> = {}): Question {
  return {
    id: `q${++n}`,
    subtest: 'TWK',
    topic: 'Pancasila',
    difficulty: 'sedang',
    stem: `Soal nomor ${n}`,
    options: LABELS.map((label) => ({ label, text: `Opsi ${label}`, score: label === 'A' ? 5 : 0 })),
    answer: 'A',
    explanation: 'Pembahasan rahasia. Jawaban: A.',
    reference: 'Pasal 1',
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
const tkp = () => mkQ({ subtest: 'TKP', topic: 'Pelayanan Publik', answer: undefined, options: LABELS.map((label, i) => ({ label, text: `Tindakan ${label}`, score: [3, 5, 1, 2, 4][i] })) });

describe('what gets checked', () => {
  it('takes AI-written TWK, TKP and non-numeric TIU only', () => {
    expect(isCrossCheckable(mkQ())).toBe(true);
    expect(isCrossCheckable(tkp())).toBe(true);
    expect(isCrossCheckable(mkQ({ subtest: 'TIU', topic: 'Silogisme' }))).toBe(true);
    expect(isCrossCheckable(mkQ({ subtest: 'TIU', topic: 'Aritmetika' }))).toBe(false);
    expect(isCrossCheckable(mkQ({ subtest: 'TIU', topic: 'Penalaran Analitis', mathExpression: '2+2' }))).toBe(false);
    expect(isCrossCheckable(mkQ({ subtest: 'TIU', topic: 'Deret Figural', source: 'procedural' }))).toBe(false);
    expect(isCrossCheckable(mkQ({ source: 'manual' }))).toBe(false);
  });

  it('estimates the extra requests for a set', () => {
    // Full SKD: 30 TWK, 45 TKP, and the 35 TIU minus numeric and figural topics.
    const est = estimateCrossCheck(planBatches(buildPreset('full', DEFAULT_SETTINGS), 20));
    expect(est.questions).toBeGreaterThan(75);
    expect(est.questions).toBeLessThan(110);
    // 30 TWK → 2, 45 TKP → 3, ~18 TIU → 2.
    expect(est.requests).toBe(7);
  });
});

describe('prompt and reply', () => {
  it('shows stems and options but never the key, explanation, reference or TKP scores', () => {
    const p = buildCrossCheckPrompt('TKP', [tkp()]);
    expect(p).toContain('1. Soal nomor');
    expect(p).toContain('B. Tindakan B');
    expect(p).not.toMatch(/score|skor 5|Pembahasan rahasia|Pasal 1|"answer": "B"/);
    const twk = buildCrossCheckPrompt('TWK', [mkQ(), mkQ()]);
    expect(twk).toContain('2. Soal nomor');
    expect(twk).not.toContain('Jawaban: A');
  });

  it('parses answers by number, dropping invalid entries', () => {
    const r = parseCrossCheck('```json\n{"answers":[{"no":1,"answer":"c","reason":"karena"},{"no":2,"answer":"Z"},{"no":"3","answer":"B"},{"no":1,"answer":"D"}]}\n```');
    expect([...r.entries()]).toEqual([
      [1, { answer: 'C', reason: 'karena' }],
      [3, { answer: 'B', reason: '' }],
    ]);
    expect(() => parseCrossCheck('{"answers":[]}')).toThrow();
  });
});

describe('flags from a reply', () => {
  const other: Flag = { kind: 'twk-unverified', severity: 'warn', message: 'x' };

  it('marks agreement as checked, keeping other flags', () => {
    const flags = applyCrossCheck(mkQ({ flags: [other] }), { answer: 'A', reason: '' }, 'model-2');
    expect(flags).toEqual([other, { kind: 'cross-checked', severity: 'info', message: 'Diperiksa silang oleh model-2: jawabannya sama.' }]);
  });

  it('warns on a different answer with the checker\'s reason, and never touches the key', () => {
    const q = mkQ();
    const [f] = applyCrossCheck(q, { answer: 'C', reason: 'Sila ke-2 lebih tepat' }, 'model-2');
    expect(f).toMatchObject({ kind: 'cross-check-mismatch', severity: 'warn' });
    expect(f.message).toContain('memilih jawaban C, bukan A');
    expect(f.message).toContain('Sila ke-2 lebih tepat');
    expect(q.answer).toBe('A');
  });

  it('judges TKP by whether the checker picked the top-scored option', () => {
    expect(applyCrossCheck(tkp(), { answer: 'B', reason: '' }, 'm')[0].kind).toBe('cross-checked');
    const [f] = applyCrossCheck(tkp(), { answer: 'E', reason: '' }, 'm');
    expect(f.message).toContain('opsi E (skor 4) sebagai yang paling tepat, bukan B');
  });

  it('replaces an earlier cross-check result', () => {
    const first = applyCrossCheck(mkQ(), { answer: 'C', reason: '' }, 'm');
    const again = applyCrossCheck(mkQ({ flags: first }), { answer: 'A', reason: '' }, 'm');
    expect(again.map((f) => f.kind)).toEqual(['cross-checked']);
    expect(needsCrossCheck(mkQ({ flags: again }))).toBe(false);
  });
});

describe('running a check', () => {
  const session = (rpd: number): ModelSession => ({
    cfg: { provider: 'gemini', model: 'checker-1', apiKey: 'x' },
    keyId: 'k',
    autoModel: false,
    key: { id: 'k', provider: 'gemini', limits: { rpm: 0, tpm: 0, rpd } },
  });

  beforeEach(async () => {
    await Promise.all([db.questions.clear(), db.requests.clear(), db.meta.clear()]);
    // The fake checker answers A, except B for any question whose stem says BEDA.
    vi.mocked(complete).mockImplementation(async (_cfg, { prompt }) => {
      const answers = [...prompt.matchAll(/^(\d+)\. (.*)$/gm)].map(([, no, stem]) => ({ no: Number(no), answer: stem.includes('BEDA') ? 'B' : 'A', reason: 'uji' }));
      return { text: JSON.stringify({ answers }), inputTokens: 100, outputTokens: 50 };
    });
  });

  it('flags disagreements, records agreement, and skips what it need not check', async () => {
    const qs = [mkQ(), mkQ({ stem: 'Soal BEDA' }), mkQ({ subtest: 'TIU', topic: 'Aritmetika' })];
    await db.questions.bulkAdd(qs);
    const usage = vi.fn(async () => {});
    const r = await runCrossCheck(session(0), qs, new AbortController().signal, usage);
    expect(r).toEqual({ checked: 2, mismatched: 1, pending: 0 });
    expect(usage).toHaveBeenCalledTimes(1);
    expect((await db.questions.get(qs[0].id))!.flags.map((f) => f.kind)).toEqual(['cross-checked']);
    expect((await db.questions.get(qs[1].id))!.flags.map((f) => f.kind)).toEqual(['cross-check-mismatch']);
    expect((await db.questions.get(qs[2].id))!.flags).toEqual([]);
  });

  it('keeps edits made while the check ran', async () => {
    const q = mkQ();
    await db.questions.add(q);
    vi.mocked(complete).mockImplementationOnce(async () => {
      await db.questions.update(q.id, { starred: true });
      return { text: '{"answers":[{"no":1,"answer":"A"}]}', inputTokens: 1, outputTokens: 1 };
    });
    await runCrossCheck(session(0), [q], new AbortController().signal, async () => {});
    expect(await db.questions.get(q.id)).toMatchObject({ starred: true, flags: [{ kind: 'cross-checked' }] });
  });

  it('marks the rest pending when the daily quota runs out', async () => {
    // 16 TWK questions: two requests of 15 and 1, but only one request left today.
    const qs = Array.from({ length: 16 }, () => mkQ());
    await db.questions.bulkAdd(qs);
    const r = await runCrossCheck(session(1), qs, new AbortController().signal, async () => {});
    expect(r).toEqual({ checked: 15, mismatched: 0, pending: 1 });
    expect((await db.questions.get(qs[15].id))!.flags.map((f) => f.kind)).toEqual(['cross-check-pending']);
    expect(needsCrossCheck((await db.questions.get(qs[15].id))!)).toBe(true);
  });
});
