import { describe, expect, it } from 'vitest';
import { keyBalancer, keyIndex, placeKey, relabel } from '../domain/shuffle';
import type { OptionLabel, Question } from '../domain/types';

const L = ['A', 'B', 'C', 'D', 'E'] as const;
function seeded(seed = 1) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const keyed = (answer: OptionLabel, explanation: string): Pick<Question, 'subtest' | 'options' | 'answer' | 'explanation'> => ({
  subtest: 'TWK',
  options: L.map((label) => ({ label, text: `Isi ${label}`, score: label === answer ? 5 : 0 })),
  answer,
  explanation,
});

describe('answers in no pattern', () => {
  it('moves the key and renames the letters the explanation mentions', () => {
    const q = keyed('B', 'Opsi A keliru karena ... Jawaban yang benar adalah B. C salah, D juga, dan (E) tidak relevan. Jawaban: B.');
    const moved = placeKey(q, 3, seeded(7));
    expect(moved.answer).toBe('D');
    expect(moved.options[3].text).toBe('Isi B');
    expect(moved.options[3].score).toBe(5);
    // Every letter follows its option's text.
    const where = (text: string) => L[moved.options.findIndex((o) => o.text === text)];
    expect(moved.explanation).toBe(
      `Opsi ${where('Isi A')} keliru karena ... Jawaban yang benar adalah D. ${where('Isi C')} salah, ${where('Isi D')} juga, dan (${where('Isi E')}) tidak relevan. Jawaban: D.`,
    );
  });

  it('leaves legal references, other capitals and options that point at others alone', () => {
    expect(relabel('Sesuai UUD 1945 Pasal 28 C ayat (1) dan huruf B, E-KTP berlaku. Jawaban: A', { A: 'C', B: 'D', C: 'E', E: 'B' })).toBe(
      'Sesuai UUD 1945 Pasal 28 C ayat (1) dan huruf B, E-KTP berlaku. Jawaban: C',
    );
    const q = keyed('A', 'Jawaban: A');
    const both = { ...q, options: q.options.map((o, i) => (i === 4 ? { ...o, text: 'A dan B benar' } : o)) };
    expect(placeKey(both, 3)).toBe(both);
  });

  it("moves a graded question's best option, scores and rationales with it", () => {
    const q = {
      subtest: 'TKP',
      answer: undefined,
      explanation: 'A (skor 3): cukup. B (skor 5): terbaik. C (skor 1): pasif.',
      options: L.map((label, i) => ({ label, text: `Tindakan ${label}`, score: [3, 5, 1, 2, 4][i], rationale: `${label}: alasan` })),
    } as Pick<Question, 'subtest' | 'options' | 'answer' | 'explanation'>;
    const moved = placeKey(q, 0, seeded(3));
    expect(keyIndex(moved)).toBe(0);
    expect(moved.options[0]).toMatchObject({ text: 'Tindakan B', score: 5, rationale: 'A: alasan' });
    expect(moved.explanation).toContain('A (skor 5): terbaik');
  });

  it('spreads answers evenly over a set, never three in a row', () => {
    const balance = keyBalancer([], 5, seeded(11));
    const picks: number[] = [];
    for (let i = 0; i < 100; i++) {
      const p = balance.next();
      balance.record(p);
      picks.push(p);
    }
    const counts = [0, 1, 2, 3, 4].map((p) => picks.filter((x) => x === p).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(3);
    for (let i = 2; i < picks.length; i++) expect(picks[i] === picks[i - 1] && picks[i] === picks[i - 2]).toBe(false);
    // Not a fixed rotation either.
    expect(new Set(Array.from({ length: 19 }, (_, i) => picks.slice(i * 5, i * 5 + 5).join(''))).size).toBeGreaterThan(15);
    // A set that already leans on C gets fewer C's next.
    const leaning = keyBalancer([2, 2, 1, 2, 2, 2], 5, seeded(5));
    const next = Array.from({ length: 10 }, () => {
      const p = leaning.next();
      leaning.record(p);
      return p;
    });
    expect(next.filter((p) => p === 2).length).toBeLessThanOrEqual(1);
  });
});
