import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { DEFAULT_SETTINGS } from '../domain/blueprint';
import { MAX_BUNDLE_SETS, parseBundle, parseSharedFile, SHARE_VERSION, toBundle, toShared } from '../domain/share';
import type { Blueprint, OptionLabel, Question } from '../domain/types';
import { bundleOf, importMany } from '../engine/share';
import { createBankSet } from '../engine/sets';

const bp: Blueprint = {
  sections: [{ subtest: 'TIU', count: 2, topics: ['Aritmetika'], difficulty: 'campuran' }],
  durationMinutes: 10,
  passing: DEFAULT_SETTINGS.passing,
};
let n = 0;
function mkQ(partial: Partial<Question> = {}): Question {
  const id = partial.id ?? `bq${++n}`;
  return {
    id,
    subtest: 'TIU',
    topic: 'Aritmetika',
    difficulty: 'sedang',
    stem: `Berapa 3 + ${n}?`,
    options: (['A', 'B', 'C', 'D', 'E'] as OptionLabel[]).map((label, i) => ({ label, text: String(3 + n + i), score: label === 'A' ? 5 : 0 })),
    answer: 'A',
    explanation: `3 + ${n} = ${3 + n}. Jawaban: A.`,
    mathExpression: `3 + ${n}`,
    flags: [],
    locked: false,
    starred: false,
    hash: `bh${id}`,
    source: 'ai',
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}
const setOf = (name: string, qs: Question[]) => toShared(name, bp, qs);

describe('a bundle of sets', () => {
  it('reads back as the sets it was made from', () => {
    const a = setOf('Paket 1', [mkQ(), mkQ()]);
    const b = setOf('Paket 2', [mkQ(), mkQ()]);
    const bundle = toBundle('Bundel uji', [a, b]);
    expect(bundle).toMatchObject({ app: 'cpns-skd-builder', kind: 'bundle', version: SHARE_VERSION, name: 'Bundel uji' });
    const read = parseSharedFile(JSON.parse(JSON.stringify(bundle)));
    expect(read.bundleName).toBe('Bundel uji');
    expect(read.sets.map((s) => s.set.name)).toEqual(['Paket 1', 'Paket 2']);
  });

  it('still reads a single set', () => {
    const read = parseSharedFile(JSON.parse(JSON.stringify(setOf('Satu', [mkQ()]))));
    expect(read.bundleName).toBeUndefined();
    expect(read.sets).toHaveLength(1);
  });

  it('says which set is wrong', () => {
    const good = setOf('Baik', [mkQ()]);
    const bundle = JSON.parse(JSON.stringify(toBundle('B', [good, good])));
    bundle.sets[1].questions = [];
    expect(() => parseBundle(bundle)).toThrow(/Set ke-2/);
  });

  it('rejects an empty or oversized bundle and a newer version', () => {
    const one = setOf('S', [mkQ()]);
    expect(() => parseBundle({ ...toBundle('B', [one]), sets: [] })).toThrow(/Bundel tidak valid/);
    expect(() => parseBundle({ ...toBundle('B', [one]), sets: Array(MAX_BUNDLE_SETS + 1).fill(one) })).toThrow(/paling banyak/);
    expect(() => parseBundle({ ...toBundle('B', [one]), version: 99 })).toThrow(/versi aplikasi yang lebih baru/);
  });
});

describe('bundle export and import', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('puts every set in Set Saya and every question in the bank, once', async () => {
    const shared = mkQ({ id: 'dup', stem: 'Soal di dua set?' });
    const pool = [mkQ(), mkQ(), shared];
    await db.questions.bulkPut(pool);
    const s1 = await createBankSet('Paket 1', bp, [pool[0], shared]);
    const s2 = await createBankSet('Paket 2', bp, [pool[1], shared]);
    const { bundle } = await bundleOf([s1.id, s2.id], 'Bundel');
    expect(bundle.sets).toHaveLength(2);

    await Promise.all(db.tables.map((t) => t.clear()));
    const done = await importMany(parseBundle(JSON.parse(JSON.stringify(bundle))).sets);
    expect(done.map((s) => s.name)).toEqual(['Paket 1', 'Paket 2']);
    expect(await db.sets.count()).toBe(2);
    expect(await db.questions.count()).toBe(3);
    const [a, b] = await Promise.all(done.map((s) => db.sets.get(s.id)));
    expect(a!.questionIds).toHaveLength(2);
    expect(b!.questionIds).toHaveLength(2);
  });

  it('skips a set with nothing shareable and fails when none is left', async () => {
    const photo = mkQ({ source: 'import' });
    const plain = mkQ();
    await db.questions.bulkPut([photo, plain]);
    const own = await createBankSet('Dari foto', bp, [photo]);
    const ok = await createBankSet('Biasa', bp, [plain]);
    const { bundle, skipped } = await bundleOf([own.id, ok.id], 'B');
    expect(bundle.sets.map((s) => s.set.name)).toEqual(['Biasa']);
    expect(skipped).toEqual(['Dari foto']);
    await expect(bundleOf([own.id], 'B')).rejects.toThrow(/Tidak ada soal/);
  });
});
