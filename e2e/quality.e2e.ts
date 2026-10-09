import { expect, keyAndSet, test } from './fixtures';

test('a reported question is flagged, filtered in the bank, left out of new sets, and can be withdrawn', async ({ page }) => {
  const setUrl = await keyAndSet(page);

  // Report the first TWK question from the set page, with a rating.
  const card = page.locator('article', { hasText: /Soal uji TWK \d+/ }).first();
  const stem = /Soal uji TWK \d+/.exec((await card.textContent()) ?? '')![0];
  await card.locator('summary', { hasText: '⋯' }).click();
  await page.getByRole('button', { name: 'Laporkan atau nilai soal' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: '2 dari 5' }).check();
  await dialog.getByRole('radio', { name: 'Kunci jawaban salah' }).check();
  await dialog.getByLabel('Catatan (opsional)').fill('Menurut UUD 1945 jawabannya B');
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(dialog).toBeHidden();
  const reported = page.locator('article', { hasText: `${stem} tentang` });
  await expect(reported.getByText('Dilaporkan: kunci jawaban salah. "Menurut UUD 1945 jawabannya B"')).toBeVisible();
  await expect(reported.getByText('perlu dicek')).toBeVisible();
  await expect(reported.getByText('nilai 2/5')).toBeVisible();

  // The bank can show only reported questions.
  await page.goto('#/bank');
  await page.getByText('Filter lainnya').click();
  await page.locator('select', { has: page.locator('option', { hasText: 'Dilaporkan saja' }) }).selectOption({ label: 'Dilaporkan saja' });
  await expect(page.getByText('1 soal ditemukan')).toBeVisible();
  await expect(page.locator('article', { hasText: `${stem} tentang` })).toBeVisible();

  // A new set from the bank leaves it out (the bank is one TWK question short), unless asked to include it.
  await page.goto('#/new');
  await page.getByRole('button', { name: /Latihan Singkat/ }).click();
  await expect(page.getByLabel('Pakai juga 1 soal yang Anda laporkan')).not.toBeChecked();
  const shortfall = page.waitForEvent('dialog');
  await page.getByRole('button', { name: 'Ambil dari Bank Soal (tanpa AI)' }).click();
  const alert = await shortfall;
  expect(alert.message()).toContain('TWK kurang 1');
  await alert.accept();
  await page.waitForURL(/#\/sets\/[\w-]+$/);
  expect(page.url()).not.toBe(setUrl);
  await expect(page.locator('article').first()).toBeVisible();
  await expect(page.locator('article', { hasText: `${stem} tentang` })).toHaveCount(0);

  // Withdraw it from the bank.
  await page.goto('#/bank');
  await page
    .locator('article', { hasText: `${stem} tentang` })
    .getByRole('button', { name: 'Laporan' })
    .click();
  await dialog.getByRole('radio', { name: 'Tidak ada lagi (cabut laporan)' }).check();
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await page.getByText('Filter lainnya').click();
  await page.locator('select', { has: page.locator('option', { hasText: 'Dilaporkan saja' }) }).selectOption({ label: 'Dilaporkan saja' });
  await expect(page.getByText('0 soal ditemukan')).toBeVisible();
});

test('reporting from a practice explanation does not trigger the practice shortcuts', async ({ page }) => {
  const setUrl = await keyAndSet(page);
  await page.goto(`#/simulation?set=${setUrl.split('/').pop()}&mode=practice`);
  await page.getByRole('button', { name: 'Mulai latihan' }).click();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  await page.keyboard.press('b');

  await page.getByRole('button', { name: /Laporkan atau beri nilai/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Ambigu (lebih dari satu jawaban benar)' }).check();
  const note = dialog.getByLabel('Catatan (opsional)');
  await note.fill('B dan A sama-sama benar');
  // Arrow keys and Enter in the note move the caret, not the practice session.
  await note.press('ArrowLeft');
  await note.press('ArrowRight');
  await note.press('Enter');
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Soal ini sudah Anda laporkan · ubah' })).toBeVisible();
});
