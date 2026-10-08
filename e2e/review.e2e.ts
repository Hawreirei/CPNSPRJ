import { expect, keyAndSet, KEY, test } from './fixtures';

test('mistakes go to the notebook and come back on schedule', async ({ page }) => {
  await keyAndSet(page);

  // Exam: Q1 wrong, Q2 right, Q3 right but marked unsure, the other 27 empty -> 29 mistakes.
  await page.getByRole('link', { name: 'Mulai latihan ujian' }).click();
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await page.waitForURL(/#\/cat\//);
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  await page.keyboard.press('b');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press(KEY.toLowerCase());
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Ragu-ragu' }).click();
  await page.keyboard.press(KEY.toLowerCase());
  await page.getByRole('button', { name: 'Selesai' }).click();
  await page.getByRole('button', { name: 'Kirim jawaban' }).click();
  await page.waitForURL(/#\/results\//);
  await expect(page.getByText('29 soal yang salah, kosong, atau ragu-ragu masuk')).toBeVisible();

  await page.goto('#/');
  await expect(page.getByText('Ulangan hari ini: 20 soal')).toBeVisible();
  await expect(page.getByText('(29 jatuh tempo, batas harian 20)', { exact: false })).toBeVisible();

  // A smaller daily limit.
  await page.goto('#/settings');
  await page.getByText('Pengaturan lanjutan').click();
  await page.getByLabel('Batas ulangan per hari').fill('3');

  // From here on the clock is ours, so "tomorrow" can be reached without waiting.
  await page.clock.install();
  await page.goto('#/review');
  await expect(page.getByRole('tab', { name: 'Ulangan hari ini (29)' })).toBeVisible();
  await expect(page.getByText('Diulang hari ini: 0 / 3')).toBeVisible();

  // 1: answer, tag the reason, forget it.
  await page.keyboard.press('b');
  await expect(page.getByText(/^Pembahasan/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Salah konsep' }).click();
  await expect(page.getByRole('button', { name: /Lupa/ })).toContainText('1 hari');
  await page.keyboard.press('1');
  // 2: reveal without answering, easy.
  await expect(page.getByText('Soal 2 dari 3')).toBeVisible();
  await page.getByRole('button', { name: 'Tampilkan jawaban' }).click();
  await expect(page.getByRole('button', { name: /Mudah/ })).toContainText('3 hari');
  await page.getByRole('button', { name: /Mudah/ }).click();
  // 3: forget.
  await expect(page.getByText('Soal 3 dari 3')).toBeVisible();
  await page.getByRole('button', { name: 'Tampilkan jawaban' }).click();
  await page.getByRole('button', { name: /Lupa/ }).click();

  await expect(page.getByText('Ulangan hari ini selesai')).toBeVisible();
  await expect(page.getByText('Diulang hari ini: 3 / 3')).toBeVisible();
  await expect(page.getByText('Besok: 2 soal', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ulangi 10 soal lagi (26 masih jatuh tempo)' })).toBeVisible();

  // The notebook list, filtered by reason.
  await page.getByRole('tab', { name: /Semua catatan/ }).click();
  await page.getByLabel('Alasan salah').selectOption({ label: 'Salah konsep' });
  await expect(page.getByText('1 soal', { exact: true })).toBeVisible();
  const row = page.locator('details');
  await expect(row).toContainText('ulang besok');
  await expect(row).toContainText('terlupa 1×');

  // Next day: the two forgotten questions are due again and the daily count starts over.
  await page.clock.setSystemTime(Date.now() + 26 * 3_600_000);
  await page.goto('#/review');
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Ulangan hari ini (28)' })).toBeVisible();
  await expect(page.getByText('Diulang hari ini: 0 / 3')).toBeVisible();
});
