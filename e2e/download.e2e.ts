import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, keyAndSet, test } from './fixtures';

async function download(page: Page, format: 'PDF' | 'Word', pack: string) {
  await page.getByRole('button', { name: /Unduh PDF \/ Word/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: new RegExp(`^${format}`) }).click();
  await dialog.getByText(pack, { exact: true }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: `Unduh ${format}` }).click()]);
  return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) };
}

test('downloads the set as PDF and Word', async ({ page }) => {
  await keyAndSet(page);

  const pdf = await download(page, 'PDF', 'Lengkap');
  expect(pdf.name).toMatch(/Lengkap\.pdf$/);
  expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.bytes.length).toBeGreaterThan(10_000);

  const docx = await download(page, 'Word', 'Soal saja');
  expect(docx.name).toMatch(/Soal\.docx$/);
  // A .docx is a zip archive.
  expect(docx.bytes.subarray(0, 2).toString()).toBe('PK');
  expect(docx.bytes.length).toBeGreaterThan(5_000);
});
