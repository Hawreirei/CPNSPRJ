import type { Locator, Page } from '@playwright/test';
import { importChartPage } from './chartPage';
import { expect, keyAndSet, KEY, seriousViolations, test } from './fixtures';

const hashPath = (page: Page) => '#/' + page.url().split('#/')[1];

/**
 * What makes the page scroll sideways on a phone: elements that stick out past the screen and are
 * not inside something that scrolls (or clips) on its own, like a wide table in its scroll box.
 */
async function sideScroll(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= width) return [];
    const contained = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== 'visible') return true;
      }
      return false;
    };
    const name = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : ''}`;
    const out = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > width + 1 && !contained(el))
      .map((el) => `${name(el)} "${(el.textContent ?? '').trim().slice(0, 40)}" ends at ${Math.round(el.getBoundingClientRect().right)} px`);
    return out.length ? out.slice(0, 5) : [`the page is ${document.documentElement.scrollWidth} px wide`];
  });
}

test('every main page fits a 360 px phone screen and has no serious WCAG violations, light and dark', async ({ page }) => {
  test.setTimeout(180_000);
  const setUrl = await keyAndSet(page);
  const setPath = '#/' + setUrl.split('#/')[1];
  const setId = setUrl.split('/').pop();

  // A finished exam (report, progress, notebook), a practice and an exam left open.
  await page.goto(`#/simulation?set=${setId}`);
  await page.getByRole('button', { name: 'Mulai ujian' }).tap();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Selesai' }).tap();
  await page.getByRole('button', { name: 'Kirim jawaban' }).tap();
  await page.waitForURL(/#\/results\//);
  const results = hashPath(page);
  await page.goto(`#/simulation?set=${setId}&mode=practice`);
  await page.getByRole('button', { name: 'Mulai latihan' }).tap();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  const practice = hashPath(page);
  await page.goto(`#/simulation?set=${setId}`);
  await page.getByRole('button', { name: 'Mulai ujian' }).tap();
  await page.waitForURL(/#\/cat\//);
  const exam = hashPath(page);

  const pages = [
    '#/',
    '#/new',
    setPath,
    '#/sets',
    '#/bank',
    '#/bank/import',
    '#/simulation',
    exam,
    practice,
    results,
    '#/progress',
    '#/review',
    '#/review?tab=semua',
    '#/kartu',
    '#/kamus',
    '#/keys',
    '#/settings',
    '#/help',
  ];
  const found: string[] = [];
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const p of pages) {
      await page.goto(p);
      await page.locator('h1, h2').first().waitFor();
      if (scheme === 'light') found.push(...(await sideScroll(page)).map((v) => `${p}: side scroll: ${v}`));
      found.push(...(await seriousViolations(page)).map((v) => `${scheme} ${p}: ${v}`));
    }
    // Dialogs that hold wide content: downloading and sharing a set (with its QR code).
    for (const name of [/Unduh PDF \/ Word/, /^Bagikan$/]) {
      await page.goto(setPath);
      await page.getByRole('button', { name }).tap();
      await expect(page.getByRole('dialog')).toBeVisible();
      if (scheme === 'light') found.push(...(await sideScroll(page)).map((v) => `${name} dialog: side scroll: ${v}`));
      found.push(...(await seriousViolations(page)).map((v) => `${scheme} ${name} dialog: ${v}`));
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  }
  expect(found, found.join('\n')).toEqual([]);
});

/** Smallest width and height among these elements, in CSS pixels. */
async function smallest(items: Locator) {
  const boxes = await items.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
  return { width: Math.min(...boxes.map((b) => b.width)), height: Math.min(...boxes.map((b) => b.height)) };
}

/** The answer options of the question on screen (exam, practice or notebook): buttons led by their letter. */
const options = (page: Page) =>
  page
    .locator('main')
    .getByRole('button')
    .filter({ has: page.locator('span', { hasText: /^[A-E]$/ }) });

/** The answer option with this letter. */
const option = (page: Page, label: string) => options(page).filter({ has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) });

