import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getSettings, saveSettings } from '../db';
import { buildPackagePreset, DEFAULT_SETTINGS } from '../domain/blueprint';
import { packageOf, PPPK_2024, setCustomPackages, type ExamPackage } from '../domain/examPackage';
import { parsePackageFile } from '../domain/packageFile';
import { parseShared, SHARE_VERSION, SHARE_VERSION_PACKAGES, toShared } from '../domain/share';
import type { Blueprint, OptionLabel, Question } from '../domain/types';
import { loadMath } from '../domain/validators';
import { importShared, previewImport } from '../engine/share';

/** A made-up package for tests: its numbers mean nothing and come from no document. */
const UJI: ExamPackage = parsePackageFile({
  app: 'cpns-skd-builder',
  kind: 'exam-package',
  version: 1,
  package: {
    id: 'uji-kerja',
    name: 'Ujian Uji',
    source: 'Contoh untuk pengujian, bukan data resmi',
    durationMinutes: 60,
    subtests: [
      { id: 'UJI-TEKNIS', name: 'Kompetensi teknis', scoring: { kind: 'keyed', correct: 5 }, count: 20, fromJobTitle: true },
      { id: 'UJI-SIKAP', name: 'Sikap kerja', scoring: { kind: 'graded', min: 1, max: 4 }, count: 10, topics: ['Kerja sama', 'Integritas'] },
    ],
  },
});

const LABELS: OptionLabel[] = ['A', 'B', 'C', 'D', 'E'];
let n = 0;
function q(subtest: string, scores: number[], answer?: OptionLabel): Question {
  const id = `q${++n}`;
  return {
    id,
    subtest,
    topic: 'Integritas',
    difficulty: 'sedang',
    stem: `Soal ${id} untuk ${subtest}`,
    options: LABELS.map((label, i) => ({ label, text: `Opsi ${label}`, score: scores[i] })),
    answer,
    explanation: 'Pembahasan.',
    flags: [],
    locked: false,
    starred: false,
    hash: `h-${id}`,
    source: 'ai',
    createdAt: 0,
    updatedAt: 0,
  };
}
const roundTrip = (s: unknown) => parseShared(JSON.parse(JSON.stringify(s)));

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  setCustomPackages([]);
  await loadMath();
});

describe('SKD sets are shared exactly as before', () => {
  const bp: Blueprint = { sections: [{ subtest: 'TWK', count: 1, topics: ['Pancasila'], difficulty: 'campuran' }], durationMinutes: 10, passing: DEFAULT_SETTINGS.passing };

  it('keep version 1, the same fields, and all three pass marks, so older versions still read them', () => {
    const s = toShared('SKD', bp, [q('TWK', [5, 0, 0, 0, 0], 'A')]);
    expect(s.version).toBe(SHARE_VERSION);
    expect(Object.keys(s).sort()).toEqual(['app', 'exportedAt', 'kind', 'questions', 'set', 'version']);
    expect(s.set.blueprint.passing).toEqual(DEFAULT_SETTINGS.passing);
    expect(roundTrip(s).questions[0].subtest).toBe('TWK');
  });

  it('read a file written before #45', () => {
    const old = {
      app: 'cpns-skd-builder',
      kind: 'set',
      version: 1,
      set: {
        name: 'Lama',
        blueprint: { sections: [{ subtest: 'TKP', count: 1, topics: ['Pelayanan Publik'], difficulty: 'sedang' }], durationMinutes: 5, passing: { TWK: 65, TIU: 80, TKP: 166 } },
      },
      questions: [
        {
          id: 'x',
          subtest: 'TKP',
          topic: 'Pelayanan Publik',
          difficulty: 'sedang',
          stem: 'Situasi lama',
          options: LABELS.map((label, i) => ({ label, text: label, score: i + 1 })),
          explanation: '',
          flags: [],
          source: 'ai',
        },
      ],
    };
    expect(parseShared(old).questions).toHaveLength(1);
  });
});

