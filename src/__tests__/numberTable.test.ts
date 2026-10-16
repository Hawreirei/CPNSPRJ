import { describe, expect, it } from 'vitest';
import { ARCHETYPES, makeWith } from '../domain/figural';
import { FORMULAS, readTable, tableAnswer } from '../domain/figural/numgrid';
import { describeFigure } from '../domain/describe';
import { figureSvg } from '../lib/figureSvg';
import { seeded } from './figuralHelpers';

/* The number tables the topic started from: the model reads them as a careful learner would. */

const T = (...rows: (number | null)[][]) => rows.flat();

describe('example number tables', () => {
  it('reads each one way only, with one answer', () => {
    // By columns: 8² − 3² = 55, 5² − 2² = 21, so 9² − 5² = 56.
    expect(tableAnswer(T([8, 5, 9], [3, 2, 5], [55, 21, null]))).toBe(56);
    // By rows: (11 − 6) × 4 = 20, (9 − 2) × 4 = 28, so (15 − 9) × 4 = 24.
    expect(tableAnswer(T([11, 6, 20], [9, 2, 28], [15, 9, null]))).toBe(24);
    // By rows: 3² + 4 = 13, 5² + 2 = 27, so 6² + 7 = 43.
    expect(tableAnswer(T([3, 4, 13], [5, 2, 27], [6, 7, null]))).toBe(43);
    // By columns: 5 × 4 + 5 = 25, 7 × 2 + 7 = 21, so 2 × 5 + 2 = 12.
    expect(tableAnswer(T([5, 7, 2], [4, 2, 5], [25, 21, null]))).toBe(12);
  });

  it('finds no short formula reading example 3 by rows', () => {
    const readings = readTable(T([5, 7, 2], [4, 2, 5], [25, 21, null]));
    expect(readings.every((r) => r.dir === 'col')).toBe(true);
  });

  it('knows the trap in example 2: 3 × 4 + 1 fits the first row, not the second', () => {
    const f = FORMULAS.find((x) => x.id === 'a*b+1')!;
    expect(f.f(3, 4)).toBe(13);
    expect(f.f(5, 2)).not.toBe(27);
  });

  it('refuses a table two readings would answer differently', () => {
    // 2 + 2 = 2 × 2 and 0 + 0 = 0 × 0: both readings fit, and give 3 + 4 = 7 or 3 × 4 = 12.
    expect(tableAnswer(T([2, 2, 4], [0, 0, 0], [3, 4, null]))).toBeNull();
  });
});

describe('Tabel Angka questions', () => {
  const arch = ARCHETYPES.find((a) => a.id === 'number-table')!;
  it('are drawn as a 3 × 3 table with plain number options', () => {
    const q = makeWith(arch, 'sedang', seeded(2));
    expect(q.topic).toBe('Tabel Angka');
    expect(q.figure?.layout).toBe('matrix');
    expect(q.options.every((o) => !o.figure && /^\d+$/.test(o.text))).toBe(true);
    expect(describeFigure(q.figure!)).toMatch(/^Baris 1: \d+; \d+; \d+\. Baris 2: .*tanda tanya/);
    expect(figureSvg(q.figure!, 64)).toContain('<text');
  });

  it('stay within reasonable numbers', () => {
    for (const [d, limit] of [
      ['mudah', 60],
      ['sedang', 100],
      ['sulit', 150],
    ] as const)
      for (let s = 0; s < 40; s++) {
        const q = makeWith(arch, d, seeded(s));
        const table = (q.figure?.cells ?? []).flatMap((c) => (c && 'kind' in c && c.kind === 'num' ? [c.value] : []));
        const options = q.options.map((o) => Number(o.text));
        expect(Math.max(...table, Number(q.options.find((o) => o.label === q.answer)!.text)), `${d} seed ${s}`).toBeLessThanOrEqual(limit);
        // Wrong options may be a little past the table's own numbers, never far.
        expect(Math.max(...options), `${d} seed ${s}`).toBeLessThanOrEqual(Math.round(limit * 1.1));
        expect(Math.min(...table, ...options), `${d} seed ${s}`).toBeGreaterThan(0);
      }
  });

  it('can ask for a starting number at sulit, and explain the trap when there is one', () => {
    const qs = Array.from({ length: 60 }, (_, s) => makeWith(arch, 'sulit', seeded(s)));
    expect(qs.some((q) => q.figureMeta!.signature.endsWith('|balik'))).toBe(true);
    expect(qs.some((q) => q.explanation.includes('Jebakan:'))).toBe(true);
  });
});
