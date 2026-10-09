import { readFile } from 'node:fs/promises';
import type { Browser } from '@playwright/test';
import { expect, keyAndSet, seriousViolations, test } from './fixtures';

/** A brand-new browser profile: nothing stored, nothing shared but what we hand over. */
async function freshPage(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' });
  await ctx.route(
    (url) => url.hostname !== 'localhost',
    (route) => route.abort('blockedbyclient'),
  );
  return { ctx, page: await ctx.newPage() };
}

test('a set shared as a file or a link imports into another browser, without anything personal', async ({ page, browser }) => {
  const setUrl = await keyAndSet(page);
  // Something personal on one question: a report and a note, which must not travel.
  await page.locator('article').first().locator('summary', { hasText: '⋯' }).click();
  await page.getByRole('button', { name: 'Laporkan atau nilai soal' }).click();
  await page.getByRole('dialog').getByRole('radio', { name: 'Salah ketik atau tampilan rusak' }).check();
  await page.getByRole('dialog').getByLabel('Catatan (opsional)').fill('rahasia pengirim');
  await page.getByRole('dialog').getByRole('button', { name: 'Simpan' }).click();

  await page.getByRole('button', { name: 'Bagikan' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Yang tidak ikut: API key')).toBeVisible();
  const linkBox = dialog.getByLabel('Tautan set');
  await expect(linkBox).toBeVisible();
  const link = await linkBox.inputValue();
  expect(link).toContain('#/import?d=');
  expect(await seriousViolations(page)).toEqual([]);
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Unduh berkas (.cpnsset.json)' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.cpnsset\.json$/);
  const path = (await download.path())!;
  const file = await readFile(path, 'utf8');
  expect(file).not.toMatch(/AIza|rahasia pengirim|"report"|"rating"/);
  await page.keyboard.press('Escape');

  // Another browser, by file.
  const a = await freshPage(browser);
  await a.page.goto('#/sets');
  await a.page.getByRole('link', { name: 'Impor set dari berkas' }).click();
  await a.page.getByLabel('Pilih berkas set (.cpnsset.json)').setInputFiles(path);
  await expect(a.page.getByText(/^30 soal: TWK 10, TIU 10, TKP 10\./)).toBeVisible();
  expect(await seriousViolations(a.page)).toEqual([]);
  await a.page.getByRole('button', { name: 'Impor set' }).click();
  await a.page.waitForURL(/#\/sets\/[\w-]+$/);
  await expect(a.page.locator('article')).toHaveCount(30);
  await expect(a.page.getByText('dari berkas bersama').first()).toBeVisible();
  await expect(a.page.getByText('rahasia pengirim')).toHaveCount(0);
  // The same set again: its questions are reused, not copied.
  await a.page.goto('#/import');
  await a.page.getByLabel('Pilih berkas set (.cpnsset.json)').setInputFiles(path);
  await expect(a.page.getByText(/30 soal sudah ada di Bank Soal Anda dan dipakai ulang/)).toBeVisible();
  await a.ctx.close();

  // Another browser, by link.
  const b = await freshPage(browser);
  await b.page.goto(link.replace(/^.*?#/, '/#'));
  await expect(b.page.getByText(/^30 soal: TWK 10, TIU 10, TKP 10\./)).toBeVisible();
  await b.page.getByRole('button', { name: 'Impor set' }).click();
  await b.page.waitForURL(/#\/sets\/[\w-]+$/);
  await expect(b.page.locator('article')).toHaveCount(30);
  // A cut-off link says so and stores nothing.
  await b.page.goto(link.replace(/^.*?#/, '/#').slice(0, -40));
  await expect(b.page.getByRole('alert')).toContainText('Tautan rusak atau terpotong');
  await b.ctx.close();
  expect(setUrl).toBeTruthy();

  // A small set fits in a QR code.
  await page.goto('#/bank');
  const picks = page.getByRole('checkbox', { name: 'Pilih soal' });
  await picks.nth(0).check();
  await picks.nth(1).check();
  page.once('dialog', (d) => void d.accept('Dua soal'));
  await page.getByRole('button', { name: 'Jadikan set baru' }).click();
  await page.waitForURL(/#\/sets\/[\w-]+$/);
  await page.getByRole('button', { name: 'Bagikan' }).click();
  await expect(page.getByRole('img', { name: 'Kode QR tautan set' })).toBeVisible();
});
