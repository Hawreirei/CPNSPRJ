import type { Page } from '@playwright/test';
import { expect, keyAndSet, test } from './fixtures';

/** The libraries kept out of the startup bundle, and the app code only other pages share (chunk names come from vite.config.ts). */
const LAZY = /\/assets\/(mathjs|katex|anthropic|pages)-[\w-]+\.(js|css)$/;

function lazyRequests(page: Page) {
  const seen: string[] = [];
  page.on('request', (r) => {
    const m = LAZY.exec(new URL(r.url()).pathname);
    if (m) seen.push(m[1]);
  });
  return seen;
}

/** Let the app finish its idle-time startup work (stored-question revalidation). */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => new Promise((r) => requestIdleCallback(() => setTimeout(r, 500), { timeout: 6000 })));
}

/** A generated TIU arithmetic question: edit it to show a formula and an expression that disagrees with the key. */
async function editNumericQuestion(page: Page) {
  const card = page.locator('article', { hasText: 'Soal hitung uji' }).first();
  await card.locator('summary', { hasText: '⋯' }).click();
  await page.getByRole('button', { name: 'Edit soal' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Soal/).fill('Berapakah $\\frac{3}{4} \\times 8$ ditambah satu?');
  // The key and explanation stay at A, but the expression now points at option B: validation must flag it.
  const math = dialog.getByLabel(/^Ekspresi hitung/);
  await math.fill(`${await math.inputValue()} + 1`);
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(dialog).toBeHidden();
  const edited = page.locator('article', { hasText: 'ditambah satu' });
  await expect(edited.locator('.katex').first()).toBeVisible();
  await expect(edited.getByText(/Kunci jawaban A dan pembahasan berbeda dengan hitungan ulang otomatis \(\d+, opsi B\)/)).toBeVisible();
}

test('the dashboard loads without mathjs, KaTeX, the Anthropic SDK or code only other pages use; they load when needed', async ({ page }) => {
  const seen = lazyRequests(page);

  // First visit, empty database.
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await settle(page);
  expect(seen, 'lazy chunks on a fresh dashboard').toEqual([]);

  // Generating questions checks TIU arithmetic, so mathjs loads then.
  const setUrl = await keyAndSet(page);
  expect(seen).toEqual(expect.arrayContaining(['pages', 'mathjs']));

  // Returning with a filled database: still nothing heavy on the dashboard.
  seen.length = 0;
  await page.goto('./');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await settle(page);
  expect(seen, 'lazy chunks on a returning dashboard').toEqual([]);

  // A formula pulls in KaTeX (and its stylesheet); saving an edit re-checks the arithmetic.
  await page.goto(setUrl);
  await editNumericQuestion(page);
  expect(seen).toEqual(expect.arrayContaining(['katex', 'mathjs']));
  expect(seen).not.toContain('anthropic');
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });

  test('formulas and answer checking work offline after the first visit', async ({ page, context }) => {
    test.setTimeout(90_000);
    const setUrl = await keyAndSet(page);
    // The service worker activates once it has precached every chunk, the lazy ones included,
    // and controls the page from the next load on.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

    await context.setOffline(true);
    const seen = lazyRequests(page);
    await page.goto(setUrl);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeAttached();
    await editNumericQuestion(page);
    expect(seen).toEqual(expect.arrayContaining(['katex', 'mathjs']));
  });
});