describe('sets of other exam packages', () => {
  it('PPPK: shared as version 2 without a package (built in everywhere), imported whole and scored 1–4', async () => {
    const bp = buildPackagePreset(PPPK_2024, 'mini', 'sedang', 'Arsiparis');
    const s = toShared('PPPK', bp, [q('PPPK-TEKNIS', [0, 5, 0, 0, 0], 'B'), q('PPPK-SOSKUL', [1, 4, 2, 3, 1])]);
    expect(s.version).toBe(SHARE_VERSION_PACKAGES);
    expect(s.packages).toBeUndefined();
    const back = roundTrip(s);
    expect(await previewImport(back)).toMatchObject({ perSubtest: { 'PPPK-TEKNIS': 1, 'PPPK-SOSKUL': 1 }, total: 2, newPackages: [] });
    const set = await importShared(back);
    expect(set.blueprint.passing).toEqual({});
    expect(set.blueprint.sections.map((x) => x.subtest)).toEqual(['PPPK-TEKNIS', 'PPPK-MANAJERIAL', 'PPPK-SOSKUL', 'PPPK-WAWANCARA']);
    const qs = (await db.questions.bulkGet(set.questionIds)) as Question[];
    expect(qs.map((x) => x.subtest)).toEqual(['PPPK-TEKNIS', 'PPPK-SOSKUL']);
    expect(qs[1].options.map((o) => o.score)).toEqual([1, 4, 2, 3, 1]);
    expect(qs[1].flags.filter((f) => f.kind === 'tkp-spread')).toEqual([]);
    expect(qs[0].answer).toBe('B');
  });

  it('an imported package travels with the set and is added for the receiver', async () => {
    setCustomPackages([UJI]);
    const s = toShared('Uji', buildPackagePreset(UJI, 'mini'), [q('UJI-SIKAP', [1, 4, 2, 3, 1]), q('UJI-TEKNIS', [5, 0, 0, 0, 0], 'A')]);
    expect(s.version).toBe(SHARE_VERSION_PACKAGES);
    expect(s.packages?.map((p) => p.id)).toEqual(['uji-kerja']);
    const file = JSON.stringify(s);

    // Another browser, which has never seen the package.
    setCustomPackages([]);
    const back = parseShared(JSON.parse(file));
    expect(await previewImport(back)).toMatchObject({ perSubtest: { 'UJI-SIKAP': 1, 'UJI-TEKNIS': 1 }, newPackages: [{ name: 'Ujian Uji', official: false }] });
    const set = await importShared(back);
    expect((await getSettings()).examPackages?.map((p) => p.id)).toEqual(['uji-kerja']);
    expect(packageOf('UJI-SIKAP').id).toBe('uji-kerja');
    const qs = (await db.questions.bulkGet(set.questionIds)) as Question[];
    expect(qs.find((x) => x.subtest === 'UJI-SIKAP')!.options.map((o) => o.score)).toEqual([1, 4, 2, 3, 1]);

    // Importing it again adds nothing new.
    expect((await previewImport(parseShared(JSON.parse(file)))).newPackages).toEqual([]);
  });

  it('is refused when its package is unknown, invalid, or would change or clash with the receiver’s', async () => {
    setCustomPackages([UJI]);
    const s = JSON.parse(JSON.stringify(toShared('Uji', buildPackagePreset(UJI, 'mini'), [q('UJI-SIKAP', [1, 4, 2, 3, 1])])));
    setCustomPackages([]);

    expect(() => parseShared({ ...s, packages: undefined })).toThrow('Set ini memakai sub-tes "UJI-SIKAP" dari paket ujian yang tidak ada di aplikasi Anda');
    expect(() => parseShared({ ...s, packages: [{ ...UJI, id: 'skd-cpns' }] })).toThrow(
      'Paket ujian ke-1 di set ini tidak valid: Paket tidak valid (id): id itu milik paket bawaan.',
    );

    // The receiver has a package with the same id but other rules: never replaced from a set.
    await saveSettings({ examPackages: [{ ...UJI, name: 'Ujian Uji versi saya' }] });
    await expect(previewImport(parseShared(s))).rejects.toThrow('Anda sudah punya paket ujian "Ujian Uji versi saya", tetapi isinya berbeda');
    await expect(importShared(parseShared(s))).rejects.toThrow('isinya berbeda');
    expect(await db.questions.count()).toBe(0);

    // Or another package already uses its sub-test ids.
    await saveSettings({ examPackages: [{ ...UJI, id: 'lain', name: 'Paket Lain' }] });
    await expect(previewImport(parseShared(s))).rejects.toThrow(
      'Paket ujian "Ujian Uji" di set ini tidak bisa ditambahkan: Sub-tes "UJI-TEKNIS" sudah dipakai paket "Paket Lain".',
    );

    // The same package is fine.
    await saveSettings({ examPackages: [UJI] });
    expect((await previewImport(parseShared(s))).newPackages).toEqual([]);
  });
});