test('an exam, a practice and the notebook are done by tapping, with targets big enough for a finger', async ({ page }) => {
  test.setTimeout(120_000);
  const setId = (await keyAndSet(page)).split('/').pop();

  // Exam: Q1 wrong, Q2 right but unsure, the other 28 empty (30 for the notebook); the number grid jumps to Q5.
  await page.goto(`#/simulation?set=${setId}`);
  await page.getByRole('button', { name: 'Mulai ujian' }).tap();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  // Every option of a question can be hit with a finger: at least 44 px tall.
  expect((await smallest(options(page))).height).toBeGreaterThanOrEqual(44);
  await option(page, 'B').tap();
  await page.getByRole('button', { name: 'Berikutnya →' }).tap();
  await expect(page.getByText('Soal 2', { exact: true })).toBeVisible();
  await option(page, KEY).tap();
  await page.getByRole('button', { name: 'Ragu-ragu' }).tap();
  await expect(page.locator('main').getByText('ragu-ragu', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Nomor', exact: true }).tap();
  const grid = page.getByRole('dialog', { name: 'Nomor soal' });
  const numbers = grid.getByRole('button', { name: /^Soal \d+/ });
  await expect(numbers).toHaveCount(30);
  const size = await smallest(numbers);
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(size.height).toBeGreaterThanOrEqual(44);
  await expect(grid.getByRole('button', { name: 'Soal 1, terjawab', exact: true })).toBeVisible();
  await expect(grid.getByRole('button', { name: 'Soal 2, terjawab, ragu-ragu', exact: true })).toBeVisible();
  await grid.getByRole('button', { name: 'Soal 5, belum dijawab', exact: true }).tap();
  await expect(page.getByText('Soal 5', { exact: true })).toBeVisible();
  expect(await sideScroll(page)).toEqual([]);

  await page.getByRole('button', { name: 'Selesai' }).tap();
  await page.getByRole('button', { name: 'Kirim jawaban' }).tap();
  await page.waitForURL(/#\/results\//);
  await expect(page.getByText('30 soal yang salah, kosong, atau ragu-ragu masuk')).toBeVisible();
  expect(await sideScroll(page)).toEqual([]);

  // Practice: the key shows after a tap, and the answer stays locked.
  await page.goto(`#/simulation?set=${setId}&mode=practice`);
  await page.getByRole('button', { name: 'Mulai latihan' }).tap();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  expect((await smallest(options(page))).height).toBeGreaterThanOrEqual(44);
  await option(page, 'B').tap();
  await expect(page.getByText(/^Pembahasan/).first()).toBeVisible();
  await expect(option(page, KEY)).toBeDisabled();
  expect(await sideScroll(page)).toEqual([]);

  // Notebook: reveal and rate by tapping.
  await page.goto('#/review');
  await expect(page.getByText(/^Soal 1 dari \d+/)).toBeVisible();
  expect((await smallest(options(page))).height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'Tampilkan jawaban' }).tap();
  await page.getByRole('button', { name: /Mudah/ }).tap();
  await expect(page.getByText(/^Soal 2 dari \d+/)).toBeVisible();
  expect(await sideScroll(page)).toEqual([]);
});

test('a picture is cut from the page by dragging a finger, to the size of the area', async ({ page }) => {
  await importChartPage(page);
  const cutter = page.getByTestId('picture-cutter');
  await cutter.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  const b = (await cutter.boundingBox())!;
  const at = (fx: number, fy: number) => ({ x: b.x + b.width * fx, y: b.y + b.height * fy });

  // Real touch events (Playwright's touchscreen only taps): from 15%, 15% to 65%, 45% of the page.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(0.15, 0.15)] });
  for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(0.15 + 0.1 * i, 0.15 + 0.06 * i)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // The page did not scroll instead of drawing the box.
  await expect(page.getByRole('button', { name: 'Tempel gambar' })).toBeEnabled();
  // A finger takes a moment to reach the next button. Without it, Chromium on a phone takes the drag
  // and a tap within about 300 ms for a possible double tap and swallows the click.
  await page.waitForTimeout(500);

  await page.getByLabel('Keterangan gambar (teks alternatif)').fill('Grafik batang penjualan');
  await page.getByRole('button', { name: 'Tempel gambar' }).tap();
  await expect(page.getByText('Gambar ditempel ke soal 3.')).toBeVisible();
  const picture = page.locator('article', { hasText: 'penjualan tertinggi' }).getByRole('img', { name: 'Grafik batang penjualan' });
  await expect(picture).toBeVisible();
  // 50% × 30% of the 600 × 850 page, give or take a pixel of finger position.
  const [w, h] = await picture.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
  expect(Math.abs(w - 300)).toBeLessThanOrEqual(3);
  expect(Math.abs(h - 255)).toBeLessThanOrEqual(3);
  expect(await sideScroll(page)).toEqual([]);
  expect(await seriousViolations(page)).toEqual([]);
});
