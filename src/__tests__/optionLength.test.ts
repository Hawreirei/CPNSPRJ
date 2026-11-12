import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { keyGiveaway, lengthCueFlag, longestGuess, optionLength, scoreFollowsLength, spearman } from '../domain/optionLength';
import { buildPassagePrompt, buildPrompt, buildRepairPrompt, SYSTEM_PROMPT } from '../domain/prompts';
import { placeKey } from '../domain/shuffle';
import type { OptionLabel, Question } from '../domain/types';
import { loadMath, validateQuestion } from '../domain/validators';
import { needsAutoRepair, needsRepair } from '../engine/repair';
import { revalidateStored } from '../engine/revalidate';

const LABELS = ['A', 'B', 'C', 'D', 'E'] as const;

let n = 0;
function mkQ(texts: string[], partial: Partial<Question> = {}): Question {
  const id = partial.id ?? `L${++n}`;
  return {
    id,
    subtest: 'TWK',
    topic: 'Pancasila',
    difficulty: 'sedang',
    stem: `Soal ${id}`,
    options: texts.map((text, i) => ({ label: LABELS[i], text, score: i === 0 ? 5 : 0 })),
    answer: 'A',
    explanation: 'Jawaban: A.',
    reference: 'Sila ke-3 Pancasila',
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

/** A TKP question with these option texts and scores. */
function tkp(texts: string[], scores: number[], partial: Partial<Question> = {}): Question {
  const q = mkQ(texts, { subtest: 'TKP', topic: 'Pelayanan Publik', answer: undefined, reference: undefined, ...partial });
  return { ...q, options: q.options.map((o, i) => ({ ...o, score: scores[i] })) };
}

// The pattern the learner found: the key carefully worded, the distractors short.
const GIVEAWAY_TWK = [
  'Mengutamakan musyawarah untuk mencapai mufakat yang diliputi semangat kekeluargaan',
  'Mengikuti suara terbanyak',
  'Menyerahkan kepada ketua',
  'Menunda keputusan rapat',
  'Memilih secara acak',
];
const BALANCED_TWK = [
  'Mengutamakan musyawarah untuk mencapai mufakat bersama',
  'Mengikuti keputusan suara terbanyak dalam rapat warga',
  'Menyerahkan keputusan sepenuhnya kepada ketua RT',
  'Menunda keputusan sampai seluruh warga dapat hadir',
  'Meminta pendapat tokoh masyarakat yang paling senior',
];
const GIVEAWAY_TKP = [
  'Melayani warga tersebut dengan ramah sesuai prosedur, lalu berkoordinasi dengan atasan agar antrean tetap tertib dan adil',
  'Meminta warga kembali besok',
  'Melayani warga itu lebih dulu',
  'Mengabaikan permintaan warga',
  'Menyerahkan ke rekan kerja',
];
const BALANCED_TKP = [
  'Menjelaskan aturan antrean dengan sopan lalu melayaninya sesuai nomor urut',
  'Melayani warga itu lebih dulu karena ia tampak sangat terburu-buru',
  'Meminta warga itu menunggu dan menanyakan kebijakan kepada atasan',
  'Menyarankan warga itu datang lagi esok pagi agar tidak perlu antre',
  'Meminta rekan kerja di loket lain untuk melayani warga tersebut',
];

beforeEach(async () => {
  await db.questions.clear();
});

describe('option length', () => {
  it('counts what a reader sees', () => {
    expect(optionLength('  dua   kata ')).toBe(8);
    expect(optionLength('$\\frac{1}{2}$')).toBe(3);
  });

  it('ranks with ties', () => {
    expect(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBeCloseTo(-1);
    expect(spearman([1, 1, 1, 1, 1], [1, 2, 3, 4, 5])).toBe(0);
  });
});

describe('answers given away by their length', () => {
  it('flags a TWK key that is clearly the longest option', () => {
    const q = mkQ(GIVEAWAY_TWK);
    expect(keyGiveaway(q)).toBe('longest');
    expect(lengthCueFlag(q)).toMatchObject({ kind: 'length-cue', severity: 'warn' });
    expect(lengthCueFlag(q)?.message).toContain('Jawaban benar (A)');
  });

  it('leaves options of about the same length alone, also when the key happens to be longest', () => {
    expect(lengthCueFlag(mkQ(BALANCED_TWK))).toBeNull();
    // Short factual options differ a little by nature.
    expect(lengthCueFlag(mkQ(['Persatuan Indonesia', 'Kedaulatan rakyat', 'Keadilan sosial', 'Gotong royong', 'Musyawarah']))).toBeNull();
    // …but not by half again: a learner would still pick the long one.
    expect(lengthCueFlag(mkQ(['Persatuan Indonesia', 'Ketuhanan', 'Kemanusiaan', 'Kerakyatan', 'Keadilan']))).not.toBeNull();
  });

  it('also flags the reverse pattern: a key clearly the shortest', () => {
    const q = mkQ(['Musyawarah mufakat', ...GIVEAWAY_TWK.slice(1).map((t) => `${t} sesuai ketentuan yang berlaku`)]);
    expect(keyGiveaway(q)).toBe('shortest');
    expect(lengthCueFlag(q)?.message).toContain('jauh lebih pendek');
  });

  it('flags a key that is long when it is not the first option either', () => {
    const q = placeKey(mkQ(GIVEAWAY_TWK), 3);
    expect(q.answer).toBe('D');
    expect(lengthCueFlag(q)?.message).toContain('(D)');
  });

  it('checks only AI questions with text options', () => {
    expect(lengthCueFlag(mkQ(GIVEAWAY_TWK, { source: 'import' }))).toBeNull();
    expect(lengthCueFlag(mkQ(GIVEAWAY_TWK, { source: 'manual' }))).toBeNull();
    const pictured = mkQ(GIVEAWAY_TWK, { subtest: 'TIU' });
    pictured.options[1] = { ...pictured.options[1], figure: { shape: 'circle', fill: 'solid', rotation: 0, count: 1 } };
    expect(lengthCueFlag(pictured)).toBeNull();
  });

  it('flags a TKP question whose best option is clearly the longest', () => {
    const q = tkp(GIVEAWAY_TKP, [5, 1, 3, 2, 4]);
    expect(lengthCueFlag(q)?.message).toContain('Opsi skor tertinggi (A)');
  });

  it('flags a TKP question whose scores rise with the options’ length', () => {
    // The best option is not the longest, but the longer ones score high: picking the longest still pays.
    const q = tkp(
      [
        'Melayani warga itu dengan ramah sesuai nomor antrean yang berlaku',
        'Melayani warga itu dengan ramah sesuai nomor antrean yang berlaku di kantor ini',
        'Menjelaskan aturan antrean kepada warga',
        'Meminta warga datang lagi',
        'Mengabaikan warga',
      ],
      [5, 4, 3, 2, 1],
    );
    expect(keyGiveaway(q)).toBeNull();
    expect(scoreFollowsLength(q)).toBe(true);
    expect(lengthCueFlag(q)?.message).toContain('Makin panjang opsinya');
    // Scores that fall with length give it away just the same.
    const reversed = tkp(
      q.options.map((o) => o.text),
      [2, 1, 3, 5, 4],
    );
    expect(keyGiveaway(reversed)).toBeNull();
    expect(lengthCueFlag(reversed)?.message).toContain('opsi terpendek');
  });

  it('leaves balanced TKP options alone', () => {
    expect(lengthCueFlag(tkp(BALANCED_TKP, [5, 2, 4, 1, 3]))).toBeNull();
  });

  it('marks the question "perlu dicek" and has it rewritten right after generation', async () => {
    await loadMath();
    const v = validateQuestion(mkQ(GIVEAWAY_TWK));
    expect(v.flags.map((f) => f.kind)).toContain('length-cue');
    expect(needsRepair(v)).toBe(true);
    expect(needsAutoRepair(v)).toBe(true);
    const t = validateQuestion(tkp(GIVEAWAY_TKP, [5, 1, 3, 2, 4]));
    expect(t.flags.map((f) => f.kind)).toContain('length-cue');
    expect(needsAutoRepair(t)).toBe(true);
    expect(validateQuestion(mkQ(BALANCED_TWK)).flags.map((f) => f.kind)).not.toContain('length-cue');
  });

  it('marks saved TWK and TKP questions once at startup', async () => {
    await db.questions.bulkPut([mkQ(GIVEAWAY_TWK, { id: 'old-twk' }), tkp(GIVEAWAY_TKP, [5, 1, 3, 2, 4], { id: 'old-tkp' }), tkp(BALANCED_TKP, [5, 2, 4, 1, 3], { id: 'ok-tkp' })]);
    const store = new Map<string, string>([['validatorVersion', '3']]);
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    await revalidateStored();
    const kinds = async (id: string) => (await db.questions.get(id))!.flags.map((f) => f.kind);
    expect(await kinds('old-twk')).toContain('length-cue');
    expect(await kinds('old-tkp')).toContain('length-cue');
    expect(await kinds('ok-tkp')).not.toContain('length-cue');
    expect(store.get('validatorVersion')).toBe('4');
    vi.unstubAllGlobals();
  });
});

describe('always picking the longest option', () => {
  it('scores what the learner found on a biased set, and near chance on a balanced one', () => {
    const biased = [...Array.from({ length: 10 }, () => mkQ(GIVEAWAY_TWK)), ...Array.from({ length: 10 }, () => tkp(GIVEAWAY_TKP, [5, 1, 3, 2, 4]))];
    expect(longestGuess(biased)).toEqual({ keyed: 10, right: 10, keyedChance: expect.closeTo(0.2), graded: 10, gradedShare: 1, gradedChance: expect.closeTo(0.6) });

    // The same options with the key in a different place each time: the longest is right only by chance.
    const keys: OptionLabel[] = ['A', 'B', 'C', 'D', 'E'];
    const balanced = [
      ...Array.from({ length: 10 }, (_, i) => mkQ(BALANCED_TWK, { answer: keys[i % 5] })),
      ...Array.from({ length: 10 }, (_, i) =>
        tkp(
          BALANCED_TKP,
          [1, 2, 3, 4, 5].map((s) => ((s + i) % 5) + 1),
        ),
      ),
    ];
    const r = longestGuess(balanced);
    expect(r.right / r.keyed).toBeCloseTo(0.2);
    expect(r.gradedShare).toBeCloseTo(0.6);
  });
});

describe('prompts ask for options of equal length', () => {
  it('in every request, and in more detail for TWK and TKP', () => {
    expect(SYSTEM_PROMPT).toContain('PANJANG OPSI SETARA');
    const twk = buildPrompt({ subtest: 'TWK', items: [{ topic: 'Pancasila', difficulty: 'sedang' }] });
    expect(twk).toContain('Pengecoh ditulis sejenis dan sepanjang opsi benar');
    const tkpPrompt = buildPrompt({ subtest: 'TKP', items: [{ topic: 'Pelayanan Publik', difficulty: 'sedang' }] });
    expect(tkpPrompt).toContain('Opsi skor 5 TIDAK boleh lebih panjang');
    expect(tkpPrompt).toContain('Panjang opsi tidak boleh naik atau turun seiring skornya');
    expect(buildPassagePrompt({ items: [{ topic: 'Pemahaman Bacaan', difficulty: 'sedang' }], sizes: [1] })).toContain('sama panjang dan sama rinci');
  });

  it('and a repair says what to do about it', async () => {
    await loadMath();
    const q = validateQuestion(mkQ(GIVEAWAY_TWK));
    const prompt = buildRepairPrompt('TWK', [q]);
    expect(prompt).toContain('jauh lebih panjang daripada opsi lain');
    expect(prompt).toContain('Bila masalahnya panjang opsi');
  });
});
