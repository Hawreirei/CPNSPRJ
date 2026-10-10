import { describe, expect, it } from 'vitest';
import { historyCsv } from '../domain/historyCsv';
import type { Attempt, Subtest } from '../domain/types';

const sub = (subtest: Subtest, score: number, max: number, passed?: boolean) => ({ subtest, score, max, passed, correct: 0, answered: 0, total: 0 });

function attempt(partial: Partial<Attempt>): Attempt {
  return {
    id: 'a',
    setId: 's',
    setName: 'Set',
    startedAt: new Date(2026, 9, 9, 8, 5).getTime(),
    questionIds: [],
    answers: {},
    ...partial,
  } as Attempt;
}

describe('historyCsv', () => {
  it('writes one row per finished attempt, oldest first, with SKD columns first', () => {
    const csv = historyCsv([
      attempt({
        id: 'b',
        setName: 'Paket "B"; ulang',
        startedAt: new Date(2026, 9, 10, 9, 0).getTime(),
        mode: 'practice',
        result: { perSubtest: [sub('TIU', 20, 50)], topics: [], total: 20, maxTotal: 50 },
      }),
      attempt({
        result: { perSubtest: [sub('TKP', 40, 50, true), sub('TWK', 25, 50, false)], topics: [], total: 65, maxTotal: 100, passedAll: false },
      }),
      attempt({ id: 'open', setName: 'Belum selesai' }),
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines).toEqual([
      'Tanggal;Set;Mode;TWK;TWK maks;TIU;TIU maks;TKP;TKP maks;Total;Total maks;Status',
      '2026-10-09 08:05;Set;ujian;25;50;;;40;50;65;100;belum lulus',
      '2026-10-10 09:00;"Paket ""B""; ulang";latihan;;;20;50;;;20;50;',
    ]);
  });

  it('has only the header without finished attempts', () => {
    expect(historyCsv([]).slice(1).trimEnd()).toBe('Tanggal;Set;Mode;Total;Total maks;Status');
  });
});
