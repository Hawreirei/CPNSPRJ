import 'fake-indexeddb/auto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { RichText } from '../components/RichText';
import { db } from '../db';
import { DEFAULT_SETTINGS } from '../domain/blueprint';
import { decodeLinkData, encodeLinkData, parseShared, SHARE_VERSION, toShared } from '../domain/share';
import type { Blueprint, OptionLabel, Question } from '../domain/types';
import { loadMath } from '../domain/validators';
import { importShared, previewImport } from '../engine/share';
import { renderMath } from '../lib/katex';
import { dataChartSvg } from '../lib/dataSvg';

const bp: Blueprint = { sections: [{ subtest: 'TIU', count: 3, topics: ['Pemahaman Bacaan', 'Aritmetika'], difficulty: 'campuran' }], durationMinutes: 10, passing: DEFAULT_SETTINGS.passing };
let n = 0;
function mkQ(partial: Partial<Question> = {}): Question {
  const id = partial.id ?? `q${++n}`;
  return {
    id,
    subtest: 'TIU',
    topic: 'Aritmetika',
    difficulty: 'sedang',
    stem: `Berapa 2 + ${n}?`,
    options: (['A', 'B', 'C', 'D', 'E'] as OptionLabel[]).map((label, i) => ({ label, text: String(2 + n + i), score: label === 'A' ? 5 : 0 })),
    answer: 'A',
    explanation: `2 + ${n} = ${2 + n}. Jawaban: A.`,
    mathExpression: `2 + ${n}`,
    flags: [
      { kind: 'cross-checked', severity: 'info', message: 'Diperiksa silang.' },
      { kind: 'user-report', severity: 'warn', message: 'Dilaporkan: catatan pribadi' },
    ],
    report: { reason: 'lainnya', note: 'catatan pribadi', at: 1 },
    rating: 1,
    notes: [{ text: 'catatan saya', at: 5 }],
    starred: true,
    locked: true,
    originSetId: 'set-asal',
    hash: `h${id}`,
    source: 'ai',
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}
const passage = { id: 'p1', title: 'Wacana', text: 'Isi wacana yang dibagikan.', questionIds: ['r1', 'r2'] };
const sample = () => [
  mkQ({ id: 'r1', topic: 'Pemahaman Bacaan', mathExpression: undefined, passage, stem: 'Gagasan utama wacana?' }),
  mkQ({ id: 'r2', topic: 'Pemahaman Bacaan', mathExpression: undefined, passage, stem: 'Simpulan wacana?' }),
  mkQ({ id: 'm1' }),
];

describe('what a shared set carries', () => {
  it('leaves out everything personal', () => {
    const s = toShared('Set uji', bp, sample());
    const json = JSON.stringify(s);
    for (const secret of ['catatan pribadi', 'catatan saya', 'set-asal', '"rating"', '"starred"', '"locked"', 'user-report', 'AIza']) expect(json).not.toContain(secret);
    expect(s).toMatchObject({ app: 'cpns-skd-builder', kind: 'set', version: SHARE_VERSION, set: { name: 'Set uji' } });
    expect(s.questions[0].passage).toEqual(passage);
    expect(s.questions[0].flags).toEqual([{ kind: 'cross-checked', severity: 'info', message: 'Diperiksa silang.' }]);
  });

  it('includes notes only when asked', () => {
    expect(toShared('S', bp, sample(), { includeNotes: true }).questions[0].notes).toEqual([{ text: 'catatan saya', at: 5 }]);
  });

  it('round-trips through a link', async () => {
    const s = toShared('Set uji', bp, sample());
    const d = await encodeLinkData(s);
    expect(d).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = parseShared(await decodeLinkData(d));
    expect(back.questions).toEqual(s.questions);
    await expect(decodeLinkData('bukan-data-yang-benar')).rejects.toThrow('Tautan rusak');
  });
});

describe('a received set is checked before anything is stored', () => {
  const valid = () => JSON.parse(JSON.stringify(toShared('Set uji', bp, sample())));

  it('rejects other files with a clear message', () => {
    expect(() => parseShared(null)).toThrow('bukan set bersama');
    expect(() => parseShared({ app: 'cpns-skd-builder', version: 1, sets: [], questions: [] })).toThrow('berkas cadangan');
    expect(() => parseShared({ ...valid(), version: SHARE_VERSION + 1 })).toThrow('versi aplikasi yang lebih baru');
    expect(() => parseShared({ ...valid(), questions: [] })).toThrow('set kosong');
  });

  it('rejects anything that would end up inside drawing markup', () => {
    const bad = valid();
    bad.questions[2].figure = { layout: 'series', cells: [{ shape: '"/><script>alert(1)</script>', fill: 'solid', rotation: 0, count: 1 }] };
    expect(() => parseShared(bad)).toThrow('questions.2.figure.cells.0.shape');
    const inf = JSON.parse(JSON.stringify(valid()).replace('"durationMinutes":10', '"durationMinutes":1e400'));
    expect(() => parseShared(inf)).toThrow('Set tidak valid');
  });

  it('keeps hostile text as text', () => {
    const html = renderToStaticMarkup(createElement(RichText, { text: '<script>alert(1)</script><img src=x onerror=alert(1)>' }));
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(renderMath('\\href{javascript:alert(1)}{klik}', false)).not.toMatch(/href="javascript/);
    const svg = dataChartSvg({ kind: 'bar', title: 't', unit: 'u', category: 'c', labels: ['<img src=x onerror=alert(1)>'], series: [{ name: 's', values: [3] }] }, '#000', '#fff');
    expect(svg).not.toContain('<img');
    expect(svg).toContain('&lt;img');
  });
});

describe('importing', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    await loadMath();
  });

  it('adds a new set with new ids, groups intact, checked again, marked as shared', async () => {
    const shared = parseShared(JSON.parse(JSON.stringify(toShared('Set teman', bp, sample()))));
    // A forged warning from the sender is not taken over; the app's own checks run again.
    shared.questions[2].flags.push({ kind: 'math-mismatch', severity: 'warn', message: 'palsu' });
    shared.questions[2].options[0].score = 5;
    expect(await previewImport(shared)).toEqual({ name: 'Set teman', perSubtest: { TWK: 0, TIU: 3, TKP: 0 }, total: 3, known: 0 });

    const set = await importShared(shared);
    expect(set.name).toBe('Set teman');
    const qs = (await db.questions.bulkGet(set.questionIds)) as Question[];
    expect(qs).toHaveLength(3);
    expect(qs.map((q) => q.id)).not.toContain('r1');
    expect(qs[0].passage!.id).not.toBe('p1');
    expect(qs[0].passage!.id).toBe(qs[1].passage!.id);
    expect(qs[0].passage!.questionIds).toEqual([qs[0].id, qs[1].id]);
    for (const q of qs) {
      expect(q.importedFrom?.name).toBe('Set teman');
      expect(q.originSetId).toBe(set.id);
      expect(q).toMatchObject({ starred: false, locked: false });
      expect(q.report).toBeUndefined();
      expect(q.flags.some((f) => f.message === 'palsu')).toBe(false);
    }
    expect(qs[2].flags.map((f) => f.kind)).toContain('cross-checked');
  });

  it('reuses questions the bank already has instead of copying them', async () => {
    const file = JSON.stringify(toShared('Set teman', bp, sample()));
    await importShared(parseShared(JSON.parse(file)));
    const before = await db.questions.count();
    const again = parseShared(JSON.parse(file));
    expect((await previewImport(again)).known).toBe(3);
    const second = await importShared(again);
    expect(await db.questions.count()).toBe(before);
    expect(second.questionIds).toHaveLength(3);
  });
});
