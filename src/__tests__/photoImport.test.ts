import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { PPPK_2024, SKD_CPNS } from '../domain/examPackage';
import { buildImportPrompt, imageTokens, moveToSubtest, pageCost, parseImportedPage, type ImportTarget } from '../domain/photoImport';
import { parseShared, toShared } from '../domain/share';
import type { Question } from '../domain/types';
import { loadMath } from '../domain/validators';
import { addKey } from '../engine/keys';
import { extractPage, pageEstimate, saveImported } from '../engine/photoImport';
import { complete } from '../providers';

const SKD: ImportTarget = { pkg: SKD_CPNS, topics: { TWK: ['Pancasila', 'UUD 1945'], TIU: ['Aritmetika'], TKP: ['Pelayanan Publik'] } };
const opts = (...texts: string[]) => texts.map((text, i) => ({ label: 'ABCDE'[i], text }));
const reply = (...questions: object[]) => JSON.stringify({ questions });
const TWK = {
  no: 1,
  subtest: 'TWK',
  topic: 'pancasila',
  difficulty: 'mudah',
  stem: 'Sila keempat Pancasila berbunyi …',
  options: opts('Ketuhanan', 'Kemanusiaan', 'Persatuan', 'Kerakyatan yang dipimpin …', 'Keadilan'),
  answer: 'D',
  answerFromPage: true,
  explanation: 'Sila keempat tentang kerakyatan.',
};

beforeEach(async () => {
  await loadMath();
});

