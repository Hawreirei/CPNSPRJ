import { attemptMode } from './practice';
import { SUBTESTS } from './types';
import type { Attempt, Subtest } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
const localStamp = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const cell = (v: string | number) => {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Score history as CSV for a spreadsheet: one row per finished attempt, oldest first, one column
 * per sub-test that appears (SKD first). Semicolons, since Indonesian Excel reads commas as decimals;
 * a BOM so it opens as UTF-8.
 */
export function historyCsv(attempts: Attempt[]): string {
  const done = attempts.filter((a) => a.result).sort((x, y) => x.startedAt - y.startedAt);
  const seen = new Set<Subtest>(done.flatMap((a) => a.result!.perSubtest.map((p) => p.subtest)));
  const subtests = [...SUBTESTS.filter((s) => seen.has(s)), ...[...seen].filter((s) => !SUBTESTS.includes(s))];
  const head = ['Tanggal', 'Set', 'Mode', ...subtests.flatMap((s) => [s, `${s} maks`]), 'Total', 'Total maks', 'Status'];
  const rows = done.map((a): (string | number)[] => {
    const r = a.result!;
    const status = attemptMode(a) === 'practice' || r.passedAll === undefined ? '' : r.passedAll ? 'lulus' : 'belum lulus';
    return [
      localStamp(a.startedAt),
      a.setName,
      attemptMode(a) === 'practice' ? 'latihan' : 'ujian',
      ...subtests.flatMap((s): (string | number)[] => {
        const p = r.perSubtest.find((x) => x.subtest === s);
        return p ? [p.score, p.max] : ['', ''];
      }),
      r.total,
      r.maxTotal,
      status,
    ];
  });
  const table: (string | number)[][] = [head, ...rows];
  return '\uFEFF' + table.map((row) => row.map(cell).join(';')).join('\r\n') + '\r\n';
}
