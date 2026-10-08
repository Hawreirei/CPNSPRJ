import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { easier } from '../domain/blueprint';
import { generateFiguralSeries } from '../domain/figural';
import { buildTutorPrompt, parseTutorReply, TUTOR_HISTORY, TUTOR_SYSTEM, tutorContext, tutorCost } from '../domain/tutor';
import type { OptionLabel, Question } from '../domain/types';
import { moreLikeThis } from '../engine/generator';
import { addKey } from '../engine/keys';
import { addNote, deleteNote } from '../engine/notes';
import { askTutor, tutorEstimate } from '../engine/tutor';

function mkQ(partial: Partial<Question> = {}): Question {
  return {
    id: 'secret-question-id',
    subtest: 'TWK',
    topic: 'UUD 1945',
    difficulty: 'sedang',
    stem: 'Pasal berapa yang mengatur kedaulatan rakyat?',
    options: (['A', 'B', 'C', 'D', 'E'] as OptionLabel[]).map((label, i) => ({ label, text: `Pasal 1 ayat (${i + 1})`, score: label === 'B' ? 5 : 0 })),
    answer: 'B',
    explanation: 'Kedaulatan di tangan rakyat ada di Pasal 1 ayat (2). Jawaban: B.',
    reference: 'UUD 1945 Pasal 1 ayat (2)',
    flags: [{ kind: 'user-report', severity: 'warn', message: 'Dilaporkan: catatan pribadi rahasia' }],
    report: { reason: 'lainnya', note: 'catatan pribadi rahasia', at: 1 },
    notes: [{ text: 'catatan lama saya', at: 2 }],
    rating: 2,
    locked: false,
    starred: false,
    hash: 'hash-rahasia',
    originSetId: 'set-rahasia',
    source: 'ai',
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe('what the tutor is told', () => {
  it('gets the question, its key, explanation, reference and the learner answer', () => {
    const p = buildTutorPrompt(mkQ(), { question: 'Kenapa B?', userAnswer: 'D' });
    for (const part of ['Pasal berapa yang mengatur', 'D. Pasal 1 ayat (4)', 'Kunci jawaban: B', 'Pembahasan: Kedaulatan', 'Rujukan: UUD 1945 Pasal 1 ayat (2)', 'Jawaban pengguna: D', 'Pertanyaan pengguna: Kenapa B?']) {
      expect(p).toContain(part);
    }
  });

  it('gets nothing else about the learner or the app', () => {
    const p = buildTutorPrompt(mkQ(), { question: 'Kenapa B?' });
    for (const secret of ['secret-question-id', 'set-rahasia', 'hash-rahasia', 'catatan pribadi rahasia', 'catatan lama saya', 'Dilaporkan']) expect(p).not.toContain(secret);
    expect(p).not.toContain('Jawaban pengguna');
  });

  it('includes a passage, data and TKP reasons when the question has them', () => {
    const tkp = mkQ({ subtest: 'TKP', answer: undefined, options: mkQ().options.map((o, i) => ({ ...o, score: 5 - i, rationale: `alasan ${5 - i}` })) });
    expect(tutorContext(tkp)).toContain('A. Pasal 1 ayat (1) (skor 5: alasan 5)');
    expect(tutorContext(tkp)).not.toContain('Kunci jawaban');
    expect(tutorContext(mkQ({ passage: { id: 'p', text: 'Isi wacana uji.' } }))).toContain('Wacana:\nIsi wacana uji.');
    const data = { kind: 'bar' as const, title: 'Pengunjung (orang)', unit: 'orang', category: 'Bulan', labels: ['Mei'], series: [{ name: 'x', values: [120] }] };
    expect(tutorContext(mkQ({ data }))).toContain('Data: Pengunjung (orang). Mei: 120 orang.');
  });

  it('keeps only the last turns of the conversation', () => {
    const history = Array.from({ length: 7 }, (_, i) => ({ role: i % 2 ? ('tutor' as const) : ('user' as const), text: `giliran ${i}` }));
    const p = buildTutorPrompt(mkQ(), { question: 'lagi', history });
    expect(p).not.toContain('giliran 2');
    expect(p).toContain(`giliran ${7 - TUTOR_HISTORY}`);
    expect(p).toContain('Tutor: giliran 5');
  });

  it('is told to explain from the key, not invent a new one', () => {
    expect(TUTOR_SYSTEM).toContain('Jangan mengganti kunci jawaban');
    expect(TUTOR_SYSTEM).toContain('keyLooksWrong');
    expect(TUTOR_SYSTEM).toContain('Jangan mengarang nomor pasal');
  });
});

describe('tutor replies', () => {
  it('reads JSON, fenced JSON, and plain text', () => {
    expect(parseTutorReply('{"answer": "Karena ayat 2.", "keyLooksWrong": true}')).toEqual({ answer: 'Karena ayat 2.', keyLooksWrong: true });
    expect(parseTutorReply('```json\n{"answer": "Begini."}\n```')).toEqual({ answer: 'Begini.', keyLooksWrong: false });
    expect(parseTutorReply('Jawabannya B karena ayat 2.')).toEqual({ answer: 'Jawabannya B karena ayat 2.', keyLooksWrong: false });
  });

  it('refuses an empty or broken reply, so it is asked again', () => {
    expect(() => parseTutorReply('   ')).toThrow();
    expect(() => parseTutorReply('{"answer": ""}')).toThrow();
  });

  it('estimates a cost that grows with the prompt', () => {
    const price = { input: 1, output: 4 };
    expect(tutorCost('x'.repeat(7000), price)).toBeGreaterThan(tutorCost('x', price));
    expect(tutorCost('x', price)).toBeGreaterThan(0.0016);
  });
});

describe('asking, notes and easier questions', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks with the default key and returns the answer', async () => {
    expect(await tutorEstimate(mkQ(), { question: 'x' })).toBeNull();
    await addKey({ provider: 'gemini', label: 'Kunci uji', apiKey: 'AIza-uji', model: 'gemini-2.5-flash' });
    const bodies: { systemInstruction: { parts: { text: string }[] }; contents: { parts: { text: string }[] }[] }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        const text = JSON.stringify({ answer: 'Kedaulatan rakyat diatur di Pasal 1 ayat (2).', keyLooksWrong: false });
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 50 } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    const est = await tutorEstimate(mkQ(), { question: 'Kenapa B?' });
    expect(est).toMatchObject({ label: 'Kunci uji', model: 'gemini-2.5-flash' });
    expect(est!.usd).toBeGreaterThan(0);
    const r = await askTutor(mkQ(), { question: 'Kenapa B?', userAnswer: 'D' }, new AbortController().signal);
    expect(r).toEqual({ answer: 'Kedaulatan rakyat diatur di Pasal 1 ayat (2).', keyLooksWrong: false });
    expect(bodies).toHaveLength(1);
    expect(bodies[0].systemInstruction.parts[0].text).toBe(TUTOR_SYSTEM);
    expect(bodies[0].contents[0].parts[0].text).not.toContain('secret-question-id');
  });

  it('keeps answers as notes, which can be removed', async () => {
    await db.questions.put(mkQ({ id: 'n1', notes: undefined }));
    let q = await addNote('n1', '  Ingat: ayat 2.  ', 10);
    q = await addNote('n1', 'Kedua.', 20);
    expect(q?.notes).toEqual([
      { text: 'Ingat: ayat 2.', at: 10 },
      { text: 'Kedua.', at: 20 },
    ]);
    q = await deleteNote('n1', 10);
    expect(q?.notes).toEqual([{ text: 'Kedua.', at: 20 }]);
    q = await deleteNote('n1', 20);
    expect(q && 'notes' in q).toBe(false);
  });

  it('makes similar questions one step easier, right after the original', async () => {
    expect([easier('sulit'), easier('sedang'), easier('mudah')]).toEqual(['sedang', 'mudah', 'mudah']);
    const q = { ...generateFiguralSeries('sulit'), originSetId: 's1' };
    await db.questions.put(q);
    await db.sets.put({ id: 's1', name: 'Set', blueprint: { sections: [], durationMinutes: 10, passing: { TWK: 0, TIU: 0, TKP: 0 } }, questionIds: [q.id, 'other'], status: 'ready', batches: [], usage: { inputTokens: 0, outputTokens: 0, requests: 0 }, source: 'ai', createdAt: 0, updatedAt: 0 });
    expect(await moreLikeThis('s1', q, 2, undefined, { easier: true })).toBe(2);
    const set = await db.sets.get('s1');
    expect(set!.questionIds[0]).toBe(q.id);
    expect(set!.questionIds.at(-1)).toBe('other');
    const added = (await db.questions.bulkGet(set!.questionIds.slice(1, 3))) as Question[];
    expect(added.map((x) => x.difficulty)).toEqual(['sedang', 'sedang']);
  });
});
