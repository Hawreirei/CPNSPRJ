import { describe, expect, it } from 'vitest';
import { buildPackagePreset } from '../domain/blueprint';
import { isBuiltIn, isSkd, maxPerQuestion, packageOf, PPPK_2024, scoringRulesText } from '../domain/examPackage';
import { packageFile, parsePackageFile } from '../domain/packageFile';
import { buildPrompt } from '../domain/prompts';

/** Each expectation cites Keputusan MenPAN-RB Nomor 347 Tahun 2024. */
describe('PPPK 2024 package', () => {
  const by = (id: string) => PPPK_2024.subtests.find((s) => s.id === id)!;

  it('is built in, with its official source', () => {
    expect(isBuiltIn(PPPK_2024)).toBe(true);
    expect(isSkd(PPPK_2024)).toBe(false);
    expect(packageOf('PPPK-WAWANCARA')).toBe(PPPK_2024);
    expect(PPPK_2024.official).toMatchObject({ date: '2024-08-19' });
    expect(PPPK_2024.official?.title).toContain('Nomor 347 Tahun 2024');
  });

  it('has 145 questions: technical 90, managerial 25, socio-cultural 20, interview 10 (Diktum KEDUA PULUH DUA)', () => {
    expect(PPPK_2024.subtests.map((s) => [s.id, s.count])).toEqual([
      ['PPPK-TEKNIS', 90],
      ['PPPK-MANAJERIAL', 25],
      ['PPPK-SOSKUL', 20],
      ['PPPK-WAWANCARA', 10],
    ]);
    expect(PPPK_2024.subtests.reduce((n, s) => n + s.count!, 0)).toBe(145);
  });

  it('scores technical 5 or 0, the rest 1 to 4 (Diktum KEDUA PULUH TIGA), up to 670 in total (Diktum KEDUA PULUH EMPAT)', () => {
    expect(by('PPPK-TEKNIS').scoring).toEqual({ kind: 'keyed', correct: 5 });
    for (const id of ['PPPK-MANAJERIAL', 'PPPK-SOSKUL', 'PPPK-WAWANCARA']) expect(by(id).scoring).toEqual({ kind: 'graded', min: 1, max: 4 });
    const max = (id: string) => by(id).count! * maxPerQuestion(id);
    expect(max('PPPK-TEKNIS')).toBe(450);
    expect(max('PPPK-MANAJERIAL') + max('PPPK-SOSKUL')).toBe(180);
    expect(max('PPPK-WAWANCARA')).toBe(40);
    expect(PPPK_2024.subtests.reduce((n, s) => n + max(s.id), 0)).toBe(670);
    expect(scoringRulesText(PPPK_2024.subtests.map((s) => s.id))).toBe(
      'PPPK-TEKNIS: jawaban benar bernilai 5, salah atau kosong 0. PPPK-MANAJERIAL & PPPK-SOSKUL & PPPK-WAWANCARA: setiap opsi bernilai 1–4.',
    );
  });

  it('has no pass mark (Diktum KEDUA PULUH SEMBILAN) and takes 120 + 10 minutes (Diktum KETUJUH BELAS, KEDELAPAN BELAS)', () => {
    expect(PPPK_2024.subtests.every((s) => s.passing === undefined)).toBe(true);
    expect(PPPK_2024.durationMinutes).toBe(130);
    expect(PPPK_2024.notes?.join(' ')).toContain('Pengelola Umum Operasional: kompetensi teknis 45 soal');
  });

  it('lists the competences the decree names (Diktum KELIMA BELAS)', () => {
    expect(by('PPPK-MANAJERIAL').topics).toHaveLength(8);
    expect(by('PPPK-SOSKUL').topics).toEqual(['Kepekaan terhadap Keberagaman', 'Kemampuan Berhubungan Sosial', 'Kepekaan terhadap Pentingnya Persatuan', 'Empati']);
    expect(by('PPPK-WAWANCARA').topics).toEqual(['Kejujuran', 'Komitmen', 'Keadilan', 'Etika', 'Kepatuhan']);
    expect(by('PPPK-TEKNIS').fromJobTitle).toBe(true);
  });

  it('builds a full set and a short one', () => {
    const full = buildPackagePreset(PPPK_2024, 'full', 'campuran', 'Penata Kelola Sistem dan Teknologi Informasi');
    expect(full.sections.map((s) => s.count)).toEqual([90, 25, 20, 10]);
    expect(full.durationMinutes).toBe(130);
    expect(full.passing).toEqual({});
    expect(full.sections[0].topics).toEqual(['Penata Kelola Sistem dan Teknologi Informasi']);
    const mini = buildPackagePreset(PPPK_2024, 'mini');
    expect(mini.sections.map((s) => s.count)).toEqual([10, 10, 10, 10]);
    expect(mini.durationMinutes).toBe(36);
  });

  it('tells the model what each sub-test measures', () => {
    const p = buildPrompt({ subtest: 'PPPK-SOSKUL', items: [{ topic: 'Empati', difficulty: 'sedang' }] });
    expect(p).toContain('Sub-tes: PPPK-SOSKUL (Kompetensi Sosial Kultural) untuk PPPK 2024.');
    expect(p).toContain('Tujuan sub-tes: Menilai pengetahuan dan sikap terkait pengalaman berinteraksi dengan masyarakat majemuk');
    expect(p).toContain('"score" 1 sampai 4');
  });

  it('cannot be replaced by an imported file with the same id', () => {
    const copy = JSON.parse(packageFile(PPPK_2024));
    expect(() => parsePackageFile(copy)).toThrow('id itu milik paket bawaan');
  });
});
