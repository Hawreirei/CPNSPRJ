import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, keyAndSet, KEY, test } from './fixtures';

// Friday 9 and Saturday 10 October 2026 in Jakarta (the suite's time zone). Timers keep running.
const FRIDAY = new Date('2026-10-09T21:00:00+07:00');
const SATURDAY = new Date('2026-10-10T08:00:00+07:00');

async function seriousViolations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
}

test('studying two days in a row makes a streak of 2; badges are announced once; the feature can be switched off', async ({ page }) => {
  await page.clock.setFixedTime(FRIDAY);
  const setUrl = await keyAndSet(page);
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Konsistensi belajar' }) });

  // Nothing studied yet: no card.
  await page.goto('#/');
  await expect(page.getByRole('heading', { name: 'Beranda' })).toBeVisible();
  await expect(card).toHaveCount(0);

  // Friday: one exam, one question answered.
  await page.goto(setUrl);
  await page.getByRole('link', { name: 'Mulai latihan ujian' }).click();
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  await page.keyboard.press(KEY.toLowerCase());
  await page.getByRole('button', { name: 'Selesai' }).click();
  await page.getByRole('button', { name: 'Kirim jawaban' }).click();
  await page.waitForURL(/#\/results\//);

  await page.goto('#/');
  // The dashboard was open before the exam; it must not show the old list.
  await expect(page.getByText('Latihan selesai').locator('..')).toContainText('1');
  await expect(card).toContainText('1 hari beruntun');
  await expect(card).toContainText('Hari ini sudah tercatat.');
  const news = card.getByRole('status');
  await expect(news).toContainText('Lencana baru: Ujian pertama selesai.');
  expect(await seriousViolations(page)).toEqual([]);

  // Announced once: after a reload the badge is listed, not announced again.
  await page.reload();
  await expect(card.getByRole('listitem').filter({ hasText: 'Ujian pertama selesai' })).toBeVisible();
  await expect(news).toBeEmpty();

  // Saturday morning: nothing yet today, the streak still stands.
  await page.clock.setFixedTime(SATURDAY);
  await page.reload();
  await expect(card).toContainText('1 hari beruntun');
  await expect(card).toContainText('menambah streak');

  // One review from the mistake notebook.
  await page.goto('#/review');
  await page.getByRole('button', { name: 'Tampilkan jawaban' }).click();
  await page.getByRole('button', { name: /Baik/ }).click();

  await page.goto('#/');
  await expect(card).toContainText('2 hari beruntun');
  await expect(card).toContainText('Hari ini sudah tercatat.');

  // A pause, then back.
  await card.getByRole('button', { name: 'Jeda streak' }).click();
  await expect(card).toContainText('Streak sedang dijeda');
  await card.getByRole('button', { name: 'Lanjutkan streak' }).click();
  await expect(card).toContainText('2 hari beruntun');
  await expect(card).not.toContainText('dijeda');

  // Switched off: nothing shows.
  await page.goto('#/settings');
  const toggle = page.getByLabel('Tampilkan streak, tanda target harian tercapai, dan lencana');
  // Saved settings come back through the database, so the box updates a moment after the click.
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.goto('#/');
  await expect(page.getByRole('heading', { name: 'Beranda' })).toBeVisible();
  await expect(card).toHaveCount(0);
  await expect(page.getByText('hari beruntun')).toHaveCount(0);
  await expect(page.getByText('Lencana')).toHaveCount(0);
});
