import { expect, keyAndSet, KEY, test } from './fixtures';

test('API key, generate a set, take the exam, and see the report and progress', async ({ page, gemini }) => {
  await keyAndSet(page);

  // Mini set: TWK + non-figural TIU + TKP come from the fake AI; figural TIU is drawn by the app.
  expect(gemini.generateCalls).toBeGreaterThan(0);
  expect(gemini.served.TWK).toBe(10);
  expect(gemini.served.TKP).toBe(10);
  expect(gemini.served.TIU).toBeGreaterThan(0);
  expect(gemini.served.TIU).toBeLessThanOrEqual(10);
  await expect(page.getByText('perlu dicek')).toHaveCount(0);

  // Start the exam from the set's own page.
  await page.getByRole('link', { name: 'Mulai latihan ujian' }).click();
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await page.waitForURL(/#\/cat\//);

  // Answer the first ten questions (TWK) with the key, leave the rest empty.
  for (let i = 0; i < 10; i++) {
    await expect(page.getByText(`Soal ${i + 1}`, { exact: true })).toBeVisible();
    await page.keyboard.press(KEY.toLowerCase());
    await page.keyboard.press('ArrowRight');
  }
  await page.getByRole('button', { name: 'Selesai' }).click();
  await expect(page.getByText('Terjawab 10 dari 30 soal.')).toBeVisible();
  await page.getByRole('button', { name: 'Kirim jawaban' }).click();

  await page.waitForURL(/#\/results\//);
  await expect(page.getByRole('heading', { name: 'Laporan Skor' })).toBeVisible();
  const twk = page.locator('.card', { hasText: 'Tes Wawasan Kebangsaan' });
  await expect(twk).toContainText('50');
  await expect(twk).toContainText('10 benar');
  await expect(page.getByText('soal yang salah, kosong, atau ragu-ragu masuk')).toBeVisible();

  await page.getByRole('link', { name: 'Progres', exact: true }).click();
  await expect(page.getByText('1 ujian selesai.', { exact: false })).toBeVisible();
  await expect(page.locator('table')).toContainText('Latihan Singkat');
});

test('the exam submits itself when time runs out', async ({ page }) => {
  const setUrl = await keyAndSet(page);
  const setId = setUrl.split('/').pop()!;

  // Fake clock from here on: no test waits for real minutes.
  await page.clock.install();
  await page.goto(`#/simulation?set=${setId}`);
  await page.getByLabel('Durasi (menit)').fill('2');
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await page.waitForURL(/#\/cat\//);
  await page.keyboard.press(KEY.toLowerCase());
  await expect(page.locator('header .font-mono')).toHaveText(/0[12]:\d\d/);

  await page.clock.fastForward('02:01');
  await page.waitForURL(/#\/results\//);
  await expect(page.getByRole('heading', { name: 'Laporan Skor' })).toBeVisible();
});
