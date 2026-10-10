import { addGeminiKey, expect, seriousViolations, test } from './fixtures';

/** A made-up exam package: its numbers are for this test only and come from no document. */
const PACKAGE = {
  app: 'cpns-skd-builder',
  kind: 'exam-package',
  version: 1,
  package: {
    id: 'uji-kerja',
    name: 'Ujian Uji',
    source: 'Contoh untuk pengujian',
    durationMinutes: 60,
    subtests: [
      { id: 'UJI-TEKNIS', name: 'Kompetensi teknis', scoring: { kind: 'keyed', correct: 5 }, count: 20, fromJobTitle: true },
      { id: 'UJI-SIKAP', name: 'Sikap kerja', scoring: { kind: 'graded', min: 1, max: 4 }, count: 10, topics: ['Kerja sama', 'Integritas'] },
    ],
  },
};

test('an imported exam package: questions from a job title, an exam without pass marks, its own history', async ({ page, gemini }) => {
  test.setTimeout(90_000);
  await addGeminiKey(page);

  // Import the package file in Settings.
  await page.goto('#/settings');
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Paket ujian' }) });
  await section.getByLabel('Impor paket ujian (.json)').setInputFiles({ name: 'paket.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(PACKAGE)) });
  await expect(section.getByRole('status')).toContainText('Paket "Ujian Uji" ditambahkan.');
  // Where the numbers came from is kept in the file, not shown.
  await expect(section).toContainText('2 sub-tes · 60 menit');
  await expect(section).not.toContainText('Contoh untuk pengujian');
  await expect(section).toContainText('UJI-SIKAP Sikap kerja: 10 soal, tiap opsi 1–4, tanpa ambang batas');
  await expect(section).toContainText('topik dari nama jabatan');

  // New set: pick the package, name the job.
  await page.goto('#/new');
  await page.getByRole('radio', { name: /Ujian Uji/ }).click();
  await expect(page.getByText(/bukan data resmi|Sumber angka/)).toHaveCount(0);
  await expect(page.getByText('Isi nama jabatan dulu.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buat Soal', exact: true }).first()).toBeDisabled();
  await page.getByLabel('Nama jabatan yang dilamar').fill('Pranata Komputer');
  expect(await seriousViolations(page)).toEqual([]);
  await page.getByRole('button', { name: /Latihan Singkat/ }).click();
  await page.getByRole('button', { name: 'Buat Soal', exact: true }).first().click();
  await page.waitForURL(/#\/sets\/[\w-]+$/);
  await expect(page.getByText('Semua soal selesai dibuat')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('(20 dari 20 soal)')).toBeVisible();
  expect(gemini.served).toMatchObject({ 'UJI-TEKNIS': 10, 'UJI-SIKAP': 10 });
  await expect(page.getByText('· UJI-TEKNIS 10 · UJI-SIKAP 10')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ujian Uji · Pranata Komputer');

  // The exam: no pass marks to show.
  await page.getByRole('link', { name: 'Mulai latihan ujian' }).click();
  await expect(page.getByText('UJI-TEKNIS: tanpa ambang batas')).toBeVisible();
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  await page.keyboard.press('a');
  await page.getByRole('button', { name: 'Soal 11, belum dijawab' }).click();
  await page.keyboard.press('a');
  await page.getByRole('button', { name: 'Selesai' }).click();
  await page.getByRole('button', { name: 'Kirim jawaban' }).click();
  await page.waitForURL(/#\/results\//);

  await expect(page.getByText('kelulusan ditentukan peringkat')).toBeVisible();
  await expect(page.getByText('Memenuhi semua ambang batas')).toHaveCount(0);
  await expect(page.getByText('Belum memenuhi ambang batas')).toHaveCount(0);
  const teknis = page.locator('.card', { hasText: 'Kompetensi teknis' }).first();
  await expect(teknis).toContainText('5/ 50');
  const sikap = page.locator('.card', { hasText: 'Sikap kerja' }).first();
  await expect(sikap).toContainText('4/ 40');
  await expect(sikap).toContainText('1 opsi skor 4');
  expect(await seriousViolations(page)).toEqual([]);

  // Its own history table in Progress, apart from SKD.
  await page.goto('#/progress?tab=riwayat');
  const history = page.locator('section', { has: page.getByRole('heading', { name: 'Riwayat skor Ujian Uji' }) });
  await expect(history).toContainText('5/50');
  await expect(history).toContainText('4/40');
  await expect(page.getByRole('heading', { name: 'Riwayat skor', exact: true })).toHaveCount(0);

  // While its questions are in the bank, the package stays.
  await page.goto('#/settings');
  page.once('dialog', (d) => void d.accept());
  await section.getByRole('button', { name: 'Hapus' }).click();
  await expect(section.getByRole('status')).toContainText('Masih ada 20 soal paket ini di Bank Soal.');
});
