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

test('a seller packs sets into a bundle; the buyer imports it and starts with sets and a full question bank', async ({ page, browser }) => {
  await keyAndSet(page);
  await page.goto('#/sets');
  await page.getByRole('button', { name: 'Ekspor bundel' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nama bundel').fill('Bundel Uji');
  expect(await seriousViolations(page)).toEqual([]);
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Unduh bundel (.cpnsbundle.json)' }).click()]);
  expect(download.suggestedFilename()).toBe('Bundel Uji.cpnsbundle.json');
  const path = (await download.path())!;
  expect(await readFile(path, 'utf8')).not.toMatch(/AIza|"report"|"rating"/);

  // A new learner: the dashboard points to the import, and one file fills Set Saya and the bank.
  const b = await freshPage(browser);
  await b.page.goto('#/');
  await b.page.getByRole('link', { name: 'Impor di sini' }).click();
  await b.page.getByLabel('Pilih berkas set (.cpnsset.json)').setInputFiles(path);
  await expect(b.page.getByRole('heading', { name: 'Bundel Uji' })).toBeVisible();
  expect(await seriousViolations(b.page)).toEqual([]);
  await b.page.getByRole('button', { name: /^Impor/ }).click();
  await b.page.waitForURL(/#\/(sets\/[\w-]+|sets)$/);
  await b.page.goto('#/bank');
  await expect(b.page.getByRole('checkbox', { name: 'Pilih soal' }).first()).toBeVisible();
  await b.ctx.close();
});
