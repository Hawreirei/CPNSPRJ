import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getSettings } from '../db';
import { buildPackagePreset, DEFAULT_SETTINGS } from '../domain/blueprint';
import { packageOf, packages, scoringRulesText, setCustomPackages, specOf } from '../domain/examPackage';
import { packageFile, parsePackageFile } from '../domain/packageFile';
import { buildPrompt } from '../domain/prompts';
import { computeResult } from '../domain/scoring';
import type { OptionLabel, QSet, Question } from '../domain/types';
import { validateQuestion } from '../domain/validators';
import { startAttempt } from '../engine/attempts';
import { deletePackage, importPackage } from '../engine/examPackages';

/** A made-up package for tests: its numbers mean nothing and come from no document. */
const UJI = {
  id: 'uji-kerja',
  name: 'Ujian Uji',
  source: 'Contoh untuk pengujian, bukan data resmi',
  durationMinutes: 60,
  subtests: [
    { id: 'UJI-TEKNIS', name: 'Kompetensi teknis', scoring: { kind: 'keyed', correct: 5 }, count: 20, fromJobTitle: true },
    { id: 'UJI-SIKAP', name: 'Sikap kerja', scoring: { kind: 'graded', min: 1, max: 4 }, count: 10, topics: ['Kerja sama', 'Integritas', 'Kerja sama'] },
  ],
};
const file = (pkg: unknown = UJI, extra: object = {}) => ({ app: 'cpns-skd-builder', kind: 'exam-package', version: 1, package: pkg, ...extra });
const withSubtest = (patch: object, i = 1) => ({ ...UJI, subtests: UJI.subtests.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

describe('package files', () => {
  it('reads a valid package and drops duplicate topics', () => {
    const p = parsePackageFile(file());
    expect(p.subtests[1].topics).toEqual(['Kerja sama', 'Integritas']);
    expect(p.subtests[0].topics).toBeUndefined();
    expect(p.official).toBeUndefined();
    expect(parsePackageFile(JSON.parse(packageFile(p)))).toEqual(p);
  });

  it('rejects what is not a package, or comes from a newer version', () => {
    expect(() => parsePackageFile({ hello: 1 })).toThrow('Berkas bukan paket ujian.');
    expect(() => parsePackageFile(file(UJI, { version: 9 }))).toThrow('versi aplikasi yang lebih baru');
  });

  it('says exactly what is wrong', () => {
    expect(() => parsePackageFile(file({ ...UJI, id: 'skd-cpns' }))).toThrow('id itu milik paket bawaan');
    expect(() => parsePackageFile(file(withSubtest({ id: 'TKP' })))).toThrow('milik SKD CPNS');
    expect(() => parsePackageFile(file(withSubtest({ id: 'UJI-TEKNIS' })))).toThrow('dipakai dua kali');
    expect(() => parsePackageFile(file(withSubtest({ topics: undefined })))).toThrow('butuh daftar topik');
    expect(() => parsePackageFile(file(withSubtest({ passing: 41 })))).toThrow('melebihi skor maksimal (40)');
    expect(() => parsePackageFile(file(withSubtest({ scoring: { kind: 'graded', min: 4, max: 4 } })))).toThrow('lebih besar');
    expect(() => parsePackageFile(file({ ...UJI, official: { title: 'Keputusan X', date: '8 Okt 2026' } }))).toThrow('YYYY-MM-DD');
  });
});

describe('imported packages', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    setCustomPackages([]);
  });

  it('are kept in Settings and registered whenever Settings are read', async () => {
    await importPackage(packageFile(parsePackageFile(file())));
    setCustomPackages([]);
    expect(packageOf('UJI-SIKAP').id).toBe('skd-cpns');
    await getSettings();
    expect(packageOf('UJI-SIKAP').id).toBe('uji-kerja');
    expect(packages().map((p) => p.id)).toEqual(['skd-cpns', 'pppk-2024', 'uji-kerja']);
  });

  it('replace the package with the same id, and refuse sub-test ids of another package', async () => {
    await importPackage(packageFile(parsePackageFile(file())));
    await importPackage(packageFile(parsePackageFile(file({ ...UJI, name: 'Ujian Uji v2' }))));
    expect((await getSettings()).examPackages?.map((p) => p.name)).toEqual(['Ujian Uji v2']);
    await expect(importPackage(packageFile(parsePackageFile(file({ ...UJI, id: 'lain' }))))).rejects.toThrow('sudah dipakai paket "Ujian Uji v2"');
    await expect(importPackage('bukan json')).rejects.toThrow('bukan JSON');
  });

  it('cannot be removed while their questions remain', async () => {
    await importPackage(packageFile(parsePackageFile(file())));
    await db.questions.put(question('q1', 'UJI-SIKAP', [1, 4, 2, 3, 1]));
    await expect(deletePackage('uji-kerja')).rejects.toThrow('Masih ada 1 soal');
    await db.questions.clear();
    await deletePackage('uji-kerja');
    expect((await getSettings()).examPackages).toEqual([]);
    expect(packageOf('UJI-SIKAP').id).toBe('skd-cpns');
  });

  it('build sets from the package: short or full, with the job title as the technical topic', () => {
    const pkg = parsePackageFile(file());
    const mini = buildPackagePreset(pkg, 'mini', 'sedang', '  Pranata Komputer ');
    expect(mini.sections).toEqual([
      { subtest: 'UJI-TEKNIS', count: 10, topics: ['Pranata Komputer'], difficulty: 'sedang' },
      { subtest: 'UJI-SIKAP', count: 10, topics: ['Kerja sama', 'Integritas'], difficulty: 'sedang' },
    ]);
    expect(mini.durationMinutes).toBe(40);
    expect(mini.passing).toEqual({});
    const full = buildPackagePreset(pkg, 'full');
    expect(full.sections.map((s) => s.count)).toEqual([20, 10]);
    expect(full.durationMinutes).toBe(60);
    expect(full.sections[0].topics).toEqual([]);
  });

  it('starts an exam with every question of the package', async () => {
    await importPackage(packageFile(parsePackageFile(file())));
    const qs = [question('s1', 'UJI-SIKAP', [1, 4, 2, 3, 1]), question('t1', 'UJI-TEKNIS', [5, 0, 0, 0, 0], 'A'), question('t2', 'UJI-TEKNIS', [0, 5, 0, 0, 0], 'B')];
    await db.questions.bulkPut(qs);
    const set: QSet = {
      id: 's',
      name: 'S',
      blueprint: buildPackagePreset(parsePackageFile(file()), 'mini'),
      questionIds: qs.map((q) => q.id),
      status: 'ready',
      source: 'bank',
      batches: [],
      usage: { inputTokens: 0, outputTokens: 0, requests: 0 },
      createdAt: 0,
      updatedAt: 0,
    };
    await db.sets.put(set);
    // In the set's own order, or shuffled within each sub-test, which go in package order.
    expect((await startAttempt('s', { shuffleQuestions: false, durationMinutes: 10 })).questionIds).toEqual(['s1', 't1', 't2']);
    const shuffled = await startAttempt('s', { shuffleQuestions: true, durationMinutes: 10 });
    expect([...shuffled.questionIds].sort()).toEqual(['s1', 't1', 't2']);
    expect(shuffled.questionIds[2]).toBe('s1');
    expect(shuffled.passing).toEqual({});
  });
});

