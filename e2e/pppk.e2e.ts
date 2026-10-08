import { addGeminiKey, expect, test } from './fixtures';

test('PPPK 2024 is built in: a set from the job title, an exam scored 5/0 and 1–4, decided by ranking', async ({ page, gemini }) => {
  test.setTimeout(90_000);
  await addGeminiKey(page);

  await page.goto('#/settings');
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Paket ujian' }) });
  await expect(section).toContainText('PPPK 2024 (bawaan)');
  await expect(section).toContainText('Sumber: Keputusan Menteri PANRB Nomor 347 Tahun 2024');
  await expect(section).toContainText('PPPK-TEKNIS Kompetensi Teknis: 90 soal, benar 5, salah 0, tanpa ambang batas, topik dari nama jabatan');
  await expect(section).toContainText('PPPK-WAWANCARA Wawancara: 10 soal, tiap opsi 1–4, tanpa ambang batas');

  await page.goto('#/new');
  await page.getByRole('radio', { name: 'PPPK 2024' }).click();
  await expect(page.getByText('Sumber angka: Keputusan Menteri PANRB Nomor 347 Tahun 2024')).toBeVisible();
  await expect(page.getByText('Pengelola Umum Operasional: kompetensi teknis 45 soal')).toBeVisible();
  await expect(page.getByRole('button', { name: /PPPK 2024 lengkap/ })).toContainText('145 soal');
  await expect(page.getByRole('button', { name: /PPPK 2024 lengkap/ })).toContainText('130 menit');
  await page.getByLabel('Nama jabatan yang dilamar').fill('Arsiparis Ahli Pertama');
  await page.getByRole('button', { name: /Latihan Singkat/ }).click();
  await page.getByRole('button', { name: 'Buat Soal', exact: true }).first().click();
  await page.waitForURL(/#\/sets\/[\w-]+$/);
  await expect(page.getByText('Semua soal selesai dibuat')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('(40 dari 40 soal)')).toBeVisible();
  expect(gemini.served).toMatchObject({ 'PPPK-TEKNIS': 10, 'PPPK-MANAJERIAL': 10, 'PPPK-SOSKUL': 10, 'PPPK-WAWANCARA': 10 });

  await page.getByRole('link', { name: 'Mulai latihan ujian' }).click();
  await expect(page.getByText('PPPK-TEKNIS: tanpa ambang batas')).toBeVisible();
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  // One technical question right (5), one managerial best option (4).
  await page.keyboard.press('a');
  await page.getByRole('button', { name: 'Soal 11, belum dijawab' }).click();
  await page.keyboard.press('a');
  await page.getByRole('button', { name: 'Selesai' }).click();
  await page.getByRole('button', { name: 'Kirim jawaban' }).click();
  await page.waitForURL(/#\/results\//);

  await expect(page.getByText('kelulusan ditentukan peringkat')).toBeVisible();
  await expect(page.locator('.card', { hasText: 'Kompetensi Teknis' }).first()).toContainText('5/ 50');
  await expect(page.locator('.card', { hasText: 'Kompetensi Manajerial' }).first()).toContainText('4/ 40');
  await expect(page.locator('.card', { hasText: 'Wawancara' }).first()).toContainText('0/ 40');
});
