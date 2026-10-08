import { beforeAll, describe, expect, it } from 'vitest';
import { DATA_TOPIC, describeData, fmtNum, generateDataAnalysis } from '../domain/dataAnalysis';
import { parseNumeric } from '../domain/numeric';
import { generateProcedural } from '../domain/procedural';
import { loadMath, validateQuestion } from '../domain/validators';
import { PROCEDURAL_TOPICS, TOPICS } from '../domain/blueprint';
import { dataChartSvg, niceScale } from '../lib/dataSvg';
import type { DataFigure, Difficulty, Question } from '../domain/types';

beforeAll(() => loadMath());

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KINDS: DataFigure['kind'][] = ['table', 'bar', 'line', 'pie'];
const LEVELS: Difficulty[] = ['mudah', 'sedang', 'sulit'];
const RUNS = 80;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const argmax = (xs: number[]) => xs.indexOf(Math.max(...xs));

/**
 * The key worked out again from the figure alone, written without looking at the generator's
 * arithmetic: a number, or the text of the right option.
 */
function solve(q: Question): number | string {
  const d = q.data!;
  const s = q.stem;
  const v = d.series[0].values;
  const col = (name: string) => d.series.find((x) => x.name === name)!.values;
  const row = (label: string) => d.labels.indexOf(label);
  let m: RegExpMatchArray | null;
  if (d.kind === 'table') {
    if ((m = s.match(/total .* pada tahun (\d+)\?/))) return sum(col(m[1]));
    if ((m = s.match(/Kecamatan (\S+) dari tahun (\d+) ke tahun (\d+)/))) {
      const [a, b] = [col(m[2])[row(m[1])], col(m[3])[row(m[1])]];
      return (b - a) / a;
    }
    const [a, b] = d.series.map((x) => x.values);
    return d.labels[argmax(a.map((x, i) => (b[i] - x) / x))];
  }
  if (d.kind === 'bar') {
    if ((m = s.match(/antara bulan (\S+) dan (\S+)\?/))) return Math.abs(v[row(m[1])] - v[row(m[2])]);
    if (s.includes('rata-rata')) return sum(v) / v.length;
    const ups = v.slice(1).map((x, i) => x - v[i]);
    const k = argmax(ups);
    return `${d.labels[k]} ke ${d.labels[k + 1]}`;
  }
  if (d.kind === 'line') {
    if (s.includes('paling rendah')) return d.labels[v.indexOf(Math.min(...v))];
    if ((m = s.match(/penurunan .* dari tahun (\d+) ke tahun (\d+)/))) {
      const [a, b] = [v[row(m[1])], v[row(m[2])]];
      return (a - b) / a;
    }
    // Same growth rate once more after the last year.
    return v[4] * (v[4] / v[3]);
  }
  const total = Number(d.title.match(/total ([\d.]+) orang/)![1].replace(/\./g, ''));
  if (s.startsWith('Jika seperempat')) return (v[row('S2')] + v[row('S1')] / 4) / 100;
  if ((m = s.match(/berpendidikan terakhir (\S+)\?/))) return (total * v[row(m[1])]) / 100;
  m = s.match(/berpendidikan (\S+) dan (\S+)\?/)!;
  return (total * Math.abs(v[row(m[1])] - v[row(m[2])])) / 100;
}