const LABELS: OptionLabel[] = ['A', 'B', 'C', 'D', 'E'];
function question(id: string, subtest: string, scores: number[], answer?: OptionLabel): Question {
  return {
    id,
    subtest,
    topic: 't',
    difficulty: 'sedang',
    stem: id,
    options: LABELS.map((label, i) => ({ label, text: label, score: scores[i] })),
    answer,
    explanation: '',
    flags: [],
    locked: false,
    starred: false,
    hash: id,
    source: 'ai',
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('writing and checking questions of another package', () => {
  beforeEach(() => setCustomPackages([parsePackageFile(file())]));

  it('asks for the job’s technical competence, and for scores in the package’s range', () => {
    const teknis = buildPrompt({ subtest: 'UJI-TEKNIS', items: [{ topic: 'Pranata Komputer', difficulty: 'sedang' }] });
    expect(teknis).toContain('Sub-tes: UJI-TEKNIS (Kompetensi teknis) untuk Ujian Uji. Ini BUKAN soal SKD CPNS.');
    expect(teknis).toContain('kompetensi teknis yang dibutuhkan untuk jabatan "Pranata Komputer"');
    expect(teknis).toContain('"answer": "C"');
    const sikap = buildPrompt({ subtest: 'UJI-SIKAP', items: [{ topic: 'Integritas', difficulty: 'sulit' }] });
    expect(sikap).toContain('"score" 1 sampai 4; tepat satu opsi mendapat skor 4');
    expect(sikap).not.toContain('"answer": "C"');
  });

  it('leaves the SKD prompts as they were', () => {
    const tkp = buildPrompt({ subtest: 'TKP', items: [{ topic: 'Pelayanan Publik', difficulty: 'sedang' }] });
    expect(tkp).toContain('Sub-tes: TKP (Tes Karakteristik Pribadi).');
    expect(tkp).toContain('"score": 3, "rationale"');
    expect(tkp).not.toContain('BUKAN soal SKD');
  });

  it('checks graded scores against the package range', () => {
    const ok = validateQuestion(question('a', 'UJI-SIKAP', [1, 4, 2, 3, 1]));
    expect(ok.flags.filter((f) => f.kind === 'tkp-spread')).toEqual([]);
    const out = validateQuestion(question('b', 'UJI-SIKAP', [1, 5, 2, 3, 1]));
    expect(out.flags.find((f) => f.kind === 'tkp-spread')?.message).toBe('Skor pilihan jawaban UJI-SIKAP tidak lengkap (harus 1 sampai 4).');
    const noTop = validateQuestion(question('c', 'UJI-SIKAP', [1, 3, 2, 3, 1]));
    expect(noTop.flags.map((f) => f.message)).toContain('Tidak ada jawaban dengan skor tertinggi (4).');
  });

  it('prints the scoring rules of the sub-tests in a set', () => {
    expect(scoringRulesText(['TKP', 'TWK', 'TIU'])).toBe('TWK & TIU: jawaban benar bernilai 5, salah atau kosong 0. TKP: setiap opsi bernilai 1–5.');
    expect(scoringRulesText(['TWK', 'TIU', 'TKP'], true)).toBe('TWK & TIU: benar 5, salah/kosong 0. TKP: tiap opsi 1–5.');
    expect(scoringRulesText(['UJI-SIKAP', 'UJI-TEKNIS'])).toBe('UJI-TEKNIS: jawaban benar bernilai 5, salah atau kosong 0. UJI-SIKAP: setiap opsi bernilai 1–4.');
  });

  it('scores an attempt by the package rules', () => {
    const r = computeResult([question('t', 'UJI-TEKNIS', [0, 5, 0, 0, 0], 'B'), question('s', 'UJI-SIKAP', [1, 4, 2, 3, 1])], { t: 'B', s: 'D' }, {});
    expect(r.perSubtest.map((x) => [x.subtest, x.score, x.max])).toEqual([
      ['UJI-TEKNIS', 5, 5],
      ['UJI-SIKAP', 3, 4],
    ]);
    expect(r.passedAll).toBeUndefined();
    expect(specOf('UJI-SIKAP').name).toBe('Sikap kerja');
    expect(DEFAULT_SETTINGS.counts.TWK).toBe(30);
  });
});
