import { expect, keyAndSet, KEY, test } from './fixtures';

test('practice shows the key after each answer, locks it, and stays off the exam charts', async ({ page }) => {
  await keyAndSet(page);
  await page.getByRole('link', { name: 'Mulai latihan ujian' }).click();
  await page.getByRole('radio', { name: /Latihan/ }).click();

  // Practise TWK only.
  await page.getByRole('checkbox', { name: /semua topik TIU/ }).uncheck();
  await page.getByRole('checkbox', { name: /semua topik TKP/ }).uncheck();
  await expect(page.getByText('Topik yang dilatih (10 soal)')).toBeVisible();
  await page.getByRole('button', { name: 'Mulai latihan' }).click();
  await page.waitForURL(/#\/practice\//);

  // Wrong answer: the key and the explanation appear at once.
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  await page.keyboard.press('b');
  await expect(page.getByText(`Kurang tepat. Jawaban yang benar: ${KEY}.`)).toBeVisible();
  await expect(page.getByText(/^Pembahasan/).first()).toBeVisible();
  // The answer is final.
  await page.keyboard.press(KEY.toLowerCase());
  await expect(page.getByRole('button', { name: /^B Pernyataan/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /^A Pernyataan/ })).toHaveAttribute('aria-pressed', 'false');

  await page.keyboard.press('Enter');
  await expect(page.getByText('Soal 2', { exact: true })).toBeVisible();
  await page.keyboard.press(KEY.toLowerCase());
  await expect(page.getByText('Benar. +5')).toBeVisible();

  // Survives a reload.
  await page.reload();
  await expect(page.getByText('Benar. +5')).toBeVisible();
  await expect(page.getByText('Benar 1 / 2')).toBeVisible();

  await page.getByRole('button', { name: 'Selesai', exact: true }).click();
  await page.getByRole('button', { name: 'Lihat hasil', exact: true }).click();
  await page.waitForURL(/#\/results\//);
  await expect(page.getByRole('heading', { name: /Laporan Skor/ })).toContainText('Latihan');
  await expect(page.getByText('tidak masuk grafik skor ujian', { exact: false })).toBeVisible();
  await expect(page.getByText('Belum memenuhi ambang batas')).toHaveCount(0);

  // "Latih ulang topik ini" comes back to practice with the weak topics picked.
  await page.getByRole('link', { name: 'Latih ulang topik ini' }).click();
  await expect(page.getByRole('radio', { name: /Latihan/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'Pancasila', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.goto('#/progress');
  await expect(page.getByText('0 ujian dan 1 latihan selesai.', { exact: false })).toBeVisible();
  await expect(page.getByText('Belum ada data.').first()).toBeVisible();
});
