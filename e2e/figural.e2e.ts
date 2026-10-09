import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, seriousViolations, test } from './fixtures';

const NEW_TOPICS = ['Matriks Figural', 'Transformasi Figural', 'Figural Berbeda'];

async function download(page: Page, format: 'PDF' | 'Word') {
  await page.getByRole('button', { name: /Unduh PDF \/ Word/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: new RegExp(`^${format}`) }).click();
  await dialog.getByText('Lengkap', { exact: true }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: `Unduh ${format}` }).click()]);
  await page.keyboard.press('Escape');
  return readFile((await file.path())!);
}

test('matrix, transform and odd-one-out figures are drawn by the app and work everywhere', async ({ page }) => {
  // TIU with only the new figural topics: no AI, so no API key is needed.
  await page.goto('#/new');
  await page.getByRole('button', { name: /TIU saja/ }).click();
  await page.getByText('Sesuaikan lebih lanjut (opsional)').click();
  const pressed = page.locator('button[aria-pressed="true"]', { hasText: /^✓ / });
  for (const name of (await pressed.allTextContents()).map((t) => t.replace(/^✓ /, '').replace(/ \(gratis\)$/, ''))) {
    if (!NEW_TOPICS.includes(name)) await page.getByRole('button', { name: new RegExp(`^✓ ${name}( \\(gratis\\))?$`) }).click();
  }
  await expect(pressed).toHaveCount(3);
  await page.getByLabel('Jumlah').fill('6');
  await expect(page.getByText('Tidak memakai kuota AI.')).toBeVisible();
  await page.getByRole('button', { name: 'Buat Soal', exact: true }).first().click();
  await page.waitForURL(/#\/sets\/[\w-]+$/);
  await expect(page.getByText('(6 dari 6 soal)')).toBeVisible({ timeout: 30_000 });
  const setUrl = page.url();

  // Stem figures and options are described for screen readers.
  await expect(page.getByRole('img', { name: /^Baris 1: .*Baris 3: .*tanda tanya$/ }).first()).toBeVisible();
  await expect(page.getByRole('img', { name: /^Gambar awal: 1 panah/ }).first()).toBeVisible();
  const odd = page.locator('article', { hasText: 'Empat dari lima gambar' }).first();
  await expect(odd.locator('[role="img"][aria-label]')).toHaveCount(5);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await seriousViolations(page), scheme).toEqual([]);
  }

  // Exports include the figures.
  const pdf = await download(page, 'PDF');
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(20_000);
  const docx = await download(page, 'Word');
  expect(docx.subarray(0, 2).toString()).toBe('PK');
  expect(docx.length).toBeGreaterThan(10_000);

  // Practice: answer a figural question and get its explanation.
  await page.goto(`#/simulation?set=${setUrl.split('/').pop()}&mode=practice`);
  await page.getByRole('button', { name: 'Mulai latihan' }).click();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^A / }).locator('[role="img"][aria-label]')).toBeVisible();
  await page.keyboard.press('a');
  await expect(page.getByText(/^(Benar\. \+5|Kurang tepat\. Jawaban yang benar: [A-E]\.)$/)).toBeVisible();
  await expect(page.getByText(/^Pembahasan/).first()).toBeVisible();

  // Exam: the figures are there too.
  await page.goto(`#/simulation?set=${setUrl.split('/').pop()}`);
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await page.waitForURL(/#\/cat\//);
  await expect(page.getByRole('button', { name: /^E / }).locator('[role="img"][aria-label]')).toBeVisible();
});