describe('reading a page of questions', () => {
  it('takes a complete question as it is, marked to check against the page', () => {
    const r = parseImportedPage(reply(TWK), SKD);
    expect(r.skipped).toEqual([]);
    expect(r.drafts).toHaveLength(1);
    const { question: q, notes } = r.drafts[0];
    expect(q).toMatchObject({ subtest: 'TWK', topic: 'Pancasila', difficulty: 'mudah', answer: 'D', source: 'import', confidence: 'low' });
    expect(q.options.map((o) => o.score)).toEqual([0, 0, 0, 5, 0]);
    expect(q.options[3].text).toBe('Kerakyatan yang dipimpin …');
    expect(q.flags.map((f) => f.kind)).toContain('import-unchecked');
    expect(q.flags.find((f) => f.kind === 'import-unchecked')?.severity).toBe('warn');
    expect(notes).toEqual([]);
  });

  it('says when the key is the model’s guess, or missing', () => {
    const guessed = parseImportedPage(reply({ ...TWK, answerFromPage: false }), SKD).drafts[0];
    expect(guessed.notes).toEqual(['Kunci jawaban diusulkan AI, bukan dari halaman. Periksa.']);
    const none = parseImportedPage(reply({ ...TWK, answer: null }), SKD).drafts[0];
    expect(none.notes).toEqual(['Kunci jawaban tidak ditemukan; pilih sendiri lewat Edit.']);
    expect(none.question.flags.map((f) => f.message)).toContain('Kunci jawaban tidak ditemukan.');
  });

  it('skips questions with too few options, a figure, or cut off, and says why', () => {
    const r = parseImportedPage(
      reply(
        { ...TWK, no: 3, options: opts('Satu', 'Dua', 'Tiga') },
        { ...TWK, no: 4, figure: true, options: [] },
        { ...TWK, no: 5, incomplete: true },
        { ...TWK, no: 6, stem: '' },
        TWK,
      ),
      SKD,
    );
    expect(r.drafts).toHaveLength(1);
    expect(r.skipped).toEqual([
      { no: 3, reason: 'opsinya hanya 3; perlu paling sedikit 4' },
      { no: 4, reason: 'pilihan jawabannya berupa gambar; soal seperti ini belum bisa diimpor' },
      { no: 5, reason: 'terpotong atau tidak terbaca di halaman ini' },
      { no: 6, reason: 'teks soalnya tidak terbaca' },
    ]);
  });

  it('puts a question of an unknown sub-test in the first one, with a note', () => {
    const d = parseImportedPage(reply({ ...TWK, subtest: 'TBI' }), SKD).drafts[0];
    expect(d.question.subtest).toBe('TWK');
    expect(d.notes[0]).toBe('Sub-tes "TBI" tidak dikenali; dipasang ke TWK. Ganti bila perlu.');
  });

  it('follows the sub-test the learner picked, over the model’s', () => {
    const d = parseImportedPage(reply({ ...TWK, subtest: 'TWK' }), { ...SKD, subtest: 'TIU' }).drafts[0];
    expect(d.question.subtest).toBe('TIU');
    expect(d.question.topic).toBe('pancasila');
    expect(d.notes).toEqual([]);
  });

  it('reads graded options in the package’s range', () => {
    const pppk: ImportTarget = { pkg: PPPK_2024, topics: { 'PPPK-SOSKUL': ['Empati'] } };
    const d = parseImportedPage(
      reply({
        subtest: 'PPPK-SOSKUL',
        topic: 'Empati',
        stem: 'Rekan kerja Anda sedang berduka. Anda …',
        options: [4, 1, 9, 2, 3].map((score, i) => ({ text: `Sikap ${i}`, score })),
      }),
      pppk,
    ).drafts[0];
    expect(d.question.answer).toBeUndefined();
    expect(d.question.options.map((o) => o.score)).toEqual([4, 1, 4, 2, 3]);
    expect(d.notes).toEqual(['Skor setiap opsi diusulkan AI. Periksa.']);
  });

  it('returns nothing for a page without questions, and refuses a reply that is not the JSON asked for', () => {
    expect(parseImportedPage('{"questions": []}', SKD)).toEqual({ drafts: [], skipped: [] });
    expect(() => parseImportedPage('Maaf, saya tidak bisa membaca gambar ini.', SKD)).toThrow();
    expect(() => parseImportedPage('{"soal": 1}', SKD)).toThrow('tidak berisi daftar soal');
  });

  it('notes a question the bank already has', () => {
    const first = parseImportedPage(reply(TWK), SKD).drafts[0].question;
    const again = parseImportedPage(reply(TWK), SKD, new Set([first.hash])).drafts[0].question;
    expect(again.flags.map((f) => f.kind)).toContain('duplicate');
  });

  it('moves a draft between a keyed and a graded sub-test without losing the key', () => {
    const q = parseImportedPage(reply(TWK), SKD).drafts[0].question;
    const tkp = moveToSubtest(q, 'TKP', ['Pelayanan Publik']);
    expect(tkp).toMatchObject({ subtest: 'TKP', topic: 'Pelayanan Publik', answer: undefined });
    expect(tkp.options.map((o) => o.score)).toEqual([1, 1, 1, 5, 1]);
    const back = moveToSubtest(tkp, 'TIU', ['Aritmetika']);
    expect(back.answer).toBe('D');
    expect(back.options.map((o) => o.score)).toEqual([0, 0, 0, 5, 0]);
  });

  it('asks for the package’s sub-tests and topics, or only the one picked', () => {
    const all = buildImportPrompt(SKD);
    expect(all).toContain('- TWK (Tes Wawasan Kebangsaan): satu jawaban benar. Topik: Pancasila, UUD 1945.');
    expect(all).toContain('- TKP (Tes Karakteristik Pribadi): setiap opsi diberi "score" 1 sampai 5');
    expect(all).toContain('"figure": true');
    const one = buildImportPrompt({ ...SKD, subtest: 'TIU' });
    expect(one).toContain('Semua soal di halaman ini sub-tes TIU');
    expect(one).not.toContain('- TWK');
  });

  it('estimates what a page costs', () => {
    expect(imageTokens('gemini', 1109, 1568)).toBe(1120);
    expect(imageTokens('anthropic', 1109, 1568)).toBe(1600);
    expect(imageTokens('anthropic', 600, 800)).toBe(640);
    // 1109 × 1568 → 768 × 1086 → 2 × 3 tiles.
    expect(imageTokens('openai', 1109, 1568)).toBe(85 + 170 * 6);
    expect(pageCost('x'.repeat(350), 1000, { input: 1, output: 4 })).toBeCloseTo((Math.ceil((350 + 260) / 3.5) + 1000 + 5000 * 4) / 1e6, 4);
  });
});

