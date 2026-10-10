import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { expect, keyAndSet, KEY, test } from './fixtures';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Serious and critical WCAG A/AA violations on the page as it is now, as readable lines. */
async function violations(page: Page): Promise<string[]> {
  // Let CSS transitions finish first: a button that just became enabled is still fading in from
  // half opacity for 150 ms, and axe would measure that passing colour.
  await page.waitForFunction(() => document.getAnimations().every((a) => !(a instanceof CSSTransition) || a.playState !== 'running'));
  const r = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.impact} ${v.id}: ${v.help} → ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
    );
}

const hashPath = (page: Page) => '#/' + page.url().split('#/')[1];

/** Press Tab until `target` has focus; fails if it takes more than `max` presses. */
async function tabTo(page: Page, target: Locator, max = 60) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Could not reach the element with the Tab key.');
}

test('main pages and dialogs have no serious or critical WCAG violations, light and dark', async ({ page }) => {
  test.setTimeout(120_000);
  const setUrl = await keyAndSet(page);
  const setPath = '#/' + setUrl.split('#/')[1];
  const setId = setUrl.split('/').pop();

  // A finished exam (report, progress, notebook), a practice and an exam left open.
  await page.goto(`#/simulation?set=${setId}`);
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press(i % 2 ? KEY.toLowerCase() : 'b');
    await page.keyboard.press('ArrowRight');
  }
  await page.getByRole('button', { name: 'Selesai' }).click();
  await page.getByRole('button', { name: 'Kirim jawaban' }).click();
  await page.waitForURL(/#\/results\//);
  const results = hashPath(page);
  await page.goto(`#/simulation?set=${setId}&mode=practice`);
  await page.getByRole('button', { name: 'Mulai latihan' }).click();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  await page.keyboard.press('b');
  const practice = hashPath(page);
  await page.goto(`#/simulation?set=${setId}`);
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await page.waitForURL(/#\/cat\//);
  const exam = hashPath(page);

  const pages = [
    '#/',
    '#/new',
    setPath,
    '#/sets',
    '#/bank',
    '#/simulation',
    exam,
    practice,
    results,
    '#/progress',
    '#/progress?tab=topik',
    '#/progress?tab=riwayat',
    '#/review',
    '#/review?tab=semua',
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
      found.push(...(await violations(page)).map((v) => `${scheme} ${p}: ${v}`));
    }
    // Dialogs: download, the question editor, rating/reporting a question, and a syllabus profile.
    await page.goto(setPath);
    await page.getByRole('button', { name: /Unduh PDF \/ Word/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    found.push(...(await violations(page)).map((v) => `${scheme} download dialog: ${v}`));
    await page.keyboard.press('Escape');
    await page.locator('article').first().locator('summary', { hasText: '⋯' }).click();
    await page.getByRole('button', { name: 'Edit soal' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    found.push(...(await violations(page)).map((v) => `${scheme} editor dialog: ${v}`));
    await page.keyboard.press('Escape');
    await page.locator('article').first().locator('summary', { hasText: '⋯' }).click();
    await page.getByRole('button', { name: 'Laporkan atau nilai soal' }).click();
    // With a reason picked, so the note field is shown too.
    await page.getByRole('dialog').getByRole('radio', { name: 'Kunci jawaban salah' }).check();
    found.push(...(await violations(page)).map((v) => `${scheme} feedback dialog: ${v}`));
    await page.keyboard.press('Escape');
    await page.goto('#/settings');
    await page.getByRole('button', { name: 'Duplikat & ubah' }).click();
    found.push(...(await violations(page)).map((v) => `${scheme} syllabus profile dialog: ${v}`));
    await page.keyboard.press('Escape');
  }
  expect(found, found.join('\n')).toEqual([]);
});

test('a whole exam can be taken with the keyboard alone, with focus always visible', async ({ page }) => {
  const setUrl = await keyAndSet(page);
  await page.goto(`#/simulation?set=${setUrl.split('/').pop()}`);

  const start = page.getByRole('button', { name: 'Mulai ujian' });
  await tabTo(page, start);
  // The focused control shows a visible outline.
  expect(await start.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Enter');
  await page.waitForURL(/#\/cat\//);

  // Focus lands on the question heading, and moves with every question.
  await expect(page.getByRole('heading', { name: 'Soal 1', exact: true })).toBeFocused();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press(KEY.toLowerCase());
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { name: `Soal ${i + 2}`, exact: true })).toBeFocused();
  }
  // The question grid says what each number's state is.
  await expect(page.getByRole('button', { name: 'Soal 1, terjawab' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Soal 6, belum dijawab' })).toBeAttached();

  // Finish: Tab to the button, open the dialog, Tab to submit.
  await tabTo(page, page.getByRole('button', { name: 'Selesai' }));
  await page.keyboard.press('Enter');
  const submit = page.getByRole('button', { name: 'Kirim jawaban' });
  await expect(submit).toBeVisible();
  await tabTo(page, submit);
  await page.keyboard.press('Enter');
  await page.waitForURL(/#\/results\//);
  await expect(page.locator('.card', { hasText: 'Tes Wawasan Kebangsaan' })).toContainText('5 benar');
});

test('reduced motion turns transitions off, and the text size setting scales the page', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('#/settings');
  const button = page.getByRole('button', { name: 'Unduh cadangan' });
  const seconds = await button.evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
  expect(seconds).toBeLessThan(0.001);

  const rootSize = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  await page.getByLabel('Ukuran teks').selectOption({ label: 'Sangat besar' });
  await expect.poll(rootSize).toBe('20px');
  // Kept across visits. Polled: a read right as reload() resolves can still race the new document.
  await page.reload();
  await expect.poll(rootSize).toBe('20px');
});