describe('data analysis questions', () => {
  it('have one key, computed from the figure, that the regular answer check accepts', () => {
    for (let seed = 0; seed < RUNS; seed++) {
      for (const kind of KINDS) {
        for (const lvl of LEVELS) {
          const q = generateDataAnalysis(lvl, seeded(seed), kind);
          const ctx = `${kind} ${lvl} seed ${seed}: ${q.stem}`;
          expect(q.topic).toBe(DATA_TOPIC);
          expect(q.options, ctx).toHaveLength(5);
          expect(new Set(q.options.map((o) => o.text)).size, ctx).toBe(5);
          expect(q.options.filter((o) => o.score === 5).map((o) => o.label), ctx).toEqual([q.answer]);
          const key = q.options.find((o) => o.label === q.answer)!.text;

          const expected = solve(q);
          if (typeof expected === 'number') {
            const values = q.options.map((o) => parseNumeric(o.text));
            expect(parseNumeric(key), ctx).toBeCloseTo(expected, 9);
            expect(values.filter((x) => x !== null && Math.abs(x - expected) < 1e-9), ctx).toHaveLength(1);
            expect(q.mathExpression, ctx).toBeTruthy();
          } else {
            expect(key, ctx).toBe(expected);
          }
          // The app's own checker: key, explanation and the recomputed expression all agree.
          expect(validateQuestion(q).flags.filter((f) => f.severity === 'warn'), ctx).toEqual([]);
        }
      }
    }
  });

  it('offers the biggest rise in units as a trap when asking for the biggest rise in percent', () => {
    for (let seed = 0; seed < RUNS; seed++) {
      const q = generateDataAnalysis('sulit', seeded(seed), 'table');
      const [a, b] = q.data!.series.map((x) => x.values);
      const mostUnits = q.data!.labels[argmax(b.map((x, i) => x - a[i]))];
      expect(q.options.find((o) => o.label === q.answer)!.text).not.toBe(mostUnits);
      expect(q.options.map((o) => o.text)).toContain(mostUnits);
    }
  });

  it('is a TIU topic the app draws itself, without duplicates', () => {
    expect(TOPICS.TIU).toContain(DATA_TOPIC);
    expect(PROCEDURAL_TOPICS.has(DATA_TOPIC)).toBe(true);
    const qs = generateProcedural(DATA_TOPIC, 'sedang', 8);
    expect(qs).toHaveLength(8);
    expect(new Set(qs.map((q) => q.hash)).size).toBe(8);
    expect(qs.every((q) => q.data && q.source === 'procedural')).toBe(true);
  });

  it('describes the numbers in words for screen readers and exports', () => {
    const d: DataFigure = { kind: 'table', title: 'Produksi (ton)', unit: 'ton', category: 'Kecamatan', labels: ['A', 'B'], series: [{ name: '2023', values: [1200, 300] }, { name: '2024', values: [1500, 360] }] };
    expect(describeData(d)).toBe('Produksi (ton). A: 2023 1.200 ton, 2024 1.500 ton; B: 2023 300 ton, 2024 360 ton.');
    expect(describeData({ ...d, kind: 'pie', series: [{ name: 'x', values: [60, 40] }] })).toBe('Produksi (ton). A: 60%; B: 40%.');
  });
});

describe('charts', () => {
  it('rounds the axis to at most five clean steps', () => {
    expect(niceScale(37)).toEqual({ top: 40, step: 10 });
    expect(niceScale(600)).toEqual({ top: 600, step: 200 });
    expect(niceScale(480)).toEqual({ top: 500, step: 100 });
    expect(niceScale(1250)).toEqual({ top: 1250, step: 250 });
    for (const max of [7, 95, 130, 999, 4321]) {
      const { top, step } = niceScale(max);
      expect(top).toBeGreaterThanOrEqual(max);
      expect(top / step).toBeLessThanOrEqual(5);
    }
  });

  it('draws every value, so the question can be answered exactly', () => {
    for (const kind of ['bar', 'line', 'pie'] as const) {
      const q = generateDataAnalysis('sedang', seeded(7), kind);
      const svg = dataChartSvg(q.data!, '#111', '#fff');
      expect(svg).toMatch(/^<svg [^>]*width="420" height="240"/);
      for (const [i, v] of q.data!.series[0].values.entries()) {
        expect(svg).toContain(`${fmtNum(v)}${kind === 'pie' ? '%' : ''}`);
        expect(svg).toContain(q.data!.labels[i]);
      }
    }
    expect(dataChartSvg(generateDataAnalysis('mudah', seeded(1), 'table').data!)).toBe('');
  });
});
