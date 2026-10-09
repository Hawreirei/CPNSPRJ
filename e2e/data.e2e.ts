import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function download(page: Page, format: 'PDF' | 'Word') {
  await page.getByRole('button', { name: /Unduh PDF \/ Word/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: new RegExp(`^${format}`) }).click();
  await dialog.getByText('Lengkap', { exact: true }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: `Unduh ${format}` }).click()]);
  await page.keyboard.press('Escape');
  return readFile((await file.path())!);
}

test('data analysis questions come with their numbers as a table or chart, checked and exportable', async ({ page }) => {
  // TIU with only "Analisis Data": drawn by the app, so no API key is needed.
  await page.goto('#/new');
  await page.getByRole('button', { name: /TIU saja/ }).click();
  await page.getByText('Sesuaikan lebih lanjut (opsional)').click();
  const pressed = page.locator('button[aria-pressed="true"]', { hasText: /^✓ / });
  for (const name of (await pressed.allTextContents()).map((t) => t.replace(/^✓ /, '').replace(/ \(gratis\)$/, ''))) {
    if (name !== 'Analisis Data') await page.getByRole('button', { name: new RegExp(`^✓ ${name}( \\(gratis\\))?$`) }).click();
  }
  await expect(pressed).toHaveCount(1);
  await page.getByLabel('Jumlah').fill('8');
  await expect(page.getByText('Tidak memakai kuota AI.')).toBeVisible();
  await page.getByRole('button', { name: 'Buat Soal', exact: true }).first().click();
  await page.waitForURL(/#\/sets\/[\w-]+$/);
  await expect(page.getByText('(8 dari 8 soal)')).toBeVisible({ timeout: 30_000 });
  const setId = page.url().split('/').pop();

  // Every question has its numbers as a table; charts keep theirs in a table for screen readers.
  await expect(page.locator('article')).toHaveCount(8);
  await expect(page.getByRole('table')).toHaveCount(8);
  // The app's own answer check agrees with every key.
  await expect(page.getByText('perlu dicek')).toHaveCount(0);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(
      r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id),
      scheme,
    ).toEqual([]);
  }

  const pdf = await download(page, 'PDF');
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  const docx = await download(page, 'Word');
  expect(docx.subarray(0, 2).toString()).toBe('PK');

  // Practice shows the figure and explains the answer.
  await page.goto(`#/simulation?set=${setId}&mode=practice`);
  await page.getByRole('button', { name: 'Mulai latihan' }).click();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(1);
  await page.keyboard.press('a');
  await expect(page.getByText(/^(Benar\. \+5|Kurang tepat\. Jawaban yang benar: [A-E]\.)$/)).toBeVisible();
  await expect(page.getByText(/Jawaban: [A-E]\./).first()).toBeVisible();

  // And so does the exam.
  await page.goto(`#/simulation?set=${setId}`);
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await page.waitForURL(/#\/cat\//);
  await expect(page.getByRole('table')).toHaveCount(1);
});
