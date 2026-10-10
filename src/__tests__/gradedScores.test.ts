import { describe, expect, it } from 'vitest';
import { parseAiQuestions, scoresFromText, withRecoveredScores } from '../domain/schemas';
import { buildMultiPrompt } from '../domain/prompts';

const L = ['A', 'B', 'C', 'D', 'E'];

describe('graded scores written outside "score"', () => {
  it("reads each option's score from the explanation, in the ways models write it", () => {
    expect(scoresFromText('A (skor 4): paling tepat. B (skor 3): cukup. C (skor 2): kurang. D (skor 1): pasif. E (skor 1): menghindar.', L)).toEqual([4, 3, 2, 1, 1]);
    expect(scoresFromText('Opsi A mendapat skor 2 karena lambat. Opsi B mendapat skor 4. Opsi C skor 3. Opsi D skor 1. Opsi E skor 1.', L)).toEqual([2, 4, 3, 1, 1]);
    expect(scoresFromText('- A: 4 — koordinasi\n- B: 3 — cukup\n- C: 2\n- D: 1\n- E: 1', L)).toEqual([4, 3, 2, 1, 1]);
    expect(scoresFromText('A = 1, B = 4, C = 2, D = 3, E = 1', L)).toEqual([1, 4, 2, 3, 1]);
    expect(scoresFromText('Skor 4 untuk pilihan C, skor 3 untuk A, skor 2 untuk B, skor 1 untuk D dan skor 1 untuk E.', L)).toEqual([3, 2, 4, 1, 1]);
    // Not every option scored: nothing is guessed.
    expect(scoresFromText('Opsi A paling tepat (skor 4) karena sesuai nilai integritas.', L)).toBeNull();
  });

  it('a PPPK Manajerial question keeps the scores its explanation gives, not all zero', () => {
    const raw = {
      questions: [
        {
          stem: 'Anda memimpin tim yang tenggat proyeknya mundur. Apa yang Anda lakukan?',
          options: ['Rapat ulang rencana', 'Lembur sendiri', 'Lapor atasan', 'Tunggu', 'Salahkan anggota'].map((text) => ({ text })),
          explanation:
            'A (skor 4): mengajak tim menyusun ulang rencana. B (skor 2): tidak melibatkan tim. C (skor 3): wajar tetapi pasif. D (skor 1): tidak bertindak. E (skor 1): merusak kerja sama.',
        },
      ],
    };
    const [q] = parseAiQuestions(JSON.stringify(raw), { subtest: 'PPPK-MANAJERIAL', items: [{ topic: 'Integritas', difficulty: 'sedang' }] });
    expect(q.options.map((o) => o.score)).toEqual([4, 2, 3, 1, 1]);
  });

  it('accepts "skor", "nilai" and scores written as text', () => {
    const raw = {
      questions: [
        {
          stem: 'Rekan kerja meminta bantuan saat Anda sibuk. Apa yang Anda lakukan?',
          options: [
            { text: 'a', skor: 4 },
            { text: 'b', nilai: '3' },
            { text: 'c', score: '2 poin' },
            { text: 'd', score: 'Skor: 1' },
            { text: 'e', bobot: 1 },
          ],
          explanation: '',
        },
      ],
    };
    const [q] = parseAiQuestions(JSON.stringify(raw), { subtest: 'PPPK-MANAJERIAL', items: [{ topic: 'Kerja Sama', difficulty: 'sedang' }] });
    expect(q.options.map((o) => o.score)).toEqual([4, 3, 2, 1, 1]);
  });

  it('clamps recovered scores to the sub-test range and leaves scored questions alone', () => {
    const q = { subtest: 'PPPK-MANAJERIAL', explanation: 'A = 5, B = 4, C = 3, D = 2, E = 1', options: L.map((label) => ({ label, text: label, score: 0 })) } as const;
    expect(withRecoveredScores(q as never as Parameters<typeof withRecoveredScores>[0]).options.map((o) => o.score)).toEqual([4, 4, 3, 2, 1]);
    const scored = { ...q, options: q.options.map((o, i) => ({ ...o, score: 4 - Math.min(i, 3) })) };
    expect(withRecoveredScores(scored as never as Parameters<typeof withRecoveredScores>[0])).toBe(scored);
  });

  it('asks for scores, not an answer, for every graded sub-test in a combined request', () => {
    const prompt = buildMultiPrompt([
      { subtest: 'PPPK-TEKNIS', items: [{ topic: 'Teknis', difficulty: 'sedang' }] },
      { subtest: 'PPPK-MANAJERIAL', items: [{ topic: 'Integritas', difficulty: 'sedang' }] },
    ]);
    const manajerial = prompt.split('\n').find((l) => l.includes('"subtest": "PPPK-MANAJERIAL", "topic"'))!;
    expect(manajerial).toContain('"score"');
    expect(manajerial).not.toContain('"answer"');
    expect(prompt.split('\n').find((l) => l.includes('"subtest": "PPPK-TEKNIS", "topic"'))).toContain('"answer"');
  });
});