describe('sending a page image', () => {
  const image = { mimeType: 'image/jpeg' as const, data: 'AAAA' };
  afterEach(() => vi.unstubAllGlobals());

  function stub(status = 200, body: unknown = {}) {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      }),
    );
    return calls;
  }

  it('goes to Gemini as inline data before the prompt', async () => {
    const calls = stub(200, { candidates: [{ content: { parts: [{ text: '{"questions": []}' }] } }] });
    await complete({ provider: 'gemini', apiKey: 'k', model: 'm' }, { system: 's', prompt: 'p', images: [image] });
    expect((calls[0].body.contents as unknown[])[0]).toEqual({ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }, { text: 'p' }] });
  });

  it('goes to OpenAI and compatible servers as an image_url part', async () => {
    const calls = stub(200, { choices: [{ message: { content: '{"questions": []}' } }] });
    await complete({ provider: 'openai', apiKey: 'k', model: 'gpt-5.4-mini' }, { system: 's', prompt: 'p', images: [image] });
    expect((calls[0].body.messages as { content: unknown }[])[1].content).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA', detail: 'high' } },
      { type: 'text', text: 'p' },
    ]);
  });

  it('goes to Claude as a base64 image block', async () => {
    const calls = stub(200, {
      id: 'm',
      type: 'message',
      role: 'assistant',
      model: 'c',
      content: [{ type: 'text', text: '{}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await complete({ provider: 'anthropic', apiKey: 'k', model: 'claude-haiku-4-5' }, { system: 's', prompt: 'p', images: [image] });
    expect((calls[0].body.messages as { content: unknown }[])[0].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
      { type: 'text', text: 'p' },
    ]);
  });

  it('says the model cannot read images when a request with one is refused', async () => {
    stub(400, { error: { message: 'image input is not supported' } });
    const e = (await complete({ provider: 'compat', apiKey: 'k', model: 'teks-saja', baseUrl: 'https://contoh.test/v1' }, { system: 's', prompt: 'p', images: [image] }).catch(
      (x: unknown) => x,
    )) as Error;
    expect(e.message).toMatch(/^Model teks-saja tampaknya tidak bisa membaca gambar\. .*image input is not supported/);
    // Without an image, the same refusal is reported as it was.
    const plain = (await complete({ provider: 'compat', apiKey: 'k', model: 'teks-saja', baseUrl: 'https://contoh.test/v1' }, { system: 's', prompt: 'p' }).catch(
      (x: unknown) => x,
    )) as Error;
    expect(plain.message).not.toContain('gambar');
  });
});

describe('import with a key, and saving', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('estimates and extracts with the default key, within its quota, and stores nothing', async () => {
    expect(await pageEstimate(SKD, { width: 1000, height: 1400 })).toBeNull();
    await addKey({ provider: 'gemini', label: 'Kunci uji', apiKey: 'AIza-uji', model: 'gemini-2.5-flash' });
    const est = await pageEstimate(SKD, { width: 1000, height: 1400 });
    expect(est).toMatchObject({ provider: 'Google Gemini', label: 'Kunci uji', model: 'gemini-2.5-flash', remainingToday: 20 });
    expect(est!.usd).toBeGreaterThan(0);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: reply(TWK) }] } }], usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 300 } })),
      ),
    );
    const r = await extractPage(SKD, { mimeType: 'image/jpeg', data: 'AAAA', width: 1000, height: 1400 }, new AbortController().signal);
    expect(r.drafts).toHaveLength(1);
    expect(await db.questions.count()).toBe(0);
    expect((await pageEstimate(SKD, { width: 1000, height: 1400 }))!.remainingToday).toBe(19);
  });

  it('saves reviewed questions to the bank, still to be checked', async () => {
    const q = parseImportedPage(reply(TWK), SKD).drafts[0].question;
    // Even a question the learner edited and called checked in review stays "perlu dicek" in the bank.
    expect(await saveImported([{ ...q, confidence: 'high', stem: 'Sila keempat Pancasila adalah …' }])).toBe(1);
    const saved = (await db.questions.toArray())[0];
    expect(saved).toMatchObject({ source: 'import', confidence: 'low', stem: 'Sila keempat Pancasila adalah …' });
    expect(saved.flags.some((f) => f.kind === 'import-unchecked' && f.severity === 'warn')).toBe(true);
  });
});

describe('sharing a set with imported questions', () => {
  const bp = { sections: [{ subtest: 'TWK', count: 2, topics: ['Pancasila'], difficulty: 'campuran' as const }], durationMinutes: 10, passing: { TWK: 10, TIU: 10, TKP: 10 } };
  const qs = (): Question[] => {
    const imported = parseImportedPage(reply(TWK), SKD).drafts[0].question;
    return [imported, { ...imported, id: 'own', stem: 'Soal buatan AI tentang Pancasila', hash: 'h', source: 'ai', confidence: 'high', flags: [] }];
  };

  it('leaves them out unless the learner includes them', () => {
    expect(toShared('S', bp, qs()).questions.map((q) => q.id)).toEqual(['own']);
    const all = toShared('S', bp, qs(), { includeImported: true });
    expect(all.questions.map((q) => q.source)).toEqual(['import', 'ai']);
    expect(parseShared(JSON.parse(JSON.stringify(all))).questions[0].source).toBe('import');
  });
});
